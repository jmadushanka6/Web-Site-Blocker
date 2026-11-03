// popupReview.js
// The review step: a second look at a new block before its timer starts,
// for the cases review.js picks out (a first block, the 30-day timer, a
// typed page, a site with important subdomains). It says when the block can
// first be removed, lets the user change the timer, and starts the block
// only on "Block for …". Cancel (or Escape) leaves everything as it was.
import { t, durationLabel, fmtDateTime } from "./i18n.js";
import { broadWarningKey, typedPath } from "./review.js";

// onShow / onHide: the popup sets its form and list aside while the review
// is up, and brings them back afterwards.
export function setUpReview({ onShow, onHide }) {
  const box = document.getElementById("review");
  const titleEl = document.getElementById("reviewTitle");
  const segEl = document.getElementById("reviewDur");
  const whenEl = document.getElementById("reviewWhen");
  const warnEl = document.getElementById("reviewWarn");
  const noteEl = document.getElementById("reviewNote");
  const confirmBtn = document.getElementById("reviewConfirm");
  const cancelBtn = document.getElementById("reviewCancel");

  let durations = [];
  let onConfirm = null;

  function selected() {
    const radio = segEl.querySelector("input:checked");
    return durations.find((o) => radio && String(o.ms) === radio.value) || durations[0];
  }

  // The removal date and the button's wording follow the timer picked.
  function update() {
    const o = selected();
    whenEl.textContent = t("reviewWhen", fmtDateTime(Date.now() + o.ms));
    confirmBtn.textContent = t("reviewConfirm", durationLabel(o));
  }

  function hide() {
    if (box.hidden) return;
    box.hidden = true;
    onConfirm = null;
    onHide();
  }

  confirmBtn.addEventListener("click", () => {
    const start = onConfirm;
    const ms = selected().ms;
    hide();
    if (start) start(ms);
  });
  cancelBtn.addEventListener("click", hide);
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  });
  segEl.addEventListener("change", update);

  function warningsFor(domain, input) {
    const warnings = [];
    const path = typedPath(input);
    if (path) warnings.push(t("reviewPath", domain, path));
    const broad = broadWarningKey(domain);
    if (broad) warnings.push(t(broad));
    return warnings;
  }

  return {
    // domain: the site to block. input: what the user typed, or null for the
    // one-click button. durationMs: the timer picked so far. options: the
    // timer choices. confirm(durationMs): starts the block.
    show({ domain, input = null, durationMs, options, confirm }) {
      durations = options;
      onConfirm = confirm;
      titleEl.textContent = t("reviewTitle", domain);

      const pick = options.some((o) => o.ms === durationMs) ? durationMs : options[0].ms;
      segEl.querySelectorAll(".seg-opt").forEach((el) => el.remove());
      for (const o of options) {
        const label = document.createElement("label");
        label.className = "seg-opt";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "reviewDur";
        radio.value = String(o.ms);
        radio.checked = o.ms === pick;
        const text = document.createElement("span");
        text.textContent = durationLabel(o);
        label.append(radio, text);
        segEl.appendChild(label);
      }

      warnEl.innerHTML = "";
      for (const w of warningsFor(domain, input)) {
        const li = document.createElement("li");
        li.textContent = w;
        warnEl.appendChild(li);
      }
      warnEl.hidden = warnEl.childElementCount === 0;

      noteEl.textContent = t("reviewSubdomains", domain);
      update();
      box.hidden = false;
      onShow();
      // Start on Cancel, so a stray Enter doesn't start a timer.
      cancelBtn.focus();
    },
    hide,
  };
}
