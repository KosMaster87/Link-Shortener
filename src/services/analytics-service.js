/**
 * @fileoverview Business Logic für Link-Analytics
 * @description Speichert Klicks und aggregiert Statistiken pro Short-Link.
 *   Bot-Traffic wird herausgefiltert. IPs werden vor der Speicherung gehasht.
 * @module src/services/analytics-service
 */

import { createHash } from "node:crypto";
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";
import { validatePeriod } from "../utils/validators.js";

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

// Gemeinsame WHERE-Klausel für alle Stats-Queries: schließt Bots aus.
// Als Modul-Konstante statt lokaler Variable, damit alle Query-Funktionen
// dieselbe Bedingung teilen und ein Refactor an einer Stelle wirkt.
const NON_BOT_WHERE = "FROM link_clicks WHERE code = $1 AND is_bot = FALSE";

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
const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "slurp",
  "mediapartners",
  "externalhit",
];

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
 * @param {{ code: string, referrer: string, userAgent: string, ipHash: string, isBot: boolean }} input
 * @returns {Promise<void>}
 */
const insertClick = async ({
  code,
  referrer,
  userAgent,
  ipHash,
  isBot: bot,
}) => {
  await pool.query(
    `INSERT INTO link_clicks (code, referrer, user_agent, ip_hash, is_bot)
     VALUES ($1, $2, $3, $4, $5)`,
    [code, referrer, userAgent, ipHash, bot],
  );
};

/**
 * Bereitet Klick-Daten auf und schreibt sie in die DB.
 * @param {{ linkId: string, referrer: string|null, userAgent: string, ip: string }} input
 * @returns {Promise<void>}
 */
const buildAndInsert = async ({ linkId, referrer, userAgent, ip }) => {
  const safeReferrer = referrer || DIRECT;
  const ipHash = hashIp(ip);
  await insertClick({
    code: linkId,
    referrer: safeReferrer,
    userAgent,
    ipHash,
    isBot: isBot(userAgent),
  });
};

/**
 * Speichert einen Klick für den angegebenen Short-Link.
 * Gibt NOT_FOUND zurück wenn kein Link mit linkId existiert.
 * Bot-Klicks werden als is_bot=true gespeichert und von getStats ignoriert.
 * Ein fehlender Referrer wird als "Direct" gespeichert.
 * Die IP-Adresse wird als SHA-256-Hash gespeichert, nie im Klartext.
 * @param {ClickInput} input
 * @returns {Promise<{ success: true, data: undefined } | { success: false, error: { code: string, message?: string } }>}
 */
