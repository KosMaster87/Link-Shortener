/**
 * @fileoverview Auth-Business-Logic: Registrierung und Login
 * @description Hashing via crypto.scrypt, UUIDs aus PostgreSQL gen_random_uuid().
 * @module src/services/auth-service
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "../db/index.js";
import { err, ok } from "../utils/result.js";

/**
 * @typedef {Object} AuthUser
 * @property {string} id    - UUID des Users
 * @property {string} email - E-Mail-Adresse
 */

const scryptAsync = promisify(scrypt);
const SALT_LEN = 16;
const KEY_LEN = 64;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/**
 * Gibt true zurück wenn die E-Mail syntaktisch gültig ist.
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) =>
  typeof email === "string" &&
  email.length <= EMAIL_MAX &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Gibt true zurück wenn das Passwort die Längenanforderungen erfüllt.
 * @param {string} pw
 * @returns {boolean}
 */
const isValidPassword = (pw) =>
  typeof pw === "string" &&
  pw.length >= PASSWORD_MIN &&
  pw.length <= PASSWORD_MAX;

/**
 * Erstellt einen Hash im Format salt:hash (hex-kodiert).
 * @param {string} password
 * @returns {Promise<string>}
 */
const hashPassword = async (password) => {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = await scryptAsync(password, salt, KEY_LEN);
  return `${salt}:${hash.toString("hex")}`;
};

/**
 * Vergleicht ein Klartextpasswort mit einem gespeicherten Hash.
 * Verwendet timingSafeEqual gegen Timing-Angriffe.
 * Gibt false zurück wenn stored ein unbekanntes Format hat (korrupte DB-Zeile),
 * statt eine Exception zu werfen.
 * @param {string} password
 * @param {string} stored - Format salt:hash
 * @returns {Promise<boolean>}
 */
const verifyPassword = async (password, stored) => {
  const parts = stored?.split(":");
  if (parts?.length !== 2) return false;
  const [salt, hash] = parts;
  const hashBuf = Buffer.from(hash, "hex");
  const derived = await scryptAsync(password, salt, KEY_LEN);
  if (hashBuf.length !== derived.length) return false;
  return timingSafeEqual(hashBuf, derived);
};

/**
 * Registriert einen neuen User und gibt ihn zurück.
 * Gibt INVALID_INPUT zurück bei ungültiger E-Mail oder Passwort.
 * Gibt EMAIL_TAKEN zurück wenn die E-Mail bereits existiert.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ success: true, data: AuthUser } | { success: false, error: Object }>}
 */
export const register = async (email, password) => {
  if (!isValidEmail(email))
    return err({ code: "INVALID_INPUT", message: "Ungültige E-Mail-Adresse." });
  if (!isValidPassword(password))
    return err({
      code: "INVALID_INPUT",
      message: `Passwort muss ${PASSWORD_MIN}–${PASSWORD_MAX} Zeichen lang sein.`,
    });
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email.toLowerCase(), passwordHash],
    );
    return ok({ id: rows[0].id, email: rows[0].email });
  } catch (e) {
    if (e.code === "23505")
      return err({ code: "EMAIL_TAKEN", message: "E-Mail bereits vergeben." });
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};

/**
 * Meldet einen User an und gibt seine Daten zurück.
 * Gibt INVALID_CREDENTIALS zurück bei falscher E-Mail oder Passwort.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ success: true, data: AuthUser } | { success: false, error: Object }>}
 */
export const login = async (email, password) => {
  if (!isValidEmail(email) || !isValidPassword(password))
    return err({
      code: "INVALID_CREDENTIALS",
      message: "Ungültige Anmeldedaten.",
    });
  try {
    const { rows } = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    if (rows.length === 0)
      return err({
        code: "INVALID_CREDENTIALS",
        message: "Ungültige Anmeldedaten.",
      });
    const match = await verifyPassword(password, rows[0].password_hash);
    if (!match)
      return err({
        code: "INVALID_CREDENTIALS",
        message: "Ungültige Anmeldedaten.",
      });
    return ok({ id: rows[0].id, email: rows[0].email });
  } catch {
    return err({ code: "DB_ERROR", message: "Datenbankfehler." });
  }
};
