/**
 * @fileoverview HTTP Server Entry Point
 * @description Startet den nativen Node.js HTTP-Server, parsed Requests und
 *   delegiert an die zuständigen Route-Handler. Bedient außerdem statische
 *   Dateien aus dem public/-Verzeichnis.
 * @module server
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname } from "node:path";
import { handleAnalytics } from "./src/routes/analytics.js";
import { handleAuth } from "./src/routes/auth.js";
import { handleDashboard } from "./src/routes/dashboard.js";
import { handleLinks } from "./src/routes/links.js";
import { handleRedirect } from "./src/routes/redirect.js";
import { getStats } from "./src/services/analytics-service.js";
import { requireAuth } from "./src/middleware/auth.js";
import { isAllowed, LIMITS } from "./src/utils/rate-limit.js";

const PORT = process.env.PORT ?? 3000;
const BODY_LIMIT_BYTES = 16_384; // 16 KB

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

/**
 * Setzt Security-Header auf der Response.
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
const applySecurityHeaders = (res) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS))
    res.setHeader(key, value);
};

/**
 * Extrahiert die Client-IP für Rate-Limiting (nur socket.remoteAddress).
 * @param {import("node:http").IncomingMessage} req
 * @returns {string}
 */
const clientIp = (req) => req.socket.remoteAddress ?? "unknown";

/**
 * Sendet 429 Too Many Requests als JSON.
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
const sendTooManyRequests = (res) => {
  res.writeHead(429, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "RATE_LIMITED", message: "Zu viele Anfragen. Bitte warten." }));
};

/**
 * Liest den Request-Body als String, bricht bei Überschreitung von BODY_LIMIT_BYTES
 * mit 413 ab und parst das Ergebnis als JSON.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<Object | null>} Geparster Body oder null bei Fehler/Überschreitung
 */
const parseBody = (req, res) =>
  new Promise((resolve) => {
    let raw = "";
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > BODY_LIMIT_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "PAYLOAD_TOO_LARGE", message: "Request-Body zu groß (max. 16 KB)." }));
        resolve(null);
      }
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });

/**
 * Liest eine Datei aus public/ und sendet sie mit passendem Content-Type.
 * @param {import("node:http").ServerResponse} res
 * @param {string} urlPath
 * @returns {Promise<void>}
 */
const serveStatic = async (res, urlPath) => {
  const filePath = urlPath === "/" ? "/index.html" : urlPath;
  try {
    const content = await readFile(`./public${filePath}`);
    const mime = MIME_TYPES[extname(filePath)] ?? "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
};

/**
 * Sendet { error: "NOT_FOUND" } mit Status 404 als JSON-Antwort.
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
const send404 = (res) => {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
};

/**
 * Lädt aggregierte Statistiken für einen Short-Link.
 * @param {import("node:http").ServerResponse} res
 * @param {string} slug
 * @returns {Promise<void>}
 */
const handleStats = async (res, slug) => {
  const result = await getStats(slug);
  if (!result.success && result.error.code === "NOT_FOUND") return send404(res);
  if (!result.success) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.data));
};

/**
 * Routet /api/dashboard/-Anfragen an handleDashboard.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} method
 * @param {string} path
 * @returns {Promise<void>}
 */
const routeDashboard = async (req, res, method, path) => {
  const referrerMatch = path.match(/^\/api\/dashboard\/referrer\/([^/]+)$/);
  if (method === "GET" && referrerMatch)
    return await handleDashboard(req, res, { sub: "referrer", code: referrerMatch[1] });
  const subMatch = path.match(/^\/api\/dashboard\/([^/]+)$/);
  if (method === "GET" && subMatch)
    return await handleDashboard(req, res, { sub: subMatch[1] });
  send404(res);
};

/**
 * Wendet requireAuth als Promise-Wrapper an.
 * Gibt true zurück wenn Auth erfolgreich, false wenn 401 gesendet.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<boolean>}
 */
const checkAuth = (req, res) =>
  new Promise((resolve) => {
    requireAuth(req, res, () => resolve(true));
    // requireAuth ruft next() nur bei Erfolg — bei 401 endet die Response
    // ohne next()-Aufruf, daher Promise hängt nicht: res.end() schließt die Verbindung.
    res.on("finish", () => resolve(false));
  });

/**
 * Routet Anfragen unter /api/ an den passenden Handler.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} method
 * @param {string} path
 * @returns {Promise<void>}
 */
const routeApi = async (req, res, method, path) => {
  const ip = clientIp(req);

  // Auth-Routen
  const authMatch = path.match(/^\/api\/auth\/(register|login)$/);
  if (authMatch) {
    const bucket = authMatch[1] === "login" ? "login" : "general";
    if (!isAllowed(ip, bucket, LIMITS[bucket])) return sendTooManyRequests(res);
    return await handleAuth(req, res, { action: authMatch[1] });
  }

  // Allgemeines Rate-Limit
  if (!isAllowed(ip, "general", LIMITS.general)) return sendTooManyRequests(res);

  // Links: GET öffentlich, Schreibops erfordern Auth
  if (method === "GET" && path === "/api/links") return await handleLinks(req, res, {});

  if (method === "POST" && path === "/api/links") {
    if (!isAllowed(ip, "createLink", LIMITS.createLink)) return sendTooManyRequests(res);
    const authed = await checkAuth(req, res);
    if (!authed) return;
    return await handleLinks(req, res, {});
  }

  const codeMatch = path.match(/^\/api\/links\/([^/]+)$/);
  if (["DELETE", "PUT"].includes(method) && codeMatch) {
    const authed = await checkAuth(req, res);
    if (!authed) return;
    return await handleLinks(req, res, { code: codeMatch[1] });
  }

  const toggleMatch = path.match(/^\/api\/links\/([^/]+)\/toggle$/);
  if (method === "PATCH" && toggleMatch) {
    const authed = await checkAuth(req, res);
    if (!authed) return;
    return await handleLinks(req, res, { code: toggleMatch[1] });
  }

  const clicksMatch = path.match(/^\/api\/links\/([^/]+)\/clicks$/);
  if (method === "GET" && clicksMatch)
    return await handleAnalytics(req, res, { code: clicksMatch[1] });

  const statsMatch = path.match(/^\/api\/links\/([^/]+)\/stats$/);
  if (method === "GET" && statsMatch) return await handleStats(res, statsMatch[1]);

  if (path.startsWith("/api/dashboard/"))
    return await routeDashboard(req, res, method, path);

  send404(res);
};

/**
 * Routet GET-Anfragen: Short-Code oder statische Datei.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} path
 * @returns {Promise<void>}
 */
const routeGet = async (req, res, path) => {
  const codeMatch = path.match(/^\/([a-zA-Z0-9]{6})$/);
  if (codeMatch) return await handleRedirect(req, res, { code: codeMatch[1] });
  return await serveStatic(res, path);
};

/**
 * Einstiegspunkt für jeden Request.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const routeRequest = async (req, res) => {
  applySecurityHeaders(res);
  const { method } = req;
  const path = new URL(req.url, `http://localhost:${PORT}`).pathname;
  if (["POST", "PUT", "PATCH"].includes(method)) {
    req.body = await parseBody(req, res);
    if (req.body === null) return; // 413 wurde bereits gesendet
  }
  if (path.startsWith("/api/")) return await routeApi(req, res, method, path);
  if (method === "GET") return await routeGet(req, res, path);
  send404(res);
};

const server = createServer(async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (error) {
    const isDev = process.env.NODE_ENV !== "production";
    console.error("Unhandled error:", isDev ? error : error.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
