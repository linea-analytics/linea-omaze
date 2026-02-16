/* Static demo SPA: pages are sections; routing via hash */

const PRIZES = ["XXL", "XL", "L", "M", "S"];
const DAYS = 30;

const CHANNELS = [
  { id: "google_search", label: "Google Search", icon: "bi-google" },
  { id: "tiktok_video", label: "TikTok Video", icon: "bi-tiktok" },
  { id: "meta_video", label: "Meta Video", icon: "bi-meta" },
  { id: "youtube", label: "YouTube", icon: "bi-youtube" },
  { id: "outdoor", label: "Outdoor", icon: "bi-badge-ad" },
  { id: "radio", label: "Radio", icon: "bi-broadcast" },
  { id: "display", label: "Display", icon: "bi-window" },
  { id: "programmatic", label: "Programmatic", icon: "bi-diagram-3" },
  { id: "email", label: "Email", icon: "bi-envelope" },
  { id: "affiliates", label: "Affiliates", icon: "bi-people" },
];

const SPEND_GRID = Array.from({ length: 11 }, (_, k) => k * 10000); // 0..100k by 10k
const STEP = 10000;

// App state
const state = {
  scenario: {
    name: "",
    budget: 500000,
    // plan[prize][day] boolean
    plan: Object.fromEntries(PRIZES.map(p => [p, Array(DAYS).fill(false)])),
    selectedChannels: new Set(CHANNELS.map(c => c.id)),
  },
  // synthetic parameters for 50 curves (channel x prize)
  curveParams: new Map(), // key `${prize}__${channel}` => { coef, dim, prize }
  // results
  results: null, // computed after run
};

// ---------- Helpers ----------
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function fmtGBP(n) {
  const v = Math.round(n);
  return v.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}
function fmtInt(n) {
  return Math.round(n).toLocaleString("en-GB");
}
function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function keyFor(prize, channel) { return `${prize}__${channel}`; }

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Diminishing returns function: saturating curve in [0..1)
function dimRets(x, dim) {
  // 1 - exp(-x/dim), dim ~ scale
  return 1 - Math.exp(-x / dim);
}

// ---------- Routing ----------
const PAGES = ["home", "plan", "channels", "run", "summary", "detail"];
function showPage(page) {
  for (const el of document.querySelectorAll(".page")) {
    el.classList.toggle("d-none", el.dataset.page !== page);
  }

  const resetBtn = document.getElementById("btnReset");
  resetBtn.classList.toggle("d-none", page === "home");

  updateNavPill();
  refreshRunStats();
}

function goTo(page) {
  if (!PAGES.includes(page)) page = "home";
  location.hash = `#/${page}`;
}

