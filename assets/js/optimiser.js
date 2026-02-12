import { SPEND_GRID } from "./curves.js";

export function optimiseDiscrete({ monthlyCurves, eligibleKeys, totalBudget, step = 10000 }) {
  const steps = Math.floor(totalBudget / step);
  if (steps <= 0) {
    return {
      allocations: new Map(), // key -> spend
      totalSpend: 0,
      totalUplift: 0,
      meta: { steps: 0, step },
    };
  }

  // Prepare per-curve incremental gains for each step index
  // spendGrid is aligned with SPEND_GRID, which is 0..100k by 10k
  // stepIndex 0 means spend=0, stepIndex 1 means spend=10k, ...
  const curveState = new Map();
  for (const key of eligibleKeys) {
    const c = monthlyCurves.get(key);
    if (!c) continue;

    const inc = [];
    for (let k = 0; k < c.upliftGrid.length; k++) {
      if (k === 0) inc.push(0);
      else inc.push(c.upliftGrid[k] - c.upliftGrid[k - 1]);
    }

    curveState.set(key, {
      currentIndex: 0,
      inc,
      upliftGrid: c.upliftGrid,
      spendGrid: c.spendGrid,
    });
  }

  // If nothing eligible, return zeros
  if (curveState.size === 0) {
    return {
      allocations: new Map(),
      totalSpend: 0,
      totalUplift: 0,
      meta: { steps: 0, step },
    };
  }

  // Allocate
  for (let s = 0; s < steps; s++) {
    let bestKey = null;
    let bestGain = -Infinity;

    for (const [key, st] of curveState.entries()) {
      const nextIndex = st.currentIndex + 1;
      if (nextIndex >= st.inc.length) continue; // maxed out at 100k
      const gain = st.inc[nextIndex];
      if (gain > bestGain) {
        bestGain = gain;
        bestKey = key;
      }
    }

    if (!bestKey || bestGain <= 0) {
      // No positive marginal gain left (all saturated or maxed)
      break;
    }

    curveState.get(bestKey).currentIndex += 1;
  }

  // Summarise
  const allocations = new Map();
  let totalSpendUsed = 0;
  let totalUplift = 0;

  for (const [key, st] of curveState.entries()) {
    const idx = st.currentIndex;
    const spend = st.spendGrid[idx] ?? 0;
    const uplift = st.upliftGrid[idx] ?? 0;

    if (spend > 0) {
      allocations.set(key, spend);
      totalSpendUsed += spend;
      totalUplift += uplift;
    }
  }

  return {
    allocations,
    totalSpend: totalSpendUsed,
    totalUplift,
    meta: { stepsRequested: steps, step, eligibleCurves: curveState.size },
  };
}

// Helper: aggregate month-level allocations to (prizeCat x channelId)
export function aggregateToMatrix({ monthlyCurves, allocations }) {
  const matrix = new Map(); // `${channelId}__${prizeCat}` -> spend
  for (const [monthCurveKey, spend] of allocations.entries()) {
    const c = monthlyCurves.get(monthCurveKey);
    if (!c) continue;
    const cellKey = `${c.channelId}__${c.prizeCat}`;
    matrix.set(cellKey, (matrix.get(cellKey) ?? 0) + spend);
  }
  return matrix;
}
