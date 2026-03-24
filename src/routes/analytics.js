/**
 * @fileoverview Route-Handler für Klick-Analytics
 * @description Behandelt GET /api/links/:code/clicks und gibt aggregierte
 *   Statistiken eines Short-Links als JSON zurück.
 * @module src/routes/analytics
 */
import { getStats } from "../services/analytics-service.js";

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
  if (!result.success && result.error === "NOT_FOUND") {
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
