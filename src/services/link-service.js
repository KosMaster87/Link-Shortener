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
const RESERVED = new Set([
  "api",
  "admin",
  "dashboard",
  "login",
  "logout",
  "static",
]);
const SLUG_LENGTH = 6;
const MAX_SLUG_ATTEMPTS = 3;

const generateSlug = () => {
  const bytes = randomBytes(SLUG_LENGTH);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
};

const toLink = (row) => ({
  code: row.code,
  originalUrl: row.original_url,
  createdAt: row.created_at,
  isActive: row.is_active,
});

/**
 * Prüft ob eine URL syntaktisch gültig ist, indem sie durch den nativen
 * URL-Konstruktor geparst wird. Gibt false zurück bei fehlenden Protokollen
 * oder ungültigen Formaten (z.B. "example.com" ohne http/https).
 * @param {string} url
 * @returns {boolean}
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Prüft ob ein Custom-Alias verwendbar ist.
 * Gibt SLUG_TAKEN zurück wenn der Alias in der RESERVED-Liste steht
 * oder bereits als Code in der DB existiert. Bei Erfolg wird der Alias
 * unverändert zurückgegeben.
 * @param {string} alias
 * @returns {Promise<{ success: true, data: string } | { success: false, error: string }>}
 */
const validateAlias = async (alias) => {
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
 * Setzt code und original_url; created_at wird von der DB gesetzt.
 * @param {string} code - Slug für den neuen Link
 * @param {string} url - Original-URL
 * @returns {Promise<{ success: true, data: Link }>}
 */
const insertLink = async (code, url) => {
  const result = await pool.query(
    "INSERT INTO short_links (code, original_url) VALUES ($1, $2) RETURNING *",
    [code, url],
  );
  return ok(toLink(result.rows[0]));
};

/**
 * Erstellt einen neuen Short-Link und gibt ihn zurück.
 * Gibt INVALID_URL zurück wenn die URL kein gültiges Format hat.
 * Gibt SLUG_TAKEN zurück wenn alias vergeben/reserviert ist oder kein
 * freier zufälliger Slug gefunden werden konnte.
 * @param {import("./link-service.js").CreateLinkInput} input - URL und optionaler Alias
 * @returns {Promise<{ success: true, data: import("./link-service.js").Link } | { success: false, error: string }>}
 */
export const createLink = async ({ url, alias } = {}) => {
  if (!isValidUrl(url)) return err("INVALID_URL");
  if (alias) {
    const aliasResult = await validateAlias(alias);
    if (!aliasResult.success) return aliasResult;
    return insertLink(alias, url);
  }
  const slugResult = await findAvailableSlug();
  if (!slugResult.success) return slugResult;
  return insertLink(slugResult.data, url);
};

/**
 * Sucht einen Short-Link anhand seines Codes in der DB.
 * Gibt NOT_FOUND zurück wenn kein Eintrag mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @returns {Promise<{ success: true, data: import("./link-service.js").Link } | { success: false, error: string }>}
 */
export const getLink = async (code) => {
  const result = await pool.query("SELECT * FROM short_links WHERE code = $1", [
    code,
  ]);
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok(toLink(result.rows[0]));
};

/**
 * Lädt alle Short-Links aus der DB, absteigend nach Erstellungsdatum sortiert.
 * Gibt immer ein Array zurück — leer wenn noch keine Links angelegt wurden.
 * @returns {Promise<{ success: true, data: import("./link-service.js").Link[] }>}
 */
export const getAllLinks = async () => {
  const result = await pool.query(
    "SELECT * FROM short_links ORDER BY created_at DESC",
  );
  return ok(result.rows.map(toLink));
};

/**
 * Löscht den Short-Link mit dem gegebenen Code aus der DB.
 * Gibt NOT_FOUND zurück wenn kein Eintrag mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @returns {Promise<{ success: true, data: undefined } | { success: false, error: string }>}
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
 * @returns {Promise<{ success: true, data: import("./link-service.js").Link } | { success: false, error: string }>}
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
 * Gibt INVALID_DAYS zurück wenn `days` keine positive ganze Zahl ist.
 * @param {number} days - Zeitraum in Tagen (muss > 0 sein)
 * @returns {Promise<{ success: true, data: import("./link-service.js").Link[] } | { success: false, error: string }>}
 */
export const getInactiveLinks = async (days) => {
  if (!Number.isInteger(days) || days <= 0) return err("INVALID_DAYS");
  const start = performance.now();
  const { rows } = await pool.query(
    `SELECT sl.* FROM short_links sl
     LEFT JOIN link_clicks lc
       ON lc.code = sl.code AND lc.clicked_at >= NOW() - ($1 * INTERVAL '1 day')
     GROUP BY sl.code
     HAVING MAX(lc.clicked_at) IS NULL
     ORDER BY sl.created_at DESC`,
    [days],
  );
  const ms = (performance.now() - start).toFixed(2);
  console.log(`[getInactiveLinks] days=${days} found=${rows.length} duration=${ms}ms`);
  return ok(rows.map(toLink));
};

/**
 * Schaltet is_active eines Short-Links um (true → false, false → true).
 * Gibt NOT_FOUND zurück wenn kein Link mit diesem Code existiert.
 * @param {string} code - 6-stelliger alphanumerischer Slug
 * @returns {Promise<{ success: true, data: import("./link-service.js").Link } | { success: false, error: string }>}
 */
export const toggleActive = async (code) => {
  const result = await pool.query(
    "UPDATE short_links SET is_active = NOT is_active WHERE code = $1 RETURNING *",
    [code],
  );
  if (result.rows.length === 0) return err("NOT_FOUND");
  return ok(toLink(result.rows[0]));
};
