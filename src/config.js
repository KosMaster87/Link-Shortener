/**
 * @fileoverview Zentrale Runtime-Konfiguration
 * @description Liest Environment-Variablen zentral ein und validiert Pflichtwerte.
 * @module src/config
 */

/**
 * Liest eine Pflichtvariable aus der Umgebung.
 * @param {string} name
 * @returns {string}
 */
export const requireEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check .env or platform secrets.`,
    );
  }
  return value;
};

/**
 * Liest eine optionale Variable mit Fallback.
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
export const optionalEnv = (name, fallback) =>
  process.env[name]?.trim() || fallback;

/**
 * Parst einen Integer defensiv mit Fallback.
 * @param {string} raw
 * @param {number} fallback
 * @returns {number}
 */
const parseIntWithFallback = (raw, fallback) => {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const nodeEnv = optionalEnv("NODE_ENV", "development");
const isProduction = nodeEnv === "production";
const useDbUrl = optionalEnv("USE_DATABASE_URL", "false") === "true";

/**
 * DATABASE_URL wird nur genutzt wenn USE_DATABASE_URL=true.
 * Lokal/CI: USE_DATABASE_URL=false → PG*-Variablen greifen.
 * Production: USE_DATABASE_URL=true als Secret setzen.
 * Neon lokal testen: USE_DATABASE_URL=true temporär in .env.
 */
const resolveDatabaseUrl = () => {
  const url = process.env.DATABASE_URL?.trim() || "";
  if (useDbUrl && !url) {
    throw new Error(
      "USE_DATABASE_URL=true, aber DATABASE_URL fehlt. " +
        "Setze DATABASE_URL als Secret in der Deploy-Umgebung.",
    );
  }
  if (!url) return "";
  if (!useDbUrl) {
    console.warn(
      "[config] DATABASE_URL ist gesetzt, wird aber ignoriert " +
        "(USE_DATABASE_URL !== 'true'). Lokale PG*-Variablen werden genutzt.",
    );
    return "";
  }
  return url;
};

/**
 * PGUSER ist nur Pflicht wenn NICHT über DATABASE_URL verbunden wird.
 * Das hält Production (Neon/Render) und lokale Entwicklung getrennt.
 * @returns {string}
 */
const resolveDatabaseUser = () => {
  if (useDbUrl) {
    return process.env.PGUSER?.trim() || "";
  }
  return requireEnv("PGUSER");
};

export const config = {
  nodeEnv,
  isProduction,
  server: {
    port: parseIntWithFallback(optionalEnv("PORT", "3000"), 3000),
  },
  auth: {
    jwtSecret: requireEnv("JWT_SECRET"),
    sessionExpiry: parseIntWithFallback(
      optionalEnv("SESSION_EXPIRY", "86400"),
      86400,
    ),
  },
  anthropic: {
    apiKey: optionalEnv("ANTHROPIC_API_KEY", ""),
  },
  logging: {
    level: optionalEnv("LOG_LEVEL", "info"),
  },
  rateLimit: {
    max: parseIntWithFallback(optionalEnv("RATE_LIMIT_MAX", "100"), 100),
  },
  database: {
    url: resolveDatabaseUrl(),
    host: optionalEnv("PGHOST", "/var/run/postgresql"),
    port: process.env.PGPORT?.trim() || "",
    database: optionalEnv("PGDATABASE", "linkshort"),
    user: resolveDatabaseUser(),
    password: process.env.PGPASSWORD?.trim() || "",
  },
};
