/**
 * @fileoverview Route-Handler für das Admin-Dashboard
 * @description Behandelt GET /api/dashboard/overview, /top-links,
 *   /clicks-per-day und /referrer/:code.
 * @module src/routes/dashboard
 */

import {
  getClicksPerDay,
  getOverviewStats,
  getReferrerBreakdown,
  getTopLinks,
} from "../services/dashboard-service.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_DAYS = 30;
const ERROR_STATUS = { DB_ERROR: 500, NOT_FOUND: 404, INVALID_INPUT: 400 };
const INTERNAL_CODES = new Set(["DB_ERROR", "UNEXPECTED"]);

/**
 * Serialisiert data als JSON und sendet die Response mit dem gegebenen Status.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {*} data
 * @returns {void}
 */
const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

/**
 * Gibt das Ergebnis eines Service-Calls als JSON zurück oder sendet den Fehler-Status.
 * @param {import("node:http").ServerResponse} res
 * @param {{ success: boolean, data?: *, error?: string }} result
 * @returns {void}
 */
const sendResult = (res, result) => {
  if (!result.success) {
    const isInternal = INTERNAL_CODES.has(result.error.code);
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
      ...(isInternal ? {} : { message: result.error.message }),
    });
  }
  return send(res, 200, result.data);
};

/**
 * Ruft getOverviewStats auf und sendet das Ergebnis als JSON.
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const handleOverview = async (res) => sendResult(res, await getOverviewStats());

/**
 * Liest limit aus den Query-Parametern und gibt die Top-Links zurück.
 * Fehlendes oder ungültiges limit fällt auf DEFAULT_LIMIT zurück.
 * @param {import("node:http").ServerResponse} res
 * @param {URLSearchParams} query
 * @returns {Promise<void>}
 */
const handleTopLinks = async (res, query) => {
  const limit = parseInt(query.get("limit"), 10) || DEFAULT_LIMIT;
  return sendResult(res, await getTopLinks(limit));
};

/**
 * Liest days aus den Query-Parametern und gibt die Klick-Zeitreihe zurück.
 * Fehlendes oder ungültiges days fällt auf DEFAULT_DAYS zurück.
 * @param {import("node:http").ServerResponse} res
 * @param {URLSearchParams} query
 * @returns {Promise<void>}
 */
const handleClicksPerDay = async (res, query) => {
  const days = parseInt(query.get("days"), 10) || DEFAULT_DAYS;
  return sendResult(res, await getClicksPerDay(days));
};

/**
 * Gibt die Referrer-Verteilung für den angegebenen Short-Link-Code zurück.
 * @param {import("node:http").ServerResponse} res
 * @param {string} code - Short-Link-Code
 * @returns {Promise<void>}
 */
const handleReferrer = async (res, code) =>
  sendResult(res, await getReferrerBreakdown(code));

/**
 * Dispatcht GET /api/dashboard/:sub und /api/dashboard/referrer/:code.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ sub: string, code?: string }} params
 * @returns {Promise<void>}
 */
export const handleDashboard = async (req, res, params) => {
  if (req.method !== "GET")
    return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const { searchParams } = new URL(req.url, "http://localhost");
  const { sub, code } = params;
  if (sub === "overview") return handleOverview(res);
  if (sub === "top-links") return handleTopLinks(res, searchParams);
  if (sub === "clicks-per-day") return handleClicksPerDay(res, searchParams);
  if (sub === "referrer" && code) return handleReferrer(res, code);
  return send(res, 404, { error: "NOT_FOUND" });
};
