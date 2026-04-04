/**
 * @fileoverview Geräte-Klassifizierung aus User-Agent-Strings
 * @description Klassifiziert User-Agents als "mobile", "tablet" oder "desktop"
 *   anhand von Substring-Matching. Tablet-Patterns werden vor Mobile geprüft,
 *   da Android-Tablet-UAs "android" enthalten würden und sonst als Mobile zählen.
 * @module src/utils/device-classifier
 */

// Tablet-Prüfung muss vor Mobile erfolgen:
// Android-Tablet-UAs enthalten "android" (Mobile-Pattern) UND "tablet".
// Würden wir Mobile zuerst prüfen, würden Tablets fälschlich als Mobile zählen.
const TABLET_PATTERNS = ["ipad", "tablet", "kindle", "playbook", "silk"];
const MOBILE_PATTERNS = [
  "mobile",
  "android",
  "iphone",
  "ipod",
  "blackberry",
  "windows phone",
  "opera mini",
];

/**
 * Klassifiziert einen User-Agent-String als Gerätetyp.
 * null, undefined und leere Strings werden als "desktop" behandelt.
 * @param {string | null | undefined} userAgent
 * @returns {"mobile" | "tablet" | "desktop"}
 */
export const classifyDevice = (userAgent) => {
  if (!userAgent) return "desktop";
  const lower = userAgent.toLowerCase();
  if (TABLET_PATTERNS.some((p) => lower.includes(p))) return "tablet";
  if (MOBILE_PATTERNS.some((p) => lower.includes(p))) return "mobile";
  return "desktop";
};
