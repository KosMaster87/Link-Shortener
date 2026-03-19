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

const serveStatic = async (res, urlPath) => {
  const file = urlPath === "/" ? "/index.html" : urlPath;
  try {
    const content = await readFile(`./public${file}`);
    const mime = MIME_TYPES[extname(file)] ?? "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
};

const send404 = (res) => {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
};

const server = createServer(async (req, res) => {
  try {
    const { method } = req;
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (["POST", "PUT"].includes(method)) req.body = await parseBody(req);

    // POST /api/links
    if (method === "POST" && path === "/api/links")
      return await handleLinks(req, res, {});

    // GET /api/links
    if (method === "GET" && path === "/api/links")
      return await handleLinks(req, res, {});

    // DELETE /api/links/:code
    const deleteMatch =
      method === "DELETE" && path.match(/^\/api\/links\/([^/]+)$/);
    if (deleteMatch)
      return await handleLinks(req, res, { code: deleteMatch[1] });

    // GET /api/links/:code/clicks
    const clicksMatch =
      method === "GET" && path.match(/^\/api\/links\/([^/]+)\/clicks$/);
    if (clicksMatch)
      return await handleAnalytics(req, res, { code: clicksMatch[1] });

    // Static files (public/)
    if (method === "GET" && !path.startsWith("/api/")) {
      const codeMatch = path.match(/^\/([a-zA-Z0-9]{6})$/);
      if (codeMatch)
        return await handleRedirect(req, res, { code: codeMatch[1] });
      return await serveStatic(res, path);
    }

    send404(res);
  } catch (error) {
    console.error("Unhandled error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
