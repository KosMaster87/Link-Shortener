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
 * Ohne userId wird ein leeres Array zurückgegeben – nicht alle Links aller User.
 * @param {string | null} userId
 * @returns {Promise<{ success: true, data: Link[] }>}
 */
export const getAllLinks = async (userId = null) => {
  if (!userId) return ok([]);
  const result = await pool.query(
    "SELECT * FROM short_links WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
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
