/**
 * Feedback-Widget für LinkShort.
 * Fügt einen "Feedback"-Button unten rechts ein.
 * Kein externes Tool, kein Drittanbieter.
 */
(function () {
  "use strict";

  const STYLES = `
    #ls-feedback-btn {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 9999px;
      padding: 0.6rem 1.1rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      z-index: 9998;
      transition: background 0.15s;
    }
    #ls-feedback-btn:hover { background: #4338ca; }

    #ls-feedback-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.35);
      z-index: 9999;
      align-items: center;
      justify-content: center;
    }
    #ls-feedback-overlay.ls-open { display: flex; }

    #ls-feedback-dialog {
      background: #fff;
      border-radius: 0.75rem;
      padding: 1.75rem;
      width: min(420px, calc(100vw - 2rem));
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #ls-feedback-dialog h2 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #111827;
      margin-bottom: 1.25rem;
    }
    #ls-feedback-dialog label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.3rem;
      margin-top: 0.9rem;
    }
    #ls-feedback-dialog label:first-of-type { margin-top: 0; }
    #ls-feedback-dialog select,
    #ls-feedback-dialog textarea,
    #ls-feedback-dialog input[type="email"] {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 0.4rem;
      padding: 0.5rem 0.65rem;
      font-size: 0.9rem;
      font-family: inherit;
      color: #111827;
      background: #f9fafb;
      box-sizing: border-box;
    }
    #ls-feedback-dialog textarea {
      resize: vertical;
      min-height: 90px;
    }
    #ls-feedback-dialog select:focus,
    #ls-feedback-dialog textarea:focus,
    #ls-feedback-dialog input[type="email"]:focus {
      outline: 2px solid #4f46e5;
      border-color: transparent;
      background: #fff;
    }
    #ls-feedback-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.6rem;
      margin-top: 1.25rem;
    }
    #ls-feedback-cancel {
      background: #f3f4f6;
      color: #374151;
      border: none;
      border-radius: 0.4rem;
      padding: 0.5rem 1rem;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }
    #ls-feedback-cancel:hover { background: #e5e7eb; }
    #ls-feedback-submit {
      background: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 0.4rem;
      padding: 0.5rem 1.1rem;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }
    #ls-feedback-submit:hover { background: #4338ca; }
    #ls-feedback-submit:disabled { opacity: 0.6; cursor: default; }
    #ls-feedback-success {
      text-align: center;
      padding: 1rem 0 0.5rem;
      color: #166534;
      font-size: 0.95rem;
      font-weight: 600;
    }
    #ls-feedback-error {
      color: #b91c1c;
      font-size: 0.8rem;
      margin-top: 0.5rem;
      display: none;
    }
  `;

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function buildWidget() {
    // Button
    const btn = document.createElement("button");
    btn.id = "ls-feedback-btn";
    btn.textContent = "Feedback";
    btn.setAttribute("aria-haspopup", "dialog");

    // Overlay
    const overlay = document.createElement("div");
    overlay.id = "ls-feedback-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ls-feedback-title");

    overlay.innerHTML = `
      <div id="ls-feedback-dialog">
        <h2 id="ls-feedback-title">Feedback geben</h2>
        <div id="ls-feedback-form-wrap">
          <label for="ls-fb-type">Kategorie</label>
          <select id="ls-fb-type">
            <option value="bug">Bug</option>
            <option value="improvement">Verbesserungsvorschlag</option>
            <option value="other">Sonstiges</option>
          </select>

          <label for="ls-fb-desc">Beschreibung <span aria-hidden="true">*</span></label>
          <textarea id="ls-fb-desc" maxlength="2000" placeholder="Was ist passiert? Was hast du erwartet?"></textarea>

          <label for="ls-fb-email">E-Mail <span style="font-weight:400;color:#6b7280;">(optional, für Rückfragen)</span></label>
          <input type="email" id="ls-fb-email" maxlength="254" placeholder="du@beispiel.de" autocomplete="email" />

          <div id="ls-feedback-error" role="alert"></div>

          <div id="ls-feedback-actions">
            <button id="ls-feedback-cancel" type="button">Abbrechen</button>
            <button id="ls-feedback-submit" type="button">Absenden</button>
          </div>
        </div>
        <div id="ls-feedback-success" hidden>Danke für dein Feedback!</div>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector("#ls-feedback-cancel");
    const submitBtn = overlay.querySelector("#ls-feedback-submit");
    const errorEl = overlay.querySelector("#ls-feedback-error");
    const formWrap = overlay.querySelector("#ls-feedback-form-wrap");
    const successEl = overlay.querySelector("#ls-feedback-success");

    btn.addEventListener("click", () => openDialog());
    cancelBtn.addEventListener("click", () => closeDialog());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDialog();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("ls-open"))
        closeDialog();
    });
    submitBtn.addEventListener("click", () => submitFeedback());

    function openDialog() {
      overlay.classList.add("ls-open");
      overlay.querySelector("#ls-fb-desc").focus();
    }

    function closeDialog() {
      overlay.classList.remove("ls-open");
      resetForm();
    }

    function resetForm() {
      overlay.querySelector("#ls-fb-type").value = "bug";
      overlay.querySelector("#ls-fb-desc").value = "";
      overlay.querySelector("#ls-fb-email").value = "";
      errorEl.style.display = "none";
      errorEl.textContent = "";
      formWrap.hidden = false;
      successEl.hidden = true;
      submitBtn.disabled = false;
    }

    async function submitFeedback() {
      const type = overlay.querySelector("#ls-fb-type").value;
      const description = overlay.querySelector("#ls-fb-desc").value.trim();
      const email = overlay.querySelector("#ls-fb-email").value.trim();

      if (!description) {
        errorEl.textContent = "Bitte gib eine Beschreibung ein.";
        errorEl.style.display = "block";
        overlay.querySelector("#ls-fb-desc").focus();
        return;
      }

      submitBtn.disabled = true;
      errorEl.style.display = "none";

      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            description,
            email: email || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Fehler beim Absenden.");
        }

        formWrap.hidden = true;
        successEl.hidden = false;
        setTimeout(() => closeDialog(), 2500);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
        submitBtn.disabled = false;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    injectStyles();
    buildWidget();
  }
})();
