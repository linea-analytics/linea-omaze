import { PRIZE_CATS, CHANNELS, generateCurveParams, buildMonthlyCurves } from "./curves.js";
import { optimiseDiscrete, aggregateToMatrix } from "./optimiser.js";
import { loadState, saveState, clearState } from "./storage.js";
import { setStepUI, showView, renderPlanTables, renderChannelGrid, renderResultTable, money } from "./ui.js";

const STEP_VIEWS = ["viewHome", "viewPlan", "viewChannels", "viewRun", "viewResult"];
const STEP_LABELS = ["Home", "Scenario plan", "Marketing channels", "Run scenario", "View scenario"];

function defaultPlan() {
  // planByCat[cat] = boolean[12]
  const out = {};
  for (const cat of PRIZE_CATS) out[cat] = Array.from({ length: 12 }, () => false);

  // Reasonable defaults
  out.XXL[10] = true; out.XXL[11] = true; // Nov-Dec
  out.XL[5] = true;  out.XL[6] = true;   // Jun-Jul
  out.L[2] = true;   out.L[3] = true;    // Mar-Apr
  out.M[0] = true;   out.M[1] = true;    // Jan-Feb
  out.S[7] = true;   out.S[8] = true;    // Aug-Sep
  return out;
}

function buildEligibleKeys({ monthlyCurves, planByCat, selectedChannels }) {
  // Eligible keys are monthCurveKey like: `${monthIndex}__${cat}__${channelId}`
  const keys = [];
  for (const [k, c] of monthlyCurves.entries()) {
    const live = planByCat[c.prizeCat]?.[c.monthIndex] === true;
    const channelOn = selectedChannels.has(c.channelId);
    if (live && channelOn) keys.push(k);
  }
  return keys;
}

function setStep(stepIndex) {
  state.ui.stepIndex = stepIndex;
  setStepUI({ stepIndex, labels: STEP_LABELS });
  showView(STEP_VIEWS[stepIndex]);
}

function validatePlanHasAnyLiveMonth(planByCat) {
  for (const cat of PRIZE_CATS) {
    if (planByCat[cat].some(Boolean)) return true;
  }
  return false;
}

function countLiveMonths(planByCat) {
  let n = 0;
  for (const cat of PRIZE_CATS) n += planByCat[cat].filter(Boolean).length;
  return n;
}

const initial = loadState() ?? null;

const state = initial ?? {
  ui: { stepIndex: 0, lastResultId: null },
  planByCat: defaultPlan(),
  selectedChannels: CHANNELS.map((c) => c.id),
  scenarios: [],
};

// Pre-generate curves
const curveParams = generateCurveParams(1337);
const monthlyCurves = buildMonthlyCurves(curveParams);

// DOM refs
const planTablesEl = document.getElementById("planTables");
const channelGridEl = document.getElementById("channelGrid");

const scenarioNameEl = document.getElementById("scenarioName");
const scenarioBudgetEl = document.getElementById("scenarioBudget");
const runSummaryEl = document.getElementById("runSummary");
const runStatusEl = document.getElementById("runStatus");
const runErrorEl = document.getElementById("runError");

const resultTableEl = document.getElementById("resultTable");
const resultMetaEl = document.getElementById("resultMeta");

const helpModal = new bootstrap.Modal(document.getElementById("helpModal"));

