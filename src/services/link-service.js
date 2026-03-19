import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";

/**
 * @typedef {Object} Link
 * @property {string} code         - 6-stelliger alphanumerischer Slug (Primary Key)
 * @property {string} originalUrl  - Die vollständige Ziel-URL
 * @property {Date}   createdAt    - Zeitpunkt der Erstellung
 */

/**
 * @typedef {Object} CreateLinkInput
 * @property {string}  url    - Die lange Ziel-URL (required)
 * @property {string}  [alias] - Optionaler Custom-Slug (optional)
 */

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const generateSlug = () =>
  Array.from(
    { length: 6 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)],
  ).join("");

const toLink = (row) => ({
  code: row.code,
  originalUrl: row.original_url,
  createdAt: row.created_at,
});

export const createLink = async ({ url, alias } = {}) => {
  try {
    new URL(url);
  } catch {
    return err("INVALID_URL");
  }

  const code = alias ?? generateSlug();
  const existing = await pool.query(
    "SELECT code FROM short_links WHERE code = $1",
    [code],
  );
  if (existing.rows.length > 0) return err("SLUG_TAKEN");

  const result = await pool.query(
    "INSERT INTO short_links (code, original_url) VALUES ($1, $2) RETURNING *",
    [code, url],
  );
  return ok(toLink(result.rows[0]));
};

export const getLink = async (code) => {
  const result = await pool.query("SELECT * FROM short_links WHERE code = $1", [
    code,
  ]);
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok(toLink(result.rows[0]));
};

export const getAllLinks = async () => {
  const result = await pool.query(
    "SELECT * FROM short_links ORDER BY created_at DESC",
  );
  return ok(result.rows.map(toLink));
};

export const deleteLink = async (code) => {
  const result = await pool.query(
    "DELETE FROM short_links WHERE code = $1 RETURNING code",
    [code],
  );
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok();
};
