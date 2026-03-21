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
 * Routet Anfragen unter /api/ an den passenden Handler:
 * GET|POST /api/links → handleLinks,
 * DELETE /api/links/:code → handleLinks mit Code,
 * GET /api/links/:code/clicks → handleAnalytics.
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
  const deleteMatch = path.match(/^\/api\/links\/([^/]+)$/);
  if (method === "DELETE" && deleteMatch)
    return await handleLinks(req, res, { code: deleteMatch[1] });
  const clicksMatch = path.match(/^\/api\/links\/([^/]+)\/clicks$/);
  if (method === "GET" && clicksMatch)
    return await handleAnalytics(req, res, { code: clicksMatch[1] });
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
