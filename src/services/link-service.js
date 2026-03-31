/**
 * @fileoverview Business Logic für Short-Links
 * @description Erstellt, liest und löscht Short-Links in der Datenbank.
 *   Generiert zufällige Slugs und validiert URLs.
 * @module src/services/link-service
 */
import { randomBytes } from "node:crypto";
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";

/**
 * @typedef {Object} Link
 * @property {string}  code        - 6-stelliger alphanumerischer Slug (Primary Key)
 * @property {string}  originalUrl - Die vollständige Ziel-URL
 * @property {Date}    createdAt   - Zeitpunkt der Erstellung
 * @property {boolean} isActive    - Ob der Link aktiv (weiterleitend) ist
 */

/**
 * @typedef {Object} CreateLinkInput
 * @property {string}  url    - Die lange Ziel-URL (required)
 * @property {string}  [alias] - Optionaler Custom-Slug (optional)
 */

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// These slug names conflict with server routes — /api, /dashboard etc. would
// be intercepted by the router before the redirect handler runs.
const RESERVED = new Set([
  "api",
  "admin",
  "dashboard",
  "login",
  "logout",
  "static",
]);
const SLUG_LENGTH = 6;
// 3 is enough: at 62^6 ≈ 56B slots, consecutive collisions signal a bug, not bad luck.
const MAX_SLUG_ATTEMPTS = 3;
const ALIAS_MAX_LENGTH = 50;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const generateSlug = () => {
  const bytes = randomBytes(SLUG_LENGTH);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
};

const toLink = (row) => ({
  code: row.code,
  originalUrl: row.original_url,
  createdAt: row.created_at,
  isActive: row.is_active,
  userId: row.user_id ?? null,
});

/**
 * Prüft ob eine URL sicher ist: nur http/https, keine internen Hosts,
 * keine gefährlichen Protokolle (javascript:, data:, file: etc.).
 * @param {string} url
 * @returns {boolean}
 */
const isValidUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    if (BLOCKED_HOSTS.has(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
};

/**
 * Prüft ob ein Custom-Alias verwendbar ist.
 * Gibt INVALID_INPUT zurück bei ungültiger Länge oder reserviertem Namen.
 * Gibt SLUG_TAKEN zurück wenn der Alias bereits in der DB existiert.
 * @param {string} alias
 * @returns {Promise<{ success: true, data: string } | { success: false, error: Object }>}
 */
const validateAlias = async (alias) => {
  if (
    typeof alias !== "string" ||
    alias.length < 1 ||
    alias.length > ALIAS_MAX_LENGTH
  )
    return err({
      code: "INVALID_INPUT",
      message: `Alias muss 1–${ALIAS_MAX_LENGTH} Zeichen lang sein.`,
    });
  if (RESERVED.has(alias)) return err("SLUG_TAKEN");
  const existing = await pool.query(
    "SELECT code FROM short_links WHERE code = $1",
    [alias],
  );
  if (existing.rows.length > 0) return err("SLUG_TAKEN");
  return ok(alias);
};

/**
 * Generiert zufällige Slugs und prüft ihre Verfügbarkeit in der DB.
 * Gibt SLUG_TAKEN zurück wenn nach MAX_SLUG_ATTEMPTS Versuchen
 * kein freier Slug gefunden wurde (sehr unwahrscheinlich).
 * @returns {Promise<{ success: true, data: string } | { success: false, error: string }>}
 */
const findAvailableSlug = async () => {
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
    const code = generateSlug();
    const { rows } = await pool.query(
      "SELECT code FROM short_links WHERE code = $1",
      [code],
    );
    const taken = rows.length > 0;
    if (!taken) return ok(code);
  }
  return err("SLUG_TAKEN");
};

/**
 * Schreibt einen neuen Short-Link in die DB und gibt ihn als Link-Objekt zurück.
 * @param {string} code - Slug für den neuen Link
 * @param {string} url - Original-URL
 * @param {string | null} userId - UUID des Besitzers (oder null)
 * @returns {Promise<{ success: true, data: Link }>}
 */
const insertLink = async (code, url, userId) => {
  const result = await pool.query(
    "INSERT INTO short_links (code, original_url, user_id) VALUES ($1, $2, $3) RETURNING *",
    [code, url, userId ?? null],
  );
  return ok(toLink(result.rows[0]));
};

/**
 * Erstellt einen neuen Short-Link und gibt ihn zurück.
 * Gibt INVALID_URL zurück wenn die URL kein sicheres http/https-Format hat.
 * Gibt SLUG_TAKEN zurück wenn alias vergeben/reserviert ist oder kein
 * freier zufälliger Slug gefunden werden konnte.
 * @param {CreateLinkInput} input - URL, optionaler Alias
 * @param {string | null} userId - UUID des eingeloggten Users
 * @returns {Promise<{ success: true, data: Link } | { success: false, error: { code: string, message: string } }>}
 */
