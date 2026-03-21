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
 * Der error-String ist ein einheitlicher Fehler-Code den Routes auf
 * HTTP-Statuscodes mappen (z.B. NOT_FOUND → 404, INVALID_URL → 422).
 * @param {string} error - Fehler-Code (z.B. "NOT_FOUND", "INVALID_URL")
 * @returns {{ success: false, error: string }}
 */
export const err = (error) => ({ success: false, error });
