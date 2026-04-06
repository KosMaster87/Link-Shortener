/**
 * @fileoverview Business Logic für Dashboard-Aggregationen
 * @description Liefert globale Übersichtszahlen, Top-Links, Zeitreihen
 *   und Referrer-Aufschlüsselung für das Admin-Dashboard.
 * @module src/services/dashboard-service
 */
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";
import { validateDays, validateLimit } from "../utils/validators.js";

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
 * @property {string} source - Referrer-URL oder "Direct"
 * @property {number} clicks - Klicks von dieser Quelle
 */

const queryOverview = () =>
  pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM short_links WHERE is_active = TRUE) AS total_links,
      (SELECT COUNT(*)::int FROM link_clicks
        WHERE is_bot = FALSE AND code IS NOT NULL)                    AS total_clicks
  `);

const queryTopLinks = (limit) =>
  pool.query(
    `SELECT sl.code, sl.original_url, sl.description,
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
    `SELECT COALESCE(referrer, 'Direct') AS source, COUNT(*)::int AS clicks
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
 * Gibt Referrer-Verteilung für einen Link zurück. Null-Referrer erscheinen als "Direct".
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