function currentPage() {
  const h = location.hash || "#/home";
  const m = h.match(/^#\/([^/]+)$/);
  return m ? m[1] : "home";
}

window.addEventListener("hashchange", () => showPage(currentPage()));

// ---------- UI builders ----------
function updateNavPill() {
  const pill = document.getElementById("navScenarioPill");
  const name = state.scenario.name?.trim();
  const activeDays = countActiveDays();
  const channels = state.scenario.selectedChannels.size;

  const label = name ? `${name} • ${channels} ch • ${activeDays} days` : `Draft • ${channels} ch • ${activeDays} days`;
  pill.textContent = label;
}

function countActiveDays() {
  let n = 0;
  for (const p of PRIZES) n += state.scenario.plan[p].filter(Boolean).length;
  return n;
}

function buildPlanTable() {
  const headerRow = document.getElementById("planHeaderRow");
  headerRow.innerHTML = `<th class="plan-sticky-col">Prize draw</th>` + Array.from({ length: DAYS }, (_, i) =>
    `<th class="text-center mini-mono" style="min-width:28px;">${i + 1}</th>`
  ).join("");

  const tbody = document.getElementById("planTbody");
  tbody.innerHTML = "";

  for (const prize of PRIZES) {
    const tr = document.createElement("tr");

    const th = document.createElement("th");
    th.className = "plan-sticky-col fw-semibold";
    th.textContent = prize;
    tr.appendChild(th);

    for (let d = 0; d < DAYS; d++) {
      const td = document.createElement("td");
      td.className = "plan-cell";
      td.dataset.prize = prize;
      td.dataset.day = String(d);
      td.innerHTML = `<i class="bi bi-check2 d-none"></i>`;

      td.addEventListener("click", () => {
        const on = !state.scenario.plan[prize][d];
        state.scenario.plan[prize][d] = on;
        paintPlanCell(td, on);
        updatePlanSummary();
        refreshRunStats();
        updateNavPill();
      });

      paintPlanCell(td, state.scenario.plan[prize][d]);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  updatePlanSummary();
}

function paintPlanCell(td, on) {
  td.classList.toggle("is-on", on);
  const icon = td.querySelector("i");
  icon.classList.toggle("d-none", !on);
}

function updatePlanSummary() {
  const activeDays = countActiveDays();
  document.getElementById("planSummary").textContent = `${activeDays.toLocaleString("en-GB")} active day cells selected.`;
}

function buildChannelsGrid() {
  const grid = document.getElementById("channelsGrid");
  grid.innerHTML = "";

  for (const ch of CHANNELS) {
    const col = document.createElement("div");
    col.className = "col-12 col-sm-6 col-lg-4";

    const on = state.scenario.selectedChannels.has(ch.id);
    const tile = document.createElement("div");
    tile.className = "channel-tile d-flex align-items-start gap-3";
    tile.dataset.channel = ch.id;

    tile.innerHTML = `
      <div class="pt-1">
        <i class="bi ${ch.icon} fs-4 text-dark"></i>
      </div>
      <div class="flex-grow-1">
        <div class="fw-semibold text-dark">${ch.label}</div>
        <div class="small text-secondary">${on ? "Included" : "Excluded"}</div>
      </div>
      <div class="pt-1">
        <span class="badge rounded-pill ${on ? "text-bg-primary" : "text-bg-light border text-dark"}">${on ? "On" : "Off"}</span>
      </div>
    `;

    tile.addEventListener("click", () => {
      if (state.scenario.selectedChannels.has(ch.id)) state.scenario.selectedChannels.delete(ch.id);
      else state.scenario.selectedChannels.add(ch.id);

      renderChannelsGridState();
      refreshRunStats();
      updateNavPill();
    });

    col.appendChild(tile);
    grid.appendChild(col);
  }

  renderChannelsGridState();
}

function renderChannelsGridState() {
  for (const tile of document.querySelectorAll(".channel-tile")) {
    const id = tile.dataset.channel;
    const on = state.scenario.selectedChannels.has(id);
    tile.classList.toggle("is-on", on);

    const badge = tile.querySelector(".badge");
    badge.className = `badge rounded-pill ${on ? "text-bg-primary" : "text-bg-light border text-dark"}`;
    badge.textContent = on ? "On" : "Off";

    const sub = tile.querySelector(".small.text-secondary");
    sub.textContent = on ? "Included" : "Excluded";
  }

  document.getElementById("channelsCount").textContent = String(state.scenario.selectedChannels.size);
}

// ---------- Synthetic data ----------
function initCurveParams() {
  // Deterministic-ish randomness so the demo feels stable across refreshes
  const rnd = mulberry32(1337);

  state.curveParams.clear();

  for (const prize of PRIZES) {
    for (const ch of CHANNELS) {
      // Means by prize (bigger prize draws usually have larger effect multipliers)
      const prizeMean = (
        prize === "XXL" ? 1.35 :
          prize === "XL" ? 1.20 :
            prize === "L" ? 1.05 :
              prize === "M" ? 0.95 : 0.85
      );

      // Channel-level means
      const coefMean = (
        ch.id.includes("search") ? 1.15 :
          ch.id.includes("youtube") ? 1.10 :
            ch.id.includes("tiktok") ? 1.05 :
              ch.id.includes("meta") ? 1.00 :
                ch.id.includes("outdoor") ? 0.90 :
                  0.95
      );

      // Randomness around means
      const coef = (600 + 900 * rnd()) * coefMean;       // roughly scales customers
      const dim = (25000 + 30000 * rnd());              // diminishing scale (higher = slower saturation)
      const prizeParam = prizeMean * (0.85 + 0.3 * rnd());

      state.curveParams.set(keyFor(prize, ch.id), { coef, dim, prizeParam });
    }
  }
}

// Customers for a given (prize, channel) at a spend level
function customersFor(prize, channelId, spend) {
  const p = state.curveParams.get(keyFor(prize, channelId));
  if (!p) return 0;
  const y = p.coef * dimRets(spend, p.dim) * p.prizeParam;
  return Math.max(0, y);
}

// ---------- Eligibility / options ----------
function buildEligibleDailyOptions() {
  // Options are (day, prize, channel) if that prize is active that day and channel selected
  const opts = [];
  const channels = Array.from(state.scenario.selectedChannels);

  for (let day = 0; day < DAYS; day++) {
    for (const prize of PRIZES) {
      if (!state.scenario.plan[prize][day]) continue;
      for (const ch of channels) {
        opts.push({ day, prize, ch });
      }
    }
  }
  return opts; // size up to activeDays * selectedChannels
}

function refreshRunStats() {
  const eligible = buildEligibleDailyOptions();
  document.getElementById("eligibleCount").textContent = String(eligible.length);
  document.getElementById("selectedChannelsLabel").textContent = String(state.scenario.selectedChannels.size);
  document.getElementById("activeDaysLabel").textContent = String(countActiveDays());

  const warnings = [];
  if (countActiveDays() === 0) warnings.push("Select at least one active day in the plan.");
  if (state.scenario.selectedChannels.size === 0) warnings.push("Select at least one channel.");
  document.getElementById("runWarnings").textContent = warnings.join(" ");

  const canRun = warnings.length === 0;
  document.getElementById("btnRunScenario").disabled = !canRun;
}

// ---------- Optimisation ----------
function runOptimiser(totalBudget) {
  // We allocate spend in STEP increments to the eligible (day, prize, channel) options.
  // Greedy hill-climb: at each step choose the option with the best marginal customers gain.
  //
  // This is essentially the incremental uplift sorting approach, but applied iteratively in a way
  // that is easy to show in a demo. (Your MD describes this incremental uplift selection flow.) :contentReference[oaicite:0]{index=0}

  const opts = buildEligibleDailyOptions();
  const n = opts.length;

  // Allocation arrays in spend steps (each option keeps an index into SPEND_GRID)
  const spendIdx = new Array(n).fill(0); // starts at 0 spend
  const spendVal = () => SPEND_GRID; // just for clarity

  const steps = Math.floor(clamp(totalBudget, 0, 1e9) / STEP);
  for (let s = 0; s < steps; s++) {
    let bestK = -1;
    let bestGainPerPound = -Infinity;

    for (let k = 0; k < n; k++) {
      const idx = spendIdx[k];
      if (idx >= SPEND_GRID.length - 1) continue; // already at max 100k

      const { prize, ch } = opts[k];
      const currSpend = SPEND_GRID[idx];
      const nextSpend = SPEND_GRID[idx + 1];

      const y0 = customersFor(prize, ch, currSpend);
      const y1 = customersFor(prize, ch, nextSpend);

      const gain = y1 - y0;
      const gainPerPound = gain / (nextSpend - currSpend);

      if (gainPerPound > bestGainPerPound) {
        bestGainPerPound = gainPerPound;
        bestK = k;
      }
    }

    if (bestK === -1) break; // nowhere else to allocate
    spendIdx[bestK] += 1;
  }

  // Build spend + customers per option
  const alloc = opts.map((o, k) => {
    const spend = SPEND_GRID[spendIdx[k]];
    const cust = customersFor(o.prize, o.ch, spend);
    return { ...o, spend, customers: cust };
  });

  return alloc;
}

function buildPreviousBaseline() {
  // Previous spend: £1M split randomly across ALL 1,500 daily options (30 days x 50 curves),
  // regardless of selection. This is a baseline for comparison.
  //
  // We create a full universe of 30*5*10 options, then randomly assign.
  const rnd = mulberry32(2026);
  const universe = [];

  for (let day = 0; day < DAYS; day++) {
    for (const prize of PRIZES) {
      for (const ch of CHANNELS) {
        universe.push({ day, prize, ch: ch.id });
      }
    }
  }

  const totalPrev = 1_000_000;
  const weights = universe.map(() => 0.2 + rnd()); // >0
  const wsum = sum(weights);

  const alloc = universe.map((o, i) => {
    const spend = totalPrev * (weights[i] / wsum);
    // clamp spend to 0..100k range for curve evaluation
    const spendClamped = clamp(spend, 0, 100000);
    const customers = customersFor(o.prize, o.ch, spendClamped);
    return { ...o, spend, customers };
  });

  return alloc;
}

// ---------- Aggregations for Pages 5 & 6 ----------
function aggregateByPrize(alloc) {
  const out = Object.fromEntries(PRIZES.map(p => [p, { spend: 0, customers: 0 }]));
  for (const a of alloc) {
    out[a.prize].spend += a.spend;
    out[a.prize].customers += a.customers;
  }
  return out;
}

function aggregateSpendMatrix(alloc) {
  // matrix[channelId][prize] = spend
  const matrix = Object.fromEntries(CHANNELS.map(c => [c.id, Object.fromEntries(PRIZES.map(p => [p, 0]))]));
  for (const a of alloc) {
    if (!matrix[a.ch]) continue;
    matrix[a.ch][a.prize] += a.spend;
  }
  return matrix;
}

function renderSummaryTable(optimAlloc, prevAlloc) {
  const optim = aggregateByPrize(optimAlloc);
  const prev = aggregateByPrize(prevAlloc);

  function cac(sp, cu) { return cu > 0 ? (sp / cu) : 0; }

  const metrics = [
    {
      key: "spend",
      label: "Spend",
      colour: "orange",
      rows: [
        { sub: "Optimised", get: p => optim[p].spend, fmt: fmtGBP },
        { sub: "Previous", get: p => prev[p].spend, fmt: fmtGBP },
        { sub: "Difference", get: p => (optim[p].spend - prev[p].spend), fmt: fmtGBP },
      ]
    },
    {
      key: "customers",
      label: "New customers",
      colour: "lilac",
      rows: [
        { sub: "Optimised", get: p => optim[p].customers, fmt: fmtInt },
        { sub: "Previous", get: p => prev[p].customers, fmt: fmtInt },
        { sub: "Difference", get: p => (optim[p].customers - prev[p].customers), fmt: fmtInt },
      ]
    },
    {
      key: "cac",
      label: "CAC",
      colour: "mint",
      rows: [
        { sub: "Optimised", get: p => cac(optim[p].spend, optim[p].customers), fmt: v => fmtGBP(v) },
        { sub: "Previous", get: p => cac(prev[p].spend, prev[p].customers), fmt: v => fmtGBP(v) },
        { sub: "Difference", get: p => (cac(optim[p].spend, optim[p].customers) - cac(prev[p].spend, prev[p].customers)), fmt: v => fmtGBP(v) },
      ]
    }
  ];

  // Scale bars once per metric across all its subrows + prizes
  const metricMaxAbs = {};
  for (const m of metrics) {
    const allVals = [];
    for (const r of m.rows) {
      for (const p of PRIZES) allVals.push(r.get(p));
    }
    metricMaxAbs[m.key] = Math.max(0, ...allVals.map(v => Math.abs(v)));
  }

  function barHtml(value, maxAbs, colourClass) {
    const pct = maxAbs > 0 ? clamp((Math.abs(value) / maxAbs) * 100, 0, 100) : 0;
    return `
      <div class="progress mt-1" aria-hidden="true">
        <div class="progress-bar ${colourClass}" style="width:${pct}%;"></div>
      </div>
    `;
  }

  // Totals (no bars). CAC totals are computed from total spend / total customers.
  function totalForRow(metricKey, rowObj) {
    if (metricKey === "cac") {
      const spendTotal = PRIZES.reduce((s, p) => s + (optim[p]?.spend ?? 0), 0);
      const custTotal  = PRIZES.reduce((s, p) => s + (optim[p]?.customers ?? 0), 0);

      const spendPrevTotal = PRIZES.reduce((s, p) => s + (prev[p]?.spend ?? 0), 0);
      const custPrevTotal  = PRIZES.reduce((s, p) => s + (prev[p]?.customers ?? 0), 0);

      if (rowObj.sub === "Optimised") return cac(spendTotal, custTotal);
      if (rowObj.sub === "Previous") return cac(spendPrevTotal, custPrevTotal);
      return cac(spendTotal, custTotal) - cac(spendPrevTotal, custPrevTotal);
    }

    return PRIZES.reduce((s, p) => s + (rowObj.get(p) ?? 0), 0);
  }

  const table = document.getElementById("summaryTable");
  table.innerHTML = `
    <thead class="table-light">
      <tr>
        <th style="min-width: 220px;">Metric</th>
        ${PRIZES.map(p => `<th class="text-center">${p}</th>`).join("")}
        <th class="text-center">Total</th>
      </tr>
    </thead>
    <tbody>
      ${metrics.map(m => {
        const maxAbs = metricMaxAbs[m.key];
        const colourClass =
          m.colour === "orange" ? "bar-orange" :
          m.colour === "lilac"  ? "bar-lilac"  :
                                  "bar-mint";

        return m.rows.map((r, idx) => `
          <tr>
            <td class="${idx === 0 ? "fw-semibold" : ""}">
              ${idx === 0 ? m.label : `<span class="text-secondary">${m.label}</span>`}
              <div class="small text-secondary">${r.sub}</div>
            </td>

            ${PRIZES.map(p => {
              const v = r.get(p);
              return `
                <td class="text-center mini-mono">
                  <div>${r.fmt(v)}</div>
                  ${barHtml(v, maxAbs, colourClass)}
                </td>
              `;
            }).join("")}

            ${(() => {
              const tv = totalForRow(m.key, r);
              return `
                <td class="text-center mini-mono fw-semibold">
                  <div>${r.fmt(tv)}</div>
                </td>
              `;
            })()}
          </tr>
        `).join("");
      }).join("")}
    </tbody>
  `;
}



function renderDetailTable(optimAlloc) {
  const matrix = aggregateSpendMatrix(optimAlloc);

  // Find max spend in the 10x5 matrix for scaling bars
  let maxCell = 0;
  for (const ch of CHANNELS) {
    for (const p of PRIZES) maxCell = Math.max(maxCell, matrix[ch.id][p]);
  }

  const table = document.getElementById("detailTable");
  table.innerHTML = `
    <thead class="table-light">
      <tr>
        <th style="min-width: 220px;">Channel</th>
        ${PRIZES.map(p => `<th class="text-center">${p}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${CHANNELS.map(ch => {
    return `
          <tr>
            <td class="fw-semibold">${ch.label}</td>
            ${PRIZES.map(p => {
      const v = matrix[ch.id][p];
      const pct = maxCell > 0 ? clamp((v / maxCell) * 100, 0, 100) : 0;
      return `
                <td class="text-center mini-mono">
                  <div>${fmtGBP(v)}</div>
                  <div class="progress mt-1" aria-hidden="true">
                    <div class="progress-bar" style="width:${pct}%;"></div>
                  </div>
                </td>
              `;
    }).join("")}
          </tr>
        `;
  }).join("")}

      ${(() => {
      const totals = Object.fromEntries(PRIZES.map(p => [p, 0]));
      for (const ch of CHANNELS) for (const p of PRIZES) totals[p] += matrix[ch.id][p];
      return `
          <tr class="table-light">
            <td class="fw-semibold">Total</td>
            ${PRIZES.map(p => `<td class="text-center mini-mono fw-semibold">${fmtGBP(totals[p])}</td>`).join("")}
          </tr>
        `;
    })()}
    </tbody>
  `;
}

// ---------- Events ----------
document.getElementById("btnCreateScenario").addEventListener("click", () => {
  goTo("plan");
});

document.getElementById("btnReset").addEventListener("click", () => {
  state.scenario.name = "";
  state.scenario.budget = 500000;
  state.scenario.selectedChannels = new Set(CHANNELS.map(c => c.id));
  state.scenario.plan = Object.fromEntries(PRIZES.map(p => [p, Array(DAYS).fill(false)]));
  state.results = null;

  buildPlanTable();
  buildChannelsGrid();
  document.getElementById("scenarioName").value = "";
  document.getElementById("scenarioBudget").value = 500000;
  document.getElementById("navScenarioPill").textContent = "No scenario";
  goTo("home");
});

document.getElementById("btnPlanClear").addEventListener("click", () => {
  for (const p of PRIZES) state.scenario.plan[p] = Array(DAYS).fill(false);
  buildPlanTable();
  refreshRunStats();
  updateNavPill();
});

const default_bursts = {
  XXL: [[4, 8], [18, 21]],
  XL: [[2, 6], [14, 17], [25, 27]],
  L: [[8, 12], [22, 24]],
  M: [[0, 3], [12, 14], [27, 29]],
  S: [[6, 9], [16, 19]],
};

document.getElementById("btnPlanFillDemo").addEventListener("click", () => {
  // A simple staggered pattern
  for (const p of PRIZES) state.scenario.plan[p] = Array(DAYS).fill(false);

  const bursts = {
    XXL: [[4, 8], [18, 21]],
    XL: [[2, 6], [14, 17], [25, 27]],
    L: [[8, 12], [22, 24]],
    M: [[0, 3], [12, 14], [27, 29]],
    S: [[6, 9], [16, 19]],
  };

  for (const prize of PRIZES) {
    for (const [a, b] of bursts[prize]) {
      for (let d = a; d <= b; d++) state.scenario.plan[prize][d] = true;
    }
  }

  buildPlanTable();
  refreshRunStats();
  updateNavPill();
});

function setDefaultState() {
  // A simple staggered pattern
  for (const p of PRIZES) state.scenario.plan[p] = Array(DAYS).fill(false);

  const bursts = {
    XXL: [[4, 8], [18, 21]],
    XL: [[2, 6], [14, 17], [25, 27]],
    L: [[8, 12], [22, 24]],
    M: [[0, 3], [12, 14], [27, 29]],
    S: [[6, 9], [16, 19]],
  };

  for (const prize of PRIZES) {
    for (const [a, b] of bursts[prize]) {
      for (let d = a; d <= b; d++) state.scenario.plan[prize][d] = true;
    }
  }

  buildPlanTable();
  refreshRunStats();

}

document.getElementById("btnChannelsAll").addEventListener("click", () => {
  state.scenario.selectedChannels = new Set(CHANNELS.map(c => c.id));
  renderChannelsGridState();
  refreshRunStats();
  updateNavPill();
});
document.getElementById("btnChannelsNone").addEventListener("click", () => {
  state.scenario.selectedChannels = new Set();
  renderChannelsGridState();
  refreshRunStats();
  updateNavPill();
});

document.getElementById("scenarioName").addEventListener("input", (e) => {
  state.scenario.name = e.target.value;
  updateNavPill();
});
document.getElementById("scenarioBudget").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  state.scenario.budget = Number.isFinite(v) ? v : 0;
});

document.getElementById("btnRunScenario").addEventListener("click", () => {
  const name = document.getElementById("scenarioName").value.trim();
  const budget = Number(document.getElementById("scenarioBudget").value || 0);
  setDefaultState();

  state.scenario.name = name || "Untitled scenario";
  state.scenario.budget = clamp(budget, 0, 50_000_000);

  const optimAlloc = runOptimiser(state.scenario.budget);
  const prevAlloc = buildPreviousBaseline();

  state.results = { optimAlloc, prevAlloc };

  document.getElementById("summarySubtitle").textContent =
    `${state.scenario.name} • Budget ${fmtGBP(state.scenario.budget)} • Optimised vs previous baseline`;

  renderSummaryTable(optimAlloc, prevAlloc);
  renderDetailTable(optimAlloc);

  updateNavPill();
  goTo("summary");
});

// Prev/Next buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-nav]");
  if (!btn) return;

  const dir = btn.getAttribute("data-nav");
  const page = currentPage();
  const i = PAGES.indexOf(page);

  if (dir === "prev") goTo(PAGES[clamp(i - 1, 0, PAGES.length - 1)]);
  if (dir === "next") goTo(PAGES[clamp(i + 1, 0, PAGES.length - 1)]);
});

// ---------- Init ----------
function init() {
  initCurveParams();
  buildPlanTable();
  buildChannelsGrid();

  // default route
  if (!location.hash) goTo("home");
  else showPage(currentPage());

  // initial nav pill and stats
  updateNavPill();
  refreshRunStats();
}

init();
