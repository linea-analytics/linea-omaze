export const PRIZE_CATS = ["XXL", "XL", "L", "M", "S"];

export const CHANNELS = [
  { id: "google_search", label: "Google Search", icon: "bi-search" },
  { id: "tiktok_video", label: "TikTok video", icon: "bi-tiktok" },
  { id: "meta_video", label: "Meta video", icon: "bi-meta" },
  { id: "youtube", label: "YouTube", icon: "bi-youtube" },
  { id: "outdoor_brand", label: "Outdoor (brand)", icon: "bi-badge-ad" },
  { id: "outdoor_perf", label: "Outdoor (performance)", icon: "bi-bullseye" },
  { id: "display", label: "Display", icon: "bi-window" },
  { id: "audio", label: "Audio", icon: "bi-soundwave" },
  { id: "affiliates", label: "Affiliates", icon: "bi-link-45deg" },
  { id: "crm", label: "CRM", icon: "bi-envelope-paper" },
];

// Spend grid: 0..100k by 10k (11 points)
export const SPEND_GRID = Array.from({ length: 11 }, (_, k) => k * 10000);
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Diminishing returns: simple saturating curve
export function dimRets(x, alpha) {
  // alpha > 0, higher alpha saturates slower
  return 1 - Math.exp(-x / alpha);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a += 0x6D2B79F5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

export function generateCurveParams(seed = 1234) {
  const rng = mulberry32(seed);

  // Rough “means” then jittered for 50 combos
  const coefMean = 120;          // uplift scale
  const coefSd = 35;

  const alphaMean = 60000;       // dimrets alpha around 60k
  const alphaSd = 15000;

  const prizeWeight = {
    XXL: 1.25,
    XL: 1.10,
    L: 1.00,
    M: 0.85,
    S: 0.70,
  };

  const channelWeight = {
    google_search: 1.20,
    tiktok_video: 0.95,
    meta_video: 1.00,
    youtube: 0.90,
    outdoor_brand: 0.80,
    outdoor_perf: 0.88,
    display: 0.92,
    audio: 0.78,
    affiliates: 1.05,
    crm: 1.15,
  };

  const params = [];
  for (const cat of PRIZE_CATS) {
    for (const ch of CHANNELS) {
      const coef = clamp(coefMean + coefSd * randn(rng), 25, 260) * (channelWeight[ch.id] ?? 1);
      const alpha = clamp(alphaMean + alphaSd * randn(rng), 20000, 120000);
      const prize = prizeWeight[cat] ?? 1;
      params.push({
        curveKey: `${cat}__${ch.id}`,
        prizeCat: cat,
        channelId: ch.id,
        coef,
        alpha,
        prize,
      });
    }
  }
  return params;
}

export function buildMonthlyCurves(params) {
  // Returns a map keyed by monthCurveKey = `${month}__${curveKey}`
  // Each item has spend->uplift values (arrays aligned with SPEND_GRID)
  const curves = new Map();

  for (let m = 0; m < 12; m++) {
    for (const p of params) {
      const monthCurveKey = `${m}__${p.curveKey}`;
      const uplift = SPEND_GRID.map((x) => p.coef * dimRets(x, p.alpha) * p.prize);
      curves.set(monthCurveKey, {
        monthIndex: m,
        monthCurveKey,
        curveKey: p.curveKey,
        prizeCat: p.prizeCat,
        channelId: p.channelId,
        spendGrid: SPEND_GRID,
        upliftGrid: uplift,
      });
    }
  }
  return curves;
}
