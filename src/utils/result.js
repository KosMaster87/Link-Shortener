/**
 * @fileoverview Result-Helper für einheitliches Error Handling
 * @description Stellt ok/err Factory-Funktionen bereit, sodass Services
 *   immer ein einheitliches Result-Objekt zurückgeben statt Exceptions zu werfen.
 * @module src/utils/result
 */

/**
 * Erzeugt ein erfolgreiches Result-Objekt.
 * data ist undefined wenn ohne Argument aufgerufen (z.B. bei void-Operationen
 * wie deleteLink oder recordClick).
 * @param {*} data - Nutzdaten des Ergebnisses
 * @returns {{ success: true, data: * }}
 */
export const ok = (data) => ({ success: true, data });

/**
 * Erzeugt ein fehlgeschlagenes Result-Objekt.
 * Normalisiert den Input defensiv zu einem Objekt mit `code`-Feld:
 *   - String      → `{ code: input }`
 *   - `{ code, … }` → unverändert durchreichen
 *   - `{ …kein code }` → `{ code: "UNEXPECTED", …input }`
 * @param {string | { code: string, message?: string, [key: string]: * }} input
 * @returns {{ success: false, error: { code: string, message?: string } }}
 */
export const err = (input) => {
  if (typeof input === "string")
    return { success: false, error: { code: input } };
  if (input?.code) return { success: false, error: input };
  return { success: false, error: { code: "UNEXPECTED", ...input } };
};
