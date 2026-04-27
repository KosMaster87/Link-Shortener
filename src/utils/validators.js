/**
 * @fileoverview Wiederverwendbare Validierungsfunktionen
 * @description Zentrales Modul für Input-Validierung. Wird von link-service
 *   und dashboard-service verwendet, um Validierungslogik nicht zu duplizieren.
 * @module src/utils/validators
 */

import { err, ok } from "./result.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

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

const ALIAS_MAX_LENGTH = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const VALID_PERIODS = new Set(["day", "week", "month"]);

/**
 * Prüft ob eine URL sicher ist: nur http/https, keine internen Hosts,
 * keine gefährlichen Protokolle (javascript:, data:, file: etc.).
 * @param {string} url
 * @returns {boolean}
 */
export const isValidUrl = (url) => {
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
 * Prüft ob ein Custom-Alias in der DB bereits vergeben ist.
 * @param {string} alias
 * @param {import("pg").Pool} pool
 * @returns {Promise<boolean>}
 */
const aliasIsTaken = async (alias, pool) => {
  const { rows } = await pool.query(
    "SELECT code FROM short_links WHERE code = $1",
    [alias],
  );
  return rows.length > 0;
};

/**
 * Prüft ob ein Custom-Alias verwendbar ist.
 * Gibt INVALID_INPUT zurück bei ungültiger Länge oder reserviertem Namen.
 * Gibt SLUG_TAKEN zurück wenn der Alias bereits in der DB existiert.
 * @param {string} alias
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ success: true, data: string } | { success: false, error: { code: string, message?: string } }>}
 */
export const validateAlias = async (alias, pool) => {
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
  if (await aliasIsTaken(alias, pool)) return err("SLUG_TAKEN");
  return ok(alias);
};

/**
 * Validiert limit: muss ganzzahlig und im Bereich MIN_LIMIT–MAX_LIMIT liegen.
 * @param {number} limit
 * @returns {{ success: true, data: number } | { success: false, error: { code: string, message: string } }}
 */
export const validateLimit = (limit) => {
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
 * @returns {{ success: true, data: number } | { success: false, error: { code: string, message: string } }}
 */
export const validateDays = (days) => {
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS)
    return err({
      code: "INVALID_INPUT",
      message: `days must be ${MIN_DAYS}–${MAX_DAYS}. Received: ${days}`,
    });
  return ok(days);
};

/**
 * Validiert period: muss "day", "week" oder "month" sein.
 * @param {string} period
 * @returns {{ success: true, data: string } | { success: false, error: { code: string, message: string } }}
 */
export const validatePeriod = (period) => {
  if (!VALID_PERIODS.has(period))
    return err({
      code: "INVALID_INPUT",
      message: `period muss day, week oder month sein. Received: ${period}`,
    });
  return ok(period);
};
