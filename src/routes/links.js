/**
 * @fileoverview Route-Handler für Link-Verwaltung
 * @description Behandelt GET /api/links, POST /api/links und
 *   DELETE/PUT/PATCH /api/links/:code. Schreibrouten erfordern Auth + Ownership.
 * @module src/routes/links
 */
import {
  createLink,
  deleteLink,
  getAllLinks,
  getLink,
  toggleActive,
  updateLink,
} from "../services/link-service.js";

const ERROR_STATUS = {
  INVALID_URL: 422,
  SLUG_TAKEN: 409,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

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
 * Prüft ob der eingeloggte User Besitzer des Links ist.
 * Gibt null zurück bei Erfolg, oder ein Error-Result wenn nicht berechtigt.
 * @param {string} code
 * @param {string} userId
 * @returns {Promise<null | { error: Object }>}
 */
const checkOwnership = async (code, userId) => {
  const result = await getLink(code);
  if (!result.success) return { error: { code: "NOT_FOUND" } };
  if (result.data.userId !== userId) return { error: { code: "FORBIDDEN" } };
  return null;
};

/**
 * Lädt alle Short-Links des eingeloggten Users.
 * @param {import("node:http").ServerResponse} res
 * @param {string} userId
 * @returns {Promise<void>}
 */
const handleGet = async (res, userId) => {
  const result = await getAllLinks(userId);
  return send(res, 200, result.data);
};

/**
 * Legt einen neuen Short-Link an (erfordert Auth).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const handlePost = async (req, res) => {
  const result = await createLink(req.body, req.user.id);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
      message: result.error.message,
    });
  return send(res, 201, result.data);
};

/**
 * Löscht einen Short-Link (nur Besitzer).
 * @param {import("node:http").ServerResponse} res
 * @param {string} code
 * @param {string} userId
 * @returns {Promise<void>}
 */
const handleDelete = async (res, code, userId) => {
  const ownerErr = await checkOwnership(code, userId);
  if (ownerErr)
    return send(res, ERROR_STATUS[ownerErr.error.code] ?? 500, {
      error: ownerErr.error.code,
    });
  const result = await deleteLink(code);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  res.writeHead(204);
  return res.end();
};

/**
 * Aktualisiert die URL eines Short-Links (nur Besitzer).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} code
 * @param {string} userId
 * @returns {Promise<void>}
 */
const handlePut = async (req, res, code, userId) => {
  const ownerErr = await checkOwnership(code, userId);
  if (ownerErr)
    return send(res, ERROR_STATUS[ownerErr.error.code] ?? 500, {
      error: ownerErr.error.code,
    });
  const result = await updateLink(code, req.body.url);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  return send(res, 200, result.data);
};

/**
 * Schaltet is_active eines Short-Links um (nur Besitzer).
 * @param {import("node:http").ServerResponse} res
 * @param {string} code
 * @param {string} userId
 * @returns {Promise<void>}
 */
const handleToggle = async (res, code, userId) => {
  const ownerErr = await checkOwnership(code, userId);
  if (ownerErr)
    return send(res, ERROR_STATUS[ownerErr.error.code] ?? 500, {
      error: ownerErr.error.code,
    });
  const result = await toggleActive(code);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
    });
  return send(res, 200, result.data);
};

/**
 * Dispatcht alle Link-Routen. GET ist öffentlich, Schreibops erfordern req.user.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ code?: string }} params
 * @returns {Promise<void>}
 */
export const handleLinks = async (req, res, params) => {
  if (req.method === "GET") return handleGet(res, req.user?.id);
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "DELETE")
    return handleDelete(res, params.code, req.user.id);
  if (req.method === "PUT")
    return handlePut(req, res, params.code, req.user.id);
  if (req.method === "PATCH")
    return handleToggle(res, params.code, req.user.id);
};
