/**
 * @fileoverview Route-Handler für Link-Verwaltung
 * @description Behandelt GET /api/links, POST /api/links und
 *   DELETE /api/links/:code. Wandelt Service-Results in HTTP-Antworten um.
 * @module src/routes/links
 */
import {
  createLink,
  deleteLink,
  getAllLinks,
  toggleActive,
  updateLink,
} from "../services/link-service.js";

const ERROR_STATUS = {
  INVALID_URL: 422,
  SLUG_TAKEN: 409,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
};

/**
 * Serialisiert data als JSON und sendet die Response mit dem gegebenen Status.
 * Setzt Content-Type auf application/json.
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {number} status - HTTP-Statuscode
 * @param {*} data - Zu serialisierendes Payload
 * @returns {void}
 */
const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

/**
 * Lädt alle Short-Links aus der Datenbank und antwortet mit 200 und der Liste.
 * Gibt immer 200 zurück — auch wenn keine Links vorhanden sind (leeres Array).
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const handleGet = async (res) => {
  const result = await getAllLinks();
  return send(res, 200, result.data);
};

/**
 * Legt einen neuen Short-Link an und antwortet mit 201 und dem erstellten Link.
 * Schlägt mit 422 fehl wenn die URL kein gültiges http/https-Format hat.
 * Schlägt mit 409 fehl wenn der Alias bereits vergeben oder reserviert ist.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const handlePost = async (req, res) => {
  const result = await createLink(req.body);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  return send(res, 201, result.data);
};

/**
 * Löscht den Short-Link mit dem gegebenen Code und antwortet mit 204.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code in der DB existiert.
 * @param {import("node:http").ServerResponse} res
 * @param {string} code - Short-Link-Code
 * @returns {Promise<void>}
 */
const handleDelete = async (res, code) => {
  const result = await deleteLink(code);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  res.writeHead(204);
  return res.end();
};

/**
 * Aktualisiert die original_url eines bestehenden Short-Links, antwortet mit 200.
 * Schlägt mit 422 fehl wenn die neue URL kein gültiges Format hat.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} code - Short-Link-Code
 * @returns {Promise<void>}
 */
const handlePut = async (req, res, code) => {
  const result = await updateLink(code, req.body.url);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  return send(res, 200, result.data);
};

/**
 * Schaltet is_active des Short-Links um und antwortet mit 200 und dem Link.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * @param {import("node:http").ServerResponse} res
 * @param {string} code - Short-Link-Code
 * @returns {Promise<void>}
 */
const handleToggle = async (res, code) => {
  const result = await toggleActive(code);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  return send(res, 200, result.data);
};

/**
 * Dispatcht GET /api/links, POST /api/links, DELETE /api/links/:code,
 * PUT /api/links/:code und PATCH /api/links/:code/toggle an die jeweiligen Handler.
 * params.code wird bei allen Routen außer GET und POST benötigt.
 * @param {import("node:http").IncomingMessage} req - HTTP-Request
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {{ code?: string }} params - Route-Parameter
 * @returns {Promise<void>}
 */
export const handleLinks = async (req, res, params) => {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "DELETE") return handleDelete(res, params.code);
  if (req.method === "PUT") return handlePut(req, res, params.code);
  if (req.method === "PATCH") return handleToggle(res, params.code);
};
