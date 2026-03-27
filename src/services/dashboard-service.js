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

const queryOverview = () =>
  pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM short_links WHERE is_active = TRUE)  AS total_links,
      (SELECT COUNT(*)::int FROM link_clicks
        WHERE is_bot = FALSE AND code IS NOT NULL)                     AS total_clicks,
      ROUND(
        (SELECT COUNT(*)::numeric FROM link_clicks
          WHERE is_bot = FALSE AND code IS NOT NULL) /
        NULLIF((SELECT COUNT(*) FROM short_links WHERE is_active = TRUE), 0),
        2
      )::float                                                         AS avg_clicks_per_link
  `);

const queryTopLinks = (limit) =>
  pool.query(
    `SELECT sl.code, sl.original_url,
            COUNT(lc.id) FILTER (WHERE lc.is_bot = FALSE)::int AS clicks
     FROM short_links sl
     LEFT JOIN link_clicks lc ON sl.code = lc.code
     GROUP BY sl.code, sl.original_url
     ORDER BY clicks DESC
     LIMIT $1`,
    [limit],
  );

const queryClicksPerDay = (days) =>
  pool.query(
    `SELECT DATE_TRUNC('day', clicked_at AT TIME ZONE 'UTC')::date AS day,
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
 * Gibt globale Übersichtszahlen zurück: aktive Links, Gesamtklicks (ohne Bots),
 * Ø Klicks pro aktivem Link.
 * @returns {Promise<{ success: true, data: OverviewStats } | { success: false, error: string }>}
 */
export const getOverviewStats = async () => {
  try {
    const { rows } = await queryOverview();
    return ok(rows[0]);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err("DB_ERROR");
  }
};

/**
 * Gibt Links absteigend nach Klickzahl zurück. Links mit 0 Klicks erscheinen am Ende.
 * @param {number} limit - Maximale Anzahl Einträge
 * @returns {Promise<{ success: true, data: TopLink[] } | { success: false, error: string }>}
 */
export const getTopLinks = async (limit) => {
  try {
    const { rows } = await queryTopLinks(limit);
    return ok(rows);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err("DB_ERROR");
  }
};

/**
 * Gibt Klicks pro Tag für die letzten n Tage zurück (UTC-normiert).
 * @param {number} days - Anzahl Tage zurück ab jetzt
 * @returns {Promise<{ success: true, data: DayCount[] } | { success: false, error: string }>}
 */
export const getClicksPerDay = async (days) => {
  try {
    const { rows } = await queryClicksPerDay(days);
    return ok(rows);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err("DB_ERROR");
  }
};

/**
 * Gibt Referrer-Verteilung für einen Link zurück. Null-Referrer erscheinen als "direct".
 * @param {string} code - Short-Link-Code
 * @returns {Promise<{ success: true, data: ReferrerCount[] } | { success: false, error: string }>}
 */
export const getReferrerBreakdown = async (code) => {
  try {
    const { rows } = await queryReferrers(code);
    return ok(rows);
  } catch (error) {
    console.error("dashboard-service error:", error);
    return err("DB_ERROR");
  }
};
