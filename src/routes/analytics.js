/**
 * @fileoverview Route-Handler für Klick-Analytics
 * @description Behandelt GET /api/links/:code/clicks und
 *   GET /api/links/:code/clicks/period?period=day|week|month.
 * @module src/routes/analytics
 */
import {
  getClicksByPeriod,
  getReferrers,
  getStats,
} from "../services/analytics-service.js";

const DEFAULT_PERIOD = "day";
const ERROR_STATUS = { NOT_FOUND: 404, INVALID_INPUT: 400, DB_ERROR: 500 };

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
  const result = await getClicksByPeriod(params.code, period);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
      message: result.error.message,
    });
  return send(res, 200, result.data);
};

/**
 * Gibt Referrer-Aggregation für einen Short-Link als JSON zurück.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ code: string }} params
 * @returns {Promise<void>}
 */
export const handleReferrers = async (req, res, params) => {
  const result = await getReferrers(params.code);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
      message: result.error.message,
    });
  return send(res, 200, result.data);
};

/**
 * Antwortet mit 200 und den aggregierten Statistiken des Short-Links.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * Schlägt mit 500 fehl wenn die Stats-Abfrage fehlschlägt.
 * @param {import("node:http").IncomingMessage} req - HTTP-Request
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {{ code: string }} params - Route-Parameter mit dem Link-Code
 * @returns {Promise<void>}
 */
export const handleAnalytics = async (req, res, params) => {
  const result = await getStats(params.code);
  if (!result.success && result.error.code === "NOT_FOUND") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "NOT_FOUND" }));
  }
  if (!result.success) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.data));
};
