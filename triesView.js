// triesView.js
// Single Responsibility: draw the blocked page's "Visits blocked" panel —
// the total, today's count, and (once counting has run a week) a bar per
// day — from a site's attempt record (see attempts.js). Pure view code: it
// reads nothing from storage and sends no messages.

import { t, fmtDay, dateLocale } from "./i18n.js";
import { todayCount, showsChart, dailySeries, addDays, CHART_AFTER_DAYS } from "./attempts.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Chart geometry, in viewBox units (the card's inner width, so 1 unit ≈ 1px).
const W = 352;
const PLOT_TOP = 14; // room for the top value label
const PLOT_H = 64;
const AXIS_H = 18; // the date labels under the baseline
const H = PLOT_TOP + PLOT_H + AXIS_H;
const MAX_BAR = 24; // bars never get thicker than this
const GAP = 2; // space between neighbouring bars
const RADIUS = 4; // rounded top, square at the baseline

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text != null) node.textContent = text;
  return node;
}

// "27 Oct" / "27. Okt.": the short date under the chart.
function shortDay(ts) {
  return new Date(ts).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
}

// A bar with a rounded top and a square bottom on the baseline.
function barPath(x, w, h, base) {
  const r = Math.min(RADIUS, w / 2, h);
  const top = base - h;
  return (
    `M${x},${base}V${top + r}` +
    `Q${x},${top} ${x + r},${top}` +
    `H${x + w - r}` +
    `Q${x + w},${top} ${x + w},${top + r}` +
    `V${base}Z`
  );
}

// els: { panel, total, sub, soon, chart, svg, tip, table }
export function renderTries(els, record, now = Date.now()) {
  if (!record) {
    els.panel.hidden = true;
    return;
  }
  els.panel.hidden = false;
  els.total.textContent = String(record.total || 0);
  els.sub.textContent = t("blkTriesSub", todayCount(record, now), fmtDay(record.since));

  if (!showsChart(record, now)) {
    els.chart.hidden = true;
    els.soon.textContent = t("blkTriesSoon", fmtDay(addDays(record.since, CHART_AFTER_DAYS)));
    return;
  }
  els.soon.textContent = "";
  els.chart.hidden = false;
  drawChart(els, dailySeries(record, now));
}

function drawChart(els, series) {
  const { svg, tip, table } = els;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const n = series.length;
  const slot = W / n;
  const barW = Math.min(MAX_BAR, slot - GAP);
  const max = Math.max(1, ...series.map((d) => d.count));
  const base = PLOT_TOP + PLOT_H;

  // One faint line at the highest day, labelled with its count.
  svg.append(
    el("line", { class: "grid", x1: 0, x2: W, y1: PLOT_TOP + 0.5, y2: PLOT_TOP + 0.5 }),
    el("text", { class: "axis", x: W, y: PLOT_TOP - 4, "text-anchor": "end" }, String(max))
  );

  const showTip = (d, cx, top, bar) => {
    for (const b of svg.querySelectorAll(".bar-mark.hot")) b.classList.remove("hot");
    bar.classList.add("hot");
    tip.textContent = t("blkTriesDay", fmtDay(d.ts), d.count);
    // Keep the tooltip inside the card at the left and right edges.
    const pct = Math.min(88, Math.max(12, (cx / W) * 100));
    tip.style.left = pct + "%";
    tip.style.top = (top / H) * 100 + "%"; // just above the bar

    tip.hidden = false;
  };
  const hideTip = () => {
    tip.hidden = true;
    for (const b of svg.querySelectorAll(".bar-mark.hot")) b.classList.remove("hot");
  };

  series.forEach((d, i) => {
    const x = i * slot + (slot - barW) / 2;
    const h = d.count ? Math.max(2, (d.count / max) * PLOT_H) : 0;
    // The hit area is the whole column, so a quiet day can be hovered too.
    const hit = el("rect", { class: "slot", x: i * slot, y: 0, width: slot, height: base });
    const bar = el("path", { class: "bar-mark", d: h ? barPath(x, barW, h, base) : "" });
    hit.addEventListener("mouseenter", () => showTip(d, x + barW / 2, base - h, bar));
    hit.addEventListener("mouseleave", hideTip);
    svg.append(hit, bar);
  });

  svg.append(el("line", { class: "base", x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5 }));
  const labelY = base + AXIS_H - 4;
  svg.append(
    el("text", { class: "axis", x: 0, y: labelY, "text-anchor": "start" }, shortDay(series[0].ts)),
    el("text", { class: "axis", x: W, y: labelY, "text-anchor": "end" }, t("blkToday"))
  );

  // The same numbers as a table, for screen readers.
  table.replaceChildren();
  const caption = document.createElement("caption");
  caption.textContent = t("blkTriesChart", n);
  table.append(caption);
  for (const d of series) {
    const row = table.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = fmtDay(d.ts);
    row.append(th);
    row.insertCell().textContent = String(d.count);
  }
}
