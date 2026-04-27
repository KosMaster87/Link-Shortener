/**
 * @fileoverview Auth-Middleware: JWT-Verifikation
 * @description Liest Bearer-Token aus Authorization-Header, verifiziert ihn
 *   und schreibt `req.user = { id, email }`. Gibt 401 bei fehlendem/ungültigem Token.
 * @module src/middleware/auth
 */

import { verifyToken } from "../utils/jwt.js";

/**
 * Extrahiert den Bearer-Token aus dem Authorization-Header.
 * @param {import("node:http").IncomingMessage} req
 * @returns {string | null}
 */
const extractBearer = (req) => {
  const auth = req.headers["authorization"] ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
};

/**
 * Middleware: Prüft JWT-Token und setzt req.user.
 * Ruft next() bei gültigem Token auf, antwortet mit 401 sonst.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {Function} next
 * @returns {void}
 */
export const requireAuth = (req, res, next) => {
  const token = extractBearer(req);
  if (!token) return sendUnauthorized(res);
  const payload = verifyToken(token);
  if (!payload) return sendUnauthorized(res);
  req.user = { id: payload.sub, email: payload.email };
  next();
};

/**
 * Optionale Auth: setzt req.user wenn Token valide, sendet kein 401.
 * Geeignet für Routen die mit und ohne Auth funktionieren sollen.
 * @param {import("node:http").IncomingMessage} req
 * @returns {void}
 */
export const optionalAuth = (req) => {
  const token = extractBearer(req);
  if (!token) return;
  const payload = verifyToken(token);
  if (payload) req.user = { id: payload.sub, email: payload.email };
};

/**
 * Sendet 401 Unauthorized als JSON.
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
const sendUnauthorized = (res) => {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "UNAUTHORIZED",
      message: "Authentifizierung erforderlich.",
    }),
  );
};