export const createLink = async ({ url, alias } = {}, userId = null) => {
  if (!isValidUrl(url)) return err("INVALID_URL");
  if (alias) {
    const aliasResult = await validateAlias(alias);
    if (!aliasResult.success) return aliasResult;
    return insertLink(alias, url, userId);
  }
  const slugResult = await findAvailableSlug();
  if (!slugResult.success) return slugResult;
  return insertLink(slugResult.data, url, userId);
};

/**
 * Sucht einen Short-Link anhand seines Codes in der DB.
 * Gibt NOT_FOUND zurück wenn kein Eintrag mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @returns {Promise<{ success: true, data: Link } | { success: false, error: { code: string, message: string } }>}
 */
export const getLink = async (code) => {
  const result = await pool.query("SELECT * FROM short_links WHERE code = $1", [
    code,
  ]);
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok(toLink(result.rows[0]));
};

/**
 * Lädt alle Short-Links eines Users aus der DB (nach created_at DESC).
 * Ohne userId werden alle Links zurückgegeben (Backward-Compat für Public-GET).
 * @param {string | null} userId
 * @returns {Promise<{ success: true, data: Link[] }>}
 */
export const getAllLinks = async (userId = null) => {
  const result = userId
    ? await pool.query(
        "SELECT * FROM short_links WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      )
    : await pool.query("SELECT * FROM short_links ORDER BY created_at DESC");
  return ok(result.rows.map(toLink));
};

/**
 * Löscht den Short-Link mit dem gegebenen Code aus der DB.
 * Gibt NOT_FOUND zurück wenn kein Eintrag mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @returns {Promise<{ success: true, data: undefined } | { success: false, error: { code: string, message: string } }>}
 */
export const deleteLink = async (code) => {
  const result = await pool.query(
    "DELETE FROM short_links WHERE code = $1 RETURNING code",
    [code],
  );
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok();
};

/**
 * Aktualisiert die original_url eines bestehenden Short-Links.
 * Gibt INVALID_URL zurück wenn die neue URL kein gültiges Format hat.
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @param {string} url - Neue Ziel-URL
 * @returns {Promise<{ success: true, data: Link } | { success: false, error: { code: string, message: string } }>}
 */
export const updateLink = async (code, url) => {
  if (!isValidUrl(url)) return err("INVALID_URL");
  const result = await pool.query(
    "UPDATE short_links SET original_url = $1 WHERE code = $2 RETURNING *",
    [url, code],
  );
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok(toLink(result.rows[0]));
};

/**
 * Gibt alle Short-Links zurück, die in den letzten `days` Tagen keinen Klick hatten.
 * Berücksichtigt auch Links ohne Klick-Einträge (LEFT JOIN).
 * Optional kann nach Besitzer gefiltert werden, damit Tests und spätere
 * User-Dashboards nicht von fremden Daten beeinflusst werden.
 * Gibt INVALID_DAYS zurück wenn `days` keine positive ganze Zahl ist.
 * @param {number} days - Zeitraum in Tagen (muss > 0 sein)
 * @param {string | null} userId - Optionaler Besitzer-Filter
 * @returns {Promise<{ success: true, data: Link[] } | { success: false, error: { code: string, message: string } }>}
 */
export const getInactiveLinks = async (days, userId = null) => {
  if (!Number.isInteger(days) || days <= 0) return err("INVALID_DAYS");
  const start = performance.now();
  // Time filter in ON, not WHERE — keeps links with zero matching clicks in the result set.
  // Moving this to WHERE would turn the LEFT JOIN into an INNER JOIN.
  const query = userId
    ? `SELECT sl.* FROM short_links sl
       LEFT JOIN link_clicks lc
         ON lc.code = sl.code AND lc.clicked_at >= NOW() - ($1 * INTERVAL '1 day')
       WHERE sl.user_id = $2
       GROUP BY sl.code
       HAVING MAX(lc.clicked_at) IS NULL
       ORDER BY sl.created_at DESC`
    : `SELECT sl.* FROM short_links sl
       LEFT JOIN link_clicks lc
         ON lc.code = sl.code AND lc.clicked_at >= NOW() - ($1 * INTERVAL '1 day')
       GROUP BY sl.code
       HAVING MAX(lc.clicked_at) IS NULL
       ORDER BY sl.created_at DESC`;
  const params = userId ? [days, userId] : [days];
  const { rows } = await pool.query(query, params);
  const ms = (performance.now() - start).toFixed(2);
  console.log(
    `[getInactiveLinks] days=${days} found=${rows.length} duration=${ms}ms`,
  );
  return ok(rows.map(toLink));
};

/**
 * Schaltet is_active eines Short-Links um (true → false, false → true).
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @returns {Promise<{ success: true, data: Link } | { success: false, error: { code: string, message: string } }>}
 */
export const toggleActive = async (code) => {
  const result = await pool.query(
    "UPDATE short_links SET is_active = NOT is_active WHERE code = $1 RETURNING *",
    [code],
  );
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok(toLink(result.rows[0]));
};
