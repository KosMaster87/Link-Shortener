import { pool } from "../db/index.js";
import { ok } from "../utils/result.js";

/**
 * @typedef {Object} Click
 * @property {number}      id         - Auto-increment ID
 * @property {string}      code       - FK → Link.code
 * @property {Date}        clickedAt  - Zeitpunkt des Klicks
 * @property {string|null} referrer   - Herkunfts-URL (kann fehlen)
 * @property {string|null} userAgent  - Browser/Client-String (kann fehlen)
 */

/**
 * @typedef {Object} RecordClickInput
 * @property {string}      code       - Slug des aufgerufenen Links
 * @property {string|null} referrer   - Aus Request-Header "Referer"
 * @property {string|null} userAgent  - Aus Request-Header "User-Agent"
 */

const toClick = (row) => ({
  id: row.id,
  code: row.code,
  clickedAt: row.clicked_at,
  referrer: row.referrer,
  userAgent: row.user_agent,
});

export const recordClick = async ({ code, referrer, userAgent }) => {
  await pool.query(
    "INSERT INTO link_clicks (code, referrer, user_agent) VALUES ($1, $2, $3)",
    [code, referrer ?? null, userAgent ?? null],
  );
  return ok();
};

export const getClicksByCode = async (code) => {
  const result = await pool.query(
    "SELECT * FROM link_clicks WHERE code = $1 ORDER BY clicked_at DESC",
    [code],
  );
  return ok(result.rows.map(toClick));
};
