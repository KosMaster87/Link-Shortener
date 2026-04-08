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

export const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
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
    url: process.env.DATABASE_URL?.trim() || "",
    host: optionalEnv("PGHOST", "/var/run/postgresql"),
    port: process.env.PGPORT?.trim() || "",
    database: optionalEnv("PGDATABASE", "linkshort"),
    user: optionalEnv("PGUSER", "dev2k"),
    password: process.env.PGPASSWORD?.trim() || "",
  },
};
