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
import { handleLinks } from "./src/routes/links.js";
import { handleRedirect } from "./src/routes/redirect.js";
import { getStats } from "./src/services/analytics-service.js";

const PORT = process.env.PORT ?? 3000;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
};

/**
 * Liest den Request-Body als String und parst ihn als JSON.
 * Gibt ein leeres Objekt zurück wenn der Body fehlt oder kein gültiges JSON ist —
 * wirft nie einen Fehler.
 * @param {import("node:http").IncomingMessage} req - Eingehender HTTP-Request
 * @returns {Promise<Object>} Geparster Body oder leeres Objekt bei Parse-Fehler
 */
const parseBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });

/**
 * Liest eine Datei aus public/ und sendet sie mit passendem Content-Type.
 * "/" wird auf "/index.html" umgeleitet. Antwortet mit 404 wenn die
 * Datei nicht existiert.
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @param {string} urlPath - URL-Pfad der angeforderten Datei
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
 * Wird für unbekannte API-Routen und nicht erlaubte Methoden verwendet.
 * @param {import("node:http").ServerResponse} res - HTTP-Response
 * @returns {void}
 */
const send404 = (res) => {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
};

/**
 * Lädt aggregierte Statistiken für einen Short-Link und antwortet mit 200 JSON.
 * Schlägt mit 404 fehl wenn kein Link mit diesem Code existiert.
 * Schlägt mit 500 fehl wenn die Stats-Abfrage fehlschlägt.
 * @param {import("node:http").ServerResponse} res
 * @param {string} slug - Short-Link-Code
 * @returns {Promise<void>}
 */
const handleStats = async (res, slug) => {
  const result = await getStats(slug);
  if (!result.success && result.error === "NOT_FOUND") return send404(res);
  if (!result.success) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.data));
};

/**
 * Routet Anfragen unter /api/ an den passenden Handler:
 * GET|POST /api/links → handleLinks,
 * DELETE|PUT /api/links/:code → handleLinks mit Code,
 * PATCH /api/links/:code/toggle → handleLinks mit Code,
 * GET /api/links/:code/clicks → handleAnalytics,
 * GET /api/links/:code/stats → handleStats.
 * Alle anderen Pfade oder Methoden antworten mit 404.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} method - HTTP-Methode
 * @param {string} path - URL-Pfad
 * @returns {Promise<void>}
 */
const routeApi = async (req, res, method, path) => {
  if (["GET", "POST"].includes(method) && path === "/api/links")
    return await handleLinks(req, res, {});
  const codeMatch = path.match(/^\/api\/links\/([^/]+)$/);
  if (["DELETE", "PUT"].includes(method) && codeMatch)
    return await handleLinks(req, res, { code: codeMatch[1] });
  const toggleMatch = path.match(/^\/api\/links\/([^/]+)\/toggle$/);
  if (method === "PATCH" && toggleMatch)
    return await handleLinks(req, res, { code: toggleMatch[1] });
  const clicksMatch = path.match(/^\/api\/links\/([^/]+)\/clicks$/);
  if (method === "GET" && clicksMatch)
    return await handleAnalytics(req, res, { code: clicksMatch[1] });
  const statsMatch = path.match(/^\/api\/links\/([^/]+)\/stats$/);
  if (method === "GET" && statsMatch)
    return await handleStats(res, statsMatch[1]);
  send404(res);
};

/**
 * Routet GET-Anfragen: ein 6-stelliger alphanumerischer Pfad wird als
 * Short-Code interpretiert und an handleRedirect übergeben.
 * Alle anderen Pfade werden als statische Datei aus public/ bedient.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} path - URL-Pfad
 * @returns {Promise<void>}
 */
const routeGet = async (req, res, path) => {
  const codeMatch = path.match(/^\/([a-zA-Z0-9]{6})$/);
  if (codeMatch) return await handleRedirect(req, res, { code: codeMatch[1] });
  return await serveStatic(res, path);
};

/**
 * Einstiegspunkt für jeden Request: parst den Body bei POST/PUT,
 * leitet /api/*-Pfade an routeApi weiter, GET-Anfragen an routeGet.
 * Alle anderen Methoden auf Nicht-API-Pfaden antworten mit 404.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const routeRequest = async (req, res) => {
  const { method } = req;
  const path = new URL(req.url, `http://localhost:${PORT}`).pathname;
  if (["POST", "PUT"].includes(method)) req.body = await parseBody(req);
  if (path.startsWith("/api/")) return await routeApi(req, res, method, path);
  if (method === "GET") return await routeGet(req, res, path);
  send404(res);
};

const server = createServer(async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (error) {
    console.error("Unhandled error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
