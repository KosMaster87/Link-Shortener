/**
 * @fileoverview Route-Handler für Authentifizierung
 * @description POST /api/auth/register und POST /api/auth/login.
 *   Gibt JWT-Token bei Erfolg zurück.
 * @module src/routes/auth
 */
import { login, register } from "../services/auth-service.js";
import { createToken } from "../utils/jwt.js";

const ERROR_STATUS = {
  INVALID_INPUT: 400,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  DB_ERROR: 500,
};

/**
 * Serialisiert data als JSON und sendet die Response.
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
 * Registriert einen neuen User und gibt Token + User zurück.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const handleRegister = async (req, res) => {
  const { email, password } = req.body ?? {};
  const result = await register(email, password);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
      message: result.error.message,
    });
  const token = createToken(result.data);
  return send(res, 201, { token, user: result.data });
};

/**
 * Meldet einen User an und gibt Token + User zurück.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const handleLogin = async (req, res) => {
  const { email, password } = req.body ?? {};
  const result = await login(email, password);
  if (!result.success)
    return send(res, ERROR_STATUS[result.error.code] ?? 500, {
      error: result.error.code,
      message: result.error.message,
    });
  const token = createToken(result.data);
  return send(res, 200, { token, user: result.data });
};

/**
 * Dispatcht POST /api/auth/register und POST /api/auth/login.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ action: string }} params - action: "register" | "login"
 * @returns {Promise<void>}
 */
export const handleAuth = async (req, res, params) => {
  if (req.method === "POST" && params.action === "register")
    return handleRegister(req, res);
  if (req.method === "POST" && params.action === "login")
    return handleLogin(req, res);
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
};
