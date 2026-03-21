/**
 * @fileoverview Route-Handler für Klick-Analytics
 * @description Behandelt GET /api/links/:code/clicks und gibt die
 *   Klick-Historie eines Short-Links als JSON zurück.
 * @module src/routes/analytics
 */
import { getClicksByCode } from "../services/analytics-service.js";

/**
 * Antwortet mit 200 und der Klick-Historie des Short-Links als Array,
 * absteigend nach Klick-Zeitpunkt sortiert. Gibt leeres Array zurück
 * wenn der Link noch keine Klicks hat.
 * @param {import("node:http").IncomingMessage} req - HTTP-Request
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {{ code: string }} params - Route-Parameter mit dem Link-Code
 * @returns {Promise<void>}
 */
export const handleAnalytics = async (req, res, params) => {
  const result = await getClicksByCode(params.code);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.data));
};
