/**
 * @fileoverview Route-Handler für Klick-Analytics
 * @description Behandelt GET /api/links/:code/clicks und
 *   GET /api/links/:code/clicks/period?period=day|week|month.
 * @module src/routes/analytics
 */

import {
  getClicksByPeriod,
  getDeviceStats,
  getReferrers,
  getStats,
} from "../services/analytics-service.js";

const DEFAULT_PERIOD = "day";
const ERROR_STATUS = { NOT_FOUND: 404, INVALID_INPUT: 400, DB_ERROR: 500 };

// DB_ERROR und UNEXPECTED enthalten technische Details die nicht an den Client
// weitergegeben werden sollen — analog zur Absicherung in dashboard.js.
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
 * Sendet das Ergebnis eines Service-Calls als JSON-Response.
 * Interne Fehler (DB_ERROR, UNEXPECTED) werden ohne message gesendet.
 * @param {import("node:http").ServerResponse} res
 * @param {{ success: boolean, data?: *, error?: { code: string, message?: string } }} result
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
 * Gibt Klickzahlen pro Periode für einen Short-Link zurück.
 * Liest period aus den Query-Parametern (default: "day").
 * Schlägt mit 400 fehl bei ungültiger Periode, 404 wenn Link nicht existiert.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ code: string }} params
 * @returns {Promise<void>}
 */
export const handleAnalyticsByPeriod = async (req, res, params) => {
  const { searchParams } = new URL(req.url, "http://localhost");
  const period = searchParams.get("period") ?? DEFAULT_PERIOD;
  return sendResult(res, await getClicksByPeriod(params.code, period));
};

/**
 * Gibt Referrer-Aggregation für einen Short-Link als JSON zurück.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ code: string }} params
 * @returns {Promise<void>}
 */
export const handleReferrers = async (req, res, params) =>
  sendResult(res, await getReferrers(params.code));

/**
 * Gibt Geräte-Verteilung (mobile/tablet/desktop) für einen Short-Link zurück.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ code: string }} params
 * @returns {Promise<void>}
 */
export const handleDevices = async (req, res, params) =>
  sendResult(res, await getDeviceStats(params.code));

/**
 * Antwortet mit 200 und den aggregierten Statistiken des Short-Links.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * Schlägt mit 500 fehl wenn die Stats-Abfrage fehlschlägt.
 * @param {import("node:http").IncomingMessage} req - HTTP-Request
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {{ code: string }} params - Route-Parameter mit dem Link-Code
 * @returns {Promise<void>}
 */
export const handleAnalytics = async (req, res, params) =>
  sendResult(res, await getStats(params.code));
