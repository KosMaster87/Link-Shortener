/**
 * @fileoverview Business Logic für Short-Links
 * @description Erstellt, liest und löscht Short-Links in der Datenbank.
 *   Generiert zufällige Slugs und validiert URLs.
 * @module src/services/link-service
 */

import { randomBytes } from "node:crypto";
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";
import { isValidUrl, validateAlias } from "../utils/validators.js";

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
const SLUG_LENGTH = 6;
// 3 is enough: at 62^6 ≈ 56B slots, consecutive collisions signal a bug, not bad luck.
const MAX_SLUG_ATTEMPTS = 3;

const generateSlug = () => {
  const bytes = randomBytes(SLUG_LENGTH);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
};

const toLink = (row) => ({
  code: row.code,
  originalUrl: row.original_url,
  description: row.description ?? null,
  createdAt: row.created_at,
  isActive: row.is_active,
  userId: row.user_id ?? null,
});

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
    const aliasResult = await validateAlias(alias, pool);
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
 * Reichert jeden Link mit der Klickanzahl (ohne Bot-Traffic) an.
 * Ohne userId wird ein leeres Array zurückgegeben – nicht alle Links aller User.
 * @param {string | null} userId
 * @returns {Promise<{ success: true, data: Array<Link & { clickCount: number }> }>}
 */
export const getAllLinks = async (userId = null) => {
  if (!userId) return ok([]);
  const { rows } = await pool.query(
    `SELECT sl.*, COUNT(lc.id) FILTER (WHERE lc.is_bot = FALSE)::int AS click_count
     FROM short_links sl
     LEFT JOIN link_clicks lc ON sl.code = lc.code
     WHERE sl.user_id = $1
     GROUP BY sl.code
     ORDER BY sl.created_at DESC`,
    [userId],
  );
  return ok(
    rows.map((row) => ({ ...toLink(row), clickCount: row.click_count ?? 0 })),
  );
};

// ── Atomare Ownership-Queries (eine DB-Operation für Check + Write) ────────────

/**
 * Prüft Existenz und Ownership in einer atomaren Query via CTE.
 * LEFT JOIN liefert 0 Rows wenn Code nicht existiert, 1 Row mit
 * upd.code = null wenn der Link existiert aber userId nicht passt.
 */
const queryOwned = (writeCte, params) =>
  pool.query(
    `WITH target AS (SELECT code AS tc FROM short_links WHERE code = $1),
     upd AS (${writeCte})
     SELECT target.tc, upd.* FROM target LEFT JOIN upd ON true`,
    params,
  );

/**
 * Löscht den Short-Link mit dem gegebenen Code aus der DB.
 * Mit userId: atomar – prüft Ownership in derselben Operation.
 * Gibt NOT_FOUND oder FORBIDDEN zurück, nie beides.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @param {string | null} userId - UUID des anfragenden Users
 * @returns {Promise<{ success: true, data: undefined } | { success: false, error: { code: string, message: string } }>}
 */
export const deleteLink = async (code, userId = null) => {
  if (!userId) {
    const result = await pool.query(
      "DELETE FROM short_links WHERE code = $1 RETURNING code",
      [code],
    );
    return result.rows.length === 0 ? err("NOT_FOUND") : ok();
  }
  const { rows } = await queryOwned(
    "DELETE FROM short_links WHERE code = $1 AND user_id = $2 RETURNING code",
    [code, userId],
  );
  if (rows.length === 0) return err("NOT_FOUND");
  if (!rows[0].code) return err("FORBIDDEN");
  return ok();
};

/**
 * Aktualisiert die original_url eines bestehenden Short-Links.
 * Mit userId: atomar – prüft Ownership in derselben Operation.
 * Gibt INVALID_URL, NOT_FOUND oder FORBIDDEN zurück.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @param {string} url - Neue Ziel-URL
 * @param {string | null} userId - UUID des anfragenden Users
 * @returns {Promise<{ success: true, data: Link } | { success: false, error: { code: string, message: string } }>}
 */
export const updateLink = async (code, url, userId = null) => {
  if (!isValidUrl(url)) return err("INVALID_URL");
  if (!userId) {
    const result = await pool.query(
      "UPDATE short_links SET original_url = $1 WHERE code = $2 RETURNING *",
      [url, code],
    );
    return result.rows.length === 0
      ? err("NOT_FOUND")
      : ok(toLink(result.rows[0]));
  }
  const { rows } = await queryOwned(
    "UPDATE short_links SET original_url = $2 WHERE code = $1 AND user_id = $3 RETURNING *",
    [code, url, userId],
  );
  if (rows.length === 0) return err("NOT_FOUND");
  if (!rows[0].code) return err("FORBIDDEN");
  return ok(toLink(rows[0]));
};

/**
 * Schaltet is_active eines Short-Links um (true → false, false → true).
 * Mit userId: atomar – prüft Ownership in derselben Operation.
 * Gibt NOT_FOUND oder FORBIDDEN zurück.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @param {string | null} userId - UUID des anfragenden Users
 * @returns {Promise<{ success: true, data: Link } | { success: false, error: { code: string, message: string } }>}
 */
export const toggleActive = async (code, userId = null) => {
  if (!userId) {
    const result = await pool.query(
      "UPDATE short_links SET is_active = NOT is_active WHERE code = $1 RETURNING *",
      [code],
    );
    return result.rows.length === 0
      ? err("NOT_FOUND")
      : ok(toLink(result.rows[0]));
  }
  const { rows } = await queryOwned(
    "UPDATE short_links SET is_active = NOT is_active WHERE code = $1 AND user_id = $2 RETURNING *",
    [code, userId],
  );
  if (rows.length === 0) return err("NOT_FOUND");
  if (!rows[0].code) return err("FORBIDDEN");
  return ok(toLink(rows[0]));
};
