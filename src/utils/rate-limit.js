/**
 * @fileoverview In-Memory Rate-Limiter (Sliding Window)
 * @description Begrenzt Requests pro IP und Bucket. Keine externen Packages.
 * @module src/utils/rate-limit
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} max      - Max. Requests pro Fenster
 * @property {number} windowMs - Fenstergröße in Millisekunden
 */

/** @type {Map<string, number[]>} IP+Bucket → Timestamp-Array */
const store = new Map();

const CLEANUP_INTERVAL_MS = 60_000;

/** Entfernt abgelaufene Einträge aus dem Store. */
const cleanup = () => {
  const now = Date.now();
  for (const [key, timestamps] of store) {
    const valid = timestamps.filter((t) => now - t < CLEANUP_INTERVAL_MS * 10);
    if (valid.length === 0) store.delete(key);
    else store.set(key, valid);
  }
};

// .unref() prevents this timer from keeping the process alive — important for test runs.
setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();

/**
 * Prüft ob eine IP für einen Bucket das Limit überschritten hat.
 * Gibt true zurück wenn die Anfrage erlaubt ist, false wenn geblockt.
 * @param {string} ip
 * @param {string} bucket - z.B. "general" | "createLink" | "login"
 * @param {RateLimitConfig} config
 * @returns {boolean}
 */
export const isAllowed = (ip, bucket, config) => {
  const key = `${ip}:${bucket}`;
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter(
    (t) => now - t < config.windowMs,
  );
  if (timestamps.length >= config.max) return false;
  store.set(key, [...timestamps, now]);
  return true;
};

/** Vordefinierte Buckets mit ihren Limits. */
export const LIMITS = {
  general: { max: 100, windowMs: 60_000 },
  createLink: { max: 10, windowMs: 60_000 },
  // Tight limit to slow brute-force attacks; 5 wrong attempts/min per IP is already generous.
  login: { max: 5, windowMs: 60_000 },
};
