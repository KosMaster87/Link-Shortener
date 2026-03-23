/**
 * @fileoverview Business Logic für Link-Analytics
 * @description Speichert Klicks und aggregiert Statistiken pro Short-Link.
 *   Bot-Traffic wird herausgefiltert. IPs werden vor der Speicherung gehasht.
 * @module src/services/analytics-service
 */
import { createHash } from "node:crypto";
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";

/**
 * @typedef {Object} ClickInput
 * @property {string}      linkId    - Code des Short-Links
 * @property {string|null} referrer  - Herkunfts-URL (null → "Direct")
 * @property {string}      userAgent - Browser-/Bot-Identifikation
 * @property {string}      ip        - Client-IP (wird gehasht gespeichert)
 */

/**
 * @typedef {Object} DayCount
 * @property {string} date  - Datum im Format YYYY-MM-DD
 * @property {number} count - Anzahl Klicks an diesem Tag
 */

/**
 * @typedef {Object} ReferrerCount
 * @property {string} referrer - Herkunfts-URL oder "Direct"
 * @property {number} count    - Anzahl Klicks von diesem Referrer
 */

/**
 * @typedef {Object} Stats
 * @property {number}          totalClicks    - Gesamtklicks (ohne Bots)
 * @property {DayCount[]}      clicksByDay    - Klicks gruppiert nach Datum
 * @property {ReferrerCount[]} topReferrers   - Referrer absteigend nach Anzahl
 * @property {number}          uniqueVisitors - Anzahl eindeutiger ip_hashes
 */

const DIRECT = "Direct";

// Bekannte Bot-Substring-Muster (lowercase). Ein User-Agent der einen dieser
// Strings enthält, wird als Bot klassifiziert und nicht in die Statistik gezählt.
//
// Bekannte Preview-Bots von Social-Media-Plattformen und Suchmaschinen.
// Twitterbot/LinkedInBot treffen "bot"; facebookexternalhit braucht ein
// eigenes Pattern, da Facebook keinen "bot"-String im User-Agent verwendet.
//
// TECH DEBT: "bot" ist ein breites Muster. Slackbot und ähnliche App-Bots
// könnten je nach Use-Case als legitimer Traffic gelten. Vor einer Erweiterung
// der Allowlist sollte echter Traffic analysiert werden.
const BOT_PATTERNS = ["bot", "crawler", "spider", "slurp", "mediapartners", "externalhit"];

/**
 * Prüft ob ein User-Agent zu einem bekannten Bot gehört.
 * @param {string} userAgent
 * @returns {boolean}
 */
const isBot = (userAgent) => {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => lower.includes(pattern));
};

/**
 * Erstellt einen SHA-256-Hash der IP-Adresse zur anonymisierten Speicherung.
 * @param {string} ip
 * @returns {string}
 */
const hashIp = (ip) => createHash("sha256").update(ip).digest("hex");

/**
 * Prüft ob ein Short-Link mit dem gegebenen Code in der DB existiert.
 * @param {string} code
 * @returns {Promise<boolean>}
 */
const linkExists = async (code) => {
  const { rows } = await pool.query(
    "SELECT code FROM short_links WHERE code = $1",
    [code],
  );
  return rows.length > 0;
};

/**
 * Schreibt einen Klick in die DB.
 * @param {string}  code
 * @param {string}  referrer
 * @param {string}  userAgent
 * @param {string}  ipHash
 * @param {boolean} bot
 * @returns {Promise<void>}
 */
// TECH DEBT (#4): 5 positionale String-Parameter – bei einer Erweiterung (z.B.
// country hinzufügen) ist stille Verwechslung möglich. Auf Objekt-Parameter
// umstellen: insertClick({ code, referrer, userAgent, ipHash, isBot })
const insertClick = async (code, referrer, userAgent, ipHash, bot) => {
  await pool.query(
    `INSERT INTO link_clicks (code, referrer, user_agent, ip_hash, is_bot)
     VALUES ($1, $2, $3, $4, $5)`,
    [code, referrer, userAgent, ipHash, bot],
  );
};

/**
 * Speichert einen Klick für den angegebenen Short-Link.
 * Gibt NOT_FOUND zurück wenn kein Link mit linkId existiert.
 * Bot-Klicks werden als is_bot=true gespeichert und von getStats ignoriert.
 * Ein fehlender Referrer wird als "Direct" gespeichert.
 * Die IP-Adresse wird als SHA-256-Hash gespeichert, nie im Klartext.
 * @param {ClickInput} input
 * @returns {Promise<{ success: true, data: undefined } | { success: false, error: string }>}
 */
export const trackClick = async ({ linkId, referrer, userAgent, ip }) => {
  if (!(await linkExists(linkId))) return err("NOT_FOUND");
  if (!ip) return err("MISSING_IP");
  const safeReferrer = referrer || DIRECT;
  const ipHash = hashIp(ip);
  const bot = isBot(userAgent);
  await insertClick(linkId, safeReferrer, userAgent, ipHash, bot);
  return ok();
};

/**
 * Führt alle Aggregat-Abfragen für einen Link parallel aus.
 * Bots werden über is_bot=FALSE ausgeschlossen.
 * @param {string} code
 * @returns {Promise<Stats>}
 */
// TECH DEBT (#2/#5): queryStats überschreitet das 14-Zeilen-Limit (CLAUDE.md).
// Jede Aggregat-Abfrage in eine eigene Funktion auslagern:
//   const queryTotalClicks = (code) => pool.query(...)
//   const queryClicksByDay  = (code) => pool.query(...)
// Die base-Konstante wird dann zu einer expliziten Konstante NON_BOT_WHERE
// statt per Template-Literal in 4 Queries injiziert zu werden.
const queryStats = async (code) => {
  const base = "FROM link_clicks WHERE code = $1 AND is_bot = FALSE";
  const [total, byDay, referrers, unique] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count ${base}`, [code]),
    // TECH DEBT: Timezone ist hardcodiert auf UTC. Nutzer in UTC+1 sehen Klicks
    // um 23:30 Ortszeit als nächsten Tag. Lösung: konfigurierbare Timezone pro
    // Account oder per Request-Parameter – erst relevant wenn Nutzer das melden.
    pool.query(
      `SELECT TO_CHAR(clicked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
              COUNT(*)::int AS count
       ${base} GROUP BY date ORDER BY date DESC`,
      [code],
    ),
    pool.query(
      `SELECT referrer, COUNT(*)::int AS count
       ${base} GROUP BY referrer ORDER BY count DESC`,
      [code],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT ip_hash)::int AS count ${base}`,
      [code],
    ),
  ]);
  return {
    totalClicks: total.rows[0].count,
    clicksByDay: byDay.rows,
    topReferrers: referrers.rows,
    uniqueVisitors: unique.rows[0].count,
  };
};

/**
 * Gibt aggregierte Statistiken für einen Short-Link zurück.
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * Bot-Klicks (is_bot=TRUE) fließen in keine Metrik ein.
 * @param {string} code - Code des Short-Links
 * @returns {Promise<{ success: true, data: Stats } | { success: false, error: string }>}
 */
export const getStats = async (code) => {
  if (!(await linkExists(code))) return err("NOT_FOUND");
  const stats = await queryStats(code);
  return ok(stats);
};
