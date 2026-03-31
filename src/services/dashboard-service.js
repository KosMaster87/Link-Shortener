/**
 * @fileoverview Business Logic für Dashboard-Aggregationen
 * @description Liefert globale Übersichtszahlen, Top-Links, Zeitreihen
 *   und Referrer-Aufschlüsselung für das Admin-Dashboard.
 * @module src/services/dashboard-service
 */
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";

/**
 * @typedef {Object} OverviewStats
 * @property {number} total_links        - Anzahl aktiver Links
 * @property {number} total_clicks       - Gesamtklicks ohne Bot-Traffic
 * @property {number} avg_clicks_per_link - Ø Klicks pro aktivem Link
 */

/**
 * @typedef {Object} TopLink
 * @property {string} code         - Short-Link-Code
 * @property {string} original_url - Ursprungs-URL
 * @property {number} clicks       - Klicks ohne Bot-Traffic
 */

/**
 * @typedef {Object} DayCount
 * @property {string} day    - Datum YYYY-MM-DD (UTC)
 * @property {number} clicks - Klicks an diesem Tag
 */

/**
 * @typedef {Object} ReferrerCount
 * @property {string} source - Referrer-URL oder "direct"
 * @property {number} clicks - Klicks von dieser Quelle
 */

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

const queryOverview = () =>
  pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM short_links WHERE is_active = TRUE) AS total_links,
      (SELECT COUNT(*)::int FROM link_clicks
        WHERE is_bot = FALSE AND code IS NOT NULL)                    AS total_clicks
  `);

const queryTopLinks = (limit) =>
  pool.query(
    `SELECT sl.code, sl.original_url,
            COUNT(lc.id) FILTER (WHERE lc.is_bot = FALSE)::int AS clicks
     FROM short_links sl
     LEFT JOIN link_clicks lc ON sl.code = lc.code
     WHERE sl.is_active = TRUE
     GROUP BY sl.code, sl.original_url
     ORDER BY clicks DESC
     LIMIT $1`,
    [limit],
  );

const queryClicksPerDay = (days) =>
  pool.query(
    `SELECT TO_CHAR(DATE_TRUNC('day', clicked_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS clicks
     FROM link_clicks
     WHERE is_bot = FALSE
       AND code IS NOT NULL
       AND clicked_at >= NOW() - make_interval(days => $1)
     GROUP BY day
     ORDER BY day`,
    [days],
  );

const queryReferrers = (code) =>
  pool.query(
    `SELECT COALESCE(referrer, 'direct') AS source, COUNT(*)::int AS clicks
     FROM link_clicks
     WHERE code = $1
       AND is_bot = FALSE
     GROUP BY source
     ORDER BY clicks DESC
     LIMIT 10`,
    [code],
  );

/**
 * Prüft ob ein Short-Link-Code in der DB existiert.
 * @param {string} code
 * @returns {Promise<boolean>}
 */
const codeExists = async (code) => {
  const { rows } = await pool.query(
    "SELECT code FROM short_links WHERE code = $1",
    [code],
  );
  return rows.length > 0;
};

/**
 * Validiert limit: muss ganzzahlig und im Bereich MIN_LIMIT–MAX_LIMIT liegen.
 * @param {number} limit
 * @returns {{ success: true, data: number } | { success: false, error: object }}
 */
const validateLimit = (limit) => {
  if (!Number.isInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT)
    return err({
      code: "INVALID_INPUT",
      message: `limit must be ${MIN_LIMIT}–${MAX_LIMIT}. Received: ${limit}`,
    });
  return ok(limit);
};

/**
 * Validiert days: muss ganzzahlig und im Bereich MIN_DAYS–MAX_DAYS liegen.
 * @param {number} days
 * @returns {{ success: true, data: number } | { success: false, error: object }}
 */
const validateDays = (days) => {
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS)
    return err({
      code: "INVALID_INPUT",
      message: `days must be ${MIN_DAYS}–${MAX_DAYS}. Received: ${days}`,
    });
  return ok(days);
};

/**
 * Gibt globale Übersichtszahlen zurück: aktive Links, Gesamtklicks (ohne Bots),
 * Ø Klicks pro aktivem Link.
 * @returns {Promise<{ success: true, data: OverviewStats } | { success: false, error: { code: string, message: string } }>}
 */
export const getOverviewStats = async () => {
  try {
    const { rows } = await queryOverview();
    if (!rows[0]) return err({ code: "DB_ERROR", message: "Datenbankfehler." });
    const { total_links, total_clicks } = rows[0];
    const avg_clicks_per_link =
      total_links === 0
        ? 0
        : parseFloat((total_clicks / total_links).toFixed(2));
    return ok({ total_links, total_clicks, avg_clicks_per_link });
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Gibt Links absteigend nach Klickzahl zurück. Links mit 0 Klicks erscheinen am Ende.
 * @param {number} limit - Maximale Anzahl Einträge (1–100)
 * @returns {Promise<{ success: true, data: TopLink[] } | { success: false, error: { code: string, message: string } }>}
 */
export const getTopLinks = async (limit) => {
  const validation = validateLimit(limit);
  if (!validation.success) return validation;
  try {
    const { rows } = await queryTopLinks(limit);
    return ok(rows);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Gibt Klicks pro Tag für die letzten n Tage zurück (UTC-normiert).
 * @param {number} days - Anzahl Tage zurück ab jetzt (1–365)
 * @returns {Promise<{ success: true, data: DayCount[] } | { success: false, error: { code: string, message: string } }>}
 */
export const getClicksPerDay = async (days) => {
  const validation = validateDays(days);
  if (!validation.success) return validation;
  try {
    const { rows } = await queryClicksPerDay(days);
    return ok(rows);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Gibt Referrer-Verteilung für einen Link zurück. Null-Referrer erscheinen als "direct".
 * Gibt NOT_FOUND zurück wenn der Code nicht existiert.
 * @param {string} code - Short-Link-Code
 * @returns {Promise<{ success: true, data: ReferrerCount[] } | { success: false, error: { code: string, message: string } }>}
 */
export const getReferrerBreakdown = async (code) => {
  try {
    if (!(await codeExists(code)))
      return err({ code: "NOT_FOUND", message: "Nicht gefunden." });
    const { rows } = await queryReferrers(code);
    return ok(rows);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};
