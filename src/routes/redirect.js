/**
 * @fileoverview Route-Handler für URL-Weiterleitungen
 * @description Löst einen 6-stelligen Short-Code zur Original-URL auf,
 *   zeichnet den Klick fire-and-forget auf und sendet einen 302-Redirect.
 * @module src/routes/redirect
 */
import { trackClick } from "../services/analytics-service.js";
import { getLink } from "../services/link-service.js";

/**
 * Serialisiert data als JSON und sendet die Response mit dem gegebenen Status.
 * Setzt Content-Type auf application/json.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status - HTTP-Statuscode
 * @param {*} data - Zu serialisierendes Payload
 * @returns {void}
 */
const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

/**
 * Extrahiert die Client-IP aus dem Request.
 * Bevorzugt den ersten Eintrag aus x-forwarded-for (Reverse-Proxy),
 * fällt auf socket.remoteAddress zurück wenn der Header fehlt.
 * @param {import("node:http").IncomingMessage} req
 * @returns {string}
 */
const extractIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "";
};

/**
 * Löst einen Short-Code zur Original-URL auf und sendet einen 302-Redirect.
 * Zeichnet dabei Referrer, User-Agent und IP als Klick-Ereignis auf (fire-and-forget).
 * Schlägt mit 404 fehl wenn kein Link mit dem Code existiert.
 * @param {import("node:http").IncomingMessage} req - HTTP-Request
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {{ code: string }} params - Route-Parameter mit dem Link-Code
 * @returns {Promise<void>}
 */
export const handleRedirect = async (req, res, params) => {
  const result = await getLink(params.code);
  if (!result.success) return send(res, 404, { error: "NOT_FOUND" });

  trackClick({
    linkId: params.code,
    referrer: req.headers["referer"] ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    ip: extractIp(req),
  }).catch((error) => console.error("Failed to track click:", error));

  res.writeHead(302, { Location: result.data.originalUrl });
  res.end();
};