export const trackClick = async ({ linkId, referrer, userAgent, ip }) => {
  try {
    if (!(await linkExists(linkId))) return err("NOT_FOUND");
    if (!ip) return err("MISSING_IP");
    await buildAndInsert({ linkId, referrer, userAgent, ip });
    return ok();
  } catch (error) {
    console.error("analytics-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Gibt die Gesamtzahl echter Klicks (ohne Bots) für einen Link zurück.
 * @param {string} code
 * @returns {Promise<import("pg").QueryResult>}
 */
const queryTotalClicks = (code) =>
  pool.query(`SELECT COUNT(*)::int AS count ${NON_BOT_WHERE}`, [code]);

/**
 * Gibt Klickzahlen gruppiert nach Tag zurück, absteigend sortiert.
 * TECH DEBT: Timezone ist hardcodiert auf UTC. Nutzer in UTC+1 sehen Klicks
 * um 23:30 Ortszeit als nächsten Tag. Lösung: konfigurierbare Timezone pro
 * Account oder per Request-Parameter – erst relevant wenn Nutzer das melden.
 * @param {string} code
 * @returns {Promise<import("pg").QueryResult>}
 */
const queryClicksByDay = (code) =>
  pool.query(
    `SELECT TO_CHAR(clicked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            COUNT(*)::int AS count
     ${NON_BOT_WHERE} GROUP BY date ORDER BY date DESC`,
    [code],
  );

/**
 * Gibt Referrer aggregiert und absteigend nach Anzahl sortiert zurück.
 * @param {string} code
 * @returns {Promise<import("pg").QueryResult>}
 */
const queryReferrers = (code) =>
  pool.query(
    `SELECT referrer, COUNT(*)::int AS count
     ${NON_BOT_WHERE} GROUP BY referrer ORDER BY count DESC`,
    [code],
  );

/**
 * Gibt die Anzahl eindeutiger Besucher anhand von ip_hash zurück.
 * @param {string} code
 * @returns {Promise<import("pg").QueryResult>}
 */
const queryUniqueVisitors = (code) =>
  pool.query(`SELECT COUNT(DISTINCT ip_hash)::int AS count ${NON_BOT_WHERE}`, [
    code,
  ]);

/**
 * Führt alle Aggregat-Abfragen für einen Link parallel aus.
 * Bots werden über NON_BOT_WHERE aus allen Metriken ausgeschlossen.
 * @param {string} code
 * @returns {Promise<Stats>}
 */
const queryStats = async (code) => {
  const [total, byDay, referrers, unique] = await Promise.all([
    queryTotalClicks(code),
    queryClicksByDay(code),
    queryReferrers(code),
    queryUniqueVisitors(code),
  ]);
  return {
    totalClicks: total.rows[0].count,
    clicksByDay: byDay.rows,
    topReferrers: referrers.rows,
    uniqueVisitors: unique.rows[0].count,
  };
};

/**
 * @typedef {Object} PeriodCount
 * @property {string} period_start - Periodenbeginn im Format YYYY-MM-DD
 * @property {number} count        - Anzahl Klicks in dieser Periode
 */

/**
 * Gibt Klickzahlen gruppiert nach Periode (day/week/month) zurück, absteigend sortiert.
 * DATE_TRUNC schneidet auf den Periodenanfang — Montag für week, 1. des Monats für month.
 * @param {string} code
 * @param {string} period - "day" | "week" | "month"
 * @returns {Promise<import("pg").QueryResult>}
 */
const queryClicksByPeriod = (code, period) =>
  pool.query(
    `SELECT TO_CHAR(DATE_TRUNC($2, clicked_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
            COUNT(*)::int AS count
     FROM link_clicks
     WHERE code = $1 AND is_bot = FALSE
     GROUP BY period_start ORDER BY period_start DESC`,
    [code, period],
  );

/**
 * Gibt Klickzahlen pro Periode für einen Short-Link zurück.
 * Gibt INVALID_INPUT zurück bei ungültiger Periode.
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * @param {string} code   - Code des Short-Links
 * @param {string} period - "day" | "week" | "month"
 * @returns {Promise<{ success: true, data: PeriodCount[] } | { success: false, error: { code: string, message: string } }>}
 */
export const getClicksByPeriod = async (code, period) => {
  try {
    const validated = validatePeriod(period);
    if (!validated.success) return validated;
    if (!(await linkExists(code))) return err("NOT_FOUND");
    const { rows } = await queryClicksByPeriod(code, period);
    return ok(rows);
  } catch (error) {
    console.error("analytics-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Gibt Referrer-Aggregation für einen Short-Link zurück, absteigend nach Anzahl.
 * Null-Referrer erscheinen als "Direct" (gespeichert durch trackClick).
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * @param {string} code - Code des Short-Links
 * @returns {Promise<{ success: true, data: ReferrerCount[] } | { success: false, error: { code: string, message?: string } }>}
 */
export const getReferrers = async (code) => {
  try {
    if (!(await linkExists(code))) return err("NOT_FOUND");
    const { rows } = await queryReferrers(code);
    return ok(rows);
  } catch (error) {
    console.error("analytics-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * @typedef {Object} DeviceStats
 * @property {number} mobile  - Anzahl Klicks von mobilen Geräten
 * @property {number} tablet  - Anzahl Klicks von Tablets
 * @property {number} desktop - Anzahl Klicks von Desktop-Geräten
 */

// Patterns spiegeln TABLET_PATTERNS / MOBILE_PATTERNS aus device-classifier.js wider.
// Bei Änderungen dort müssen diese Arrays synchron gehalten werden.
const TABLET_LIKE = ["%ipad%", "%tablet%", "%kindle%", "%playbook%", "%silk%"];
const MOBILE_LIKE = [
  "%mobile%",
  "%android%",
  "%iphone%",
  "%ipod%",
  "%blackberry%",
  "%windows phone%",
  "%opera mini%",
];

/**
 * Aggregiert Geräte-Verteilung direkt in SQL via CTE + CASE/WHEN.
 * Gibt immer genau 1 Zeile zurück (0-Werte wenn keine Klicks vorhanden).
 * Tablet-Priorität ist durch CASE-Reihenfolge garantiert (identisch zu classifyDevice).
 * @param {string} code
 * @returns {Promise<import("pg").QueryResult>}
 */
const queryDeviceStats = (code) =>
  pool.query(
    `WITH classified AS (
       SELECT CASE
         WHEN lower(user_agent) LIKE ANY($2) THEN 'tablet'
         WHEN lower(user_agent) LIKE ANY($3) THEN 'mobile'
         ELSE 'desktop'
       END AS device
       FROM link_clicks
       WHERE code = $1 AND is_bot = FALSE AND user_agent IS NOT NULL
     )
     SELECT
       COUNT(*) FILTER (WHERE device = 'tablet')::int AS tablet,
       COUNT(*) FILTER (WHERE device = 'mobile')::int AS mobile,
       COUNT(*) FILTER (WHERE device = 'desktop')::int AS desktop
     FROM classified`,
    [code, TABLET_LIKE, MOBILE_LIKE],
  );

/**
 * Gibt Geräte-Verteilung (mobile/tablet/desktop) für einen Short-Link zurück.
 * Aggregation erfolgt vollständig in SQL — kein In-Memory-Scan der Rohdaten.
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * @param {string} code - Code des Short-Links
 * @returns {Promise<{ success: true, data: DeviceStats } | { success: false, error: { code: string, message?: string } }>}
 */
export const getDeviceStats = async (code) => {
  try {
    if (!(await linkExists(code))) return err("NOT_FOUND");
    const { rows } = await queryDeviceStats(code);
    return ok(rows[0]);
  } catch (error) {
    console.error("analytics-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Gibt aggregierte Statistiken für einen Short-Link zurück.
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * Bot-Klicks (is_bot=TRUE) fließen in keine Metrik ein.
 * @param {string} code - Code des Short-Links
 * @returns {Promise<{ success: true, data: Stats } | { success: false, error: { code: string, message?: string } }>}
 */
export const getStats = async (code) => {
  try {
    if (!(await linkExists(code))) return err("NOT_FOUND");
    const stats = await queryStats(code);
    return ok(stats);
  } catch (error) {
    console.error("analytics-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};