// Init UI
(function init() {
  // Home actions
  document.getElementById("btnCreateScenario").addEventListener("click", () => {
    setStep(1);
    saveState(state);
  });

  document.getElementById("btnHelp").addEventListener("click", () => helpModal.show());

  document.getElementById("btnReset").addEventListener("click", () => {
    clearState();
    location.reload();
  });

  // Nav buttons (Prev/Next/Home)
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.nav;
      const i = state.ui.stepIndex;

      if (cmd === "prev") setStep(Math.max(0, i - 1));
      if (cmd === "next") setStep(Math.min(4, i + 1));
      if (cmd === "home") setStep(0);

      saveState(state);
      syncStepSpecificUI();
    });
  });

  // Plan tables
  renderPlanTables({ mountEl: planTablesEl, planByCat: state.planByCat });

  planTablesEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".month-cell");
    if (cell) {
      const cat = cell.dataset.cat;
      const m = Number(cell.dataset.month);
      state.planByCat[cat][m] = !state.planByCat[cat][m];
      cell.classList.toggle("is-on", state.planByCat[cat][m]);
      saveState(state);
      syncRunSummary();
      return;
    }

    const clearBtn = e.target.closest("[data-clear]");
    if (clearBtn) {
      const cat = clearBtn.dataset.clear;
      state.planByCat[cat] = Array.from({ length: 12 }, () => false);
      renderPlanTables({ mountEl: planTablesEl, planByCat: state.planByCat });
      saveState(state);
      syncRunSummary();
    }
  });

  // Channels
  const selected = new Set(state.selectedChannels);
  renderChannelGrid({ mountEl: channelGridEl, selected });

  channelGridEl.addEventListener("click", (e) => {
    const tile = e.target.closest(".channel-tile");
    if (!tile) return;
    const id = tile.dataset.channelId;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);

    state.selectedChannels = Array.from(selected);
    renderChannelGrid({ mountEl: channelGridEl, selected });
    saveState(state);
    syncRunSummary();
  });

  // Run and save
  document.getElementById("btnRunSave").addEventListener("click", async () => {
    runErrorEl.classList.add("d-none");
    runStatusEl.classList.remove("d-none");

    try {
      const name = (scenarioNameEl.value || "").trim() || "Untitled scenario";
      const budget = Math.max(0, Number(scenarioBudgetEl.value || 0));
      const selectedChannels = new Set(state.selectedChannels);

      if (!validatePlanHasAnyLiveMonth(state.planByCat)) {
        throw new Error("Please select at least one live month in the scenario plan.");
      }
      if (selectedChannels.size === 0) {
        throw new Error("Please select at least one marketing channel.");
      }
      if (budget <= 0) {
        throw new Error("Please enter a positive budget.");
      }

      const eligibleKeys = buildEligibleKeys({
        monthlyCurves,
        planByCat: state.planByCat,
        selectedChannels,
      });

      if (eligibleKeys.length === 0) {
        throw new Error("No eligible curves found. Check your live months and selected channels.");
      }

      // Simulate compute time slightly for demo feel
      await new Promise((r) => setTimeout(r, 350));

      const result = optimiseDiscrete({
        monthlyCurves,
        eligibleKeys,
        totalBudget: budget,
        step: 10000,
      });

      const matrix = aggregateToMatrix({ monthlyCurves, allocations: result.allocations });

      const scenario = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        name,
        budget,
        planByCat: structuredClone(state.planByCat),
        selectedChannels: Array.from(selectedChannels),
        optimiserMeta: result.meta,
        totalSpend: result.totalSpend,
        totalUplift: result.totalUplift,
        allocations: Array.from(result.allocations.entries()), // [monthCurveKey, spend]
        matrix: Array.from(matrix.entries()), // [channelId__prizeCat, spend]
      };

      state.scenarios.unshift(scenario);
      state.ui.lastResultId = scenario.id;

      saveState(state);
      runStatusEl.classList.add("d-none");

      // Move to results
      setStep(4);
      syncStepSpecificUI();
      saveState(state);

    } catch (err) {
      runStatusEl.classList.add("d-none");
      runErrorEl.textContent = err?.message || String(err);
      runErrorEl.classList.remove("d-none");
    }
  });

  // Result actions
  document.getElementById("btnDownloadJson").addEventListener("click", () => {
    const scenario = getLastScenario();
    if (!scenario) return;

    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `scenario_${scenario.id}.json`;
    a.click();

    URL.revokeObjectURL(url);
  });

  document.getElementById("btnNewScenario").addEventListener("click", () => {
    // Keep curves, reset plan+channels to defaults
    state.planByCat = defaultPlan();
    state.selectedChannels = CHANNELS.map((c) => c.id);

    renderPlanTables({ mountEl: planTablesEl, planByCat: state.planByCat });
    renderChannelGrid({ mountEl: channelGridEl, selected: new Set(state.selectedChannels) });

    scenarioNameEl.value = "";
    scenarioBudgetEl.value = "300000";

    saveState(state);
    setStep(1);
    syncRunSummary();
  });

  // Start at saved step or home
  setStep(state.ui.stepIndex ?? 0);
  syncStepSpecificUI();
  syncRunSummary();
})();

function getLastScenario() {
  const id = state.ui.lastResultId;
  if (id) return state.scenarios.find((s) => s.id === id) ?? null;
  return state.scenarios[0] ?? null;
}

function syncRunSummary() {
  const liveMonths = countLiveMonths(state.planByCat);
  const selectedCount = state.selectedChannels.length;
  const eligibleApprox = liveMonths * selectedCount; // per month-category combination, simplified

  runSummaryEl.textContent =
    `${liveMonths} live month selections · ${selectedCount} channels selected · ~${eligibleApprox} month-curves eligible`;
}

function syncStepSpecificUI() {
  const i = state.ui.stepIndex;

  if (i === 1) {
    renderPlanTables({ mountEl: planTablesEl, planByCat: state.planByCat });
  }

  if (i === 2) {
    renderChannelGrid({ mountEl: channelGridEl, selected: new Set(state.selectedChannels) });
  }

  if (i === 3) {
    syncRunSummary();
  }

  if (i === 4) {
    const scenario = getLastScenario();
    if (!scenario) return;

    const matrix = new Map(scenario.matrix);
    resultMetaEl.textContent =
      `${scenario.name} · Budget €${money(scenario.budget)} · Spent €${money(scenario.totalSpend)} · Eligible curves: ${scenario.optimiserMeta.eligibleCurves}`;

    renderResultTable({
      tableEl: resultTableEl,
      matrix,
      channels: CHANNELS,
      prizeCats: PRIZE_CATS,
    });
  }
}
