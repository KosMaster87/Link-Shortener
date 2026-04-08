/**
 * @fileoverview JWT-Utilities (JSON Web Token) (HMAC-SHA256, pure node:crypto)
 * @description Erstellt und verifiziert JWTs ohne externe Packages.
 *   Secret wird aus JWT_SECRET-Umgebungsvariable gelesen.
 * @module src/utils/jwt
 */
import { createHmac } from "node:crypto";
import { config } from "../config.js";

const JWT_SECRET = config.auth.jwtSecret;
const TOKEN_TTL_SEC = 60 * 60 * 24; // 24 Stunden

/**
 * Kodiert ein Objekt als Base64URL-String.
 * @param {Object} obj
 * @returns {string}
 */
const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/**
 * Berechnet HMAC-SHA256-Signatur für header.payload.
 * @param {string} data
 * @returns {string}
 */
const sign = (data) =>
  createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/**
 * Erstellt einen JWT-Token für den gegebenen User.
 * @param {{ id: string, email: string }} user
 * @returns {string}
 */
export const createToken = (user) => {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub: user.id,
    email: user.email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
  });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
};

/**
 * Verifiziert einen JWT-Token und gibt das Payload zurück.
 * Gibt null zurück bei ungültiger Signatur oder abgelaufenem Token.
 * @param {string} token
 * @returns {{ sub: string, email: string } | null}
 */
export const verifyToken = (token) => {
  try {
    const [header, payload, signature] = token.split(".");
    if (sign(`${header}.${payload}`) !== signature) return null;
    const data = JSON.parse(Buffer.from(payload, "base64").toString());
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
};
