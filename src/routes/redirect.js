/**
 * @fileoverview Route-Handler für URL-Weiterleitungen
 * @description Löst einen 6-stelligen Short-Code zur Original-URL auf,
 *   zeichnet den Klick auf und sendet einen 302-Redirect.
 * @module src/routes/redirect
 */
import { recordClick } from "../services/analytics-service.js";
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
 * Löst einen Short-Code zur Original-URL auf und sendet einen 302-Redirect.
 * Zeichnet dabei Referrer und User-Agent als Klick-Ereignis auf.
 * Schlägt mit 404 fehl wenn kein Link mit dem Code existiert.
 * @param {import("node:http").IncomingMessage} req - HTTP-Request
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {{ code: string }} params - Route-Parameter mit dem Link-Code
 * @returns {Promise<void>}
 */
export const handleRedirect = async (req, res, params) => {
  const result = await getLink(params.code);
  if (!result.success) return send(res, 404, { error: "NOT_FOUND" });

  await recordClick({
    code: params.code,
    referrer: req.headers["referer"] ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.writeHead(302, { Location: result.data.originalUrl });
  res.end();
};
