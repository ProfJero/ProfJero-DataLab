/**
 * Trusted statistics. All functions operate on frequency distributions
 * (value → count) so large surveys never need to be materialised in memory.
 */
export interface Bucket {
  value: number;
  count: number;
}

export interface Descriptive {
  n: number;
  mean: number | null;
  median: number | null;
  mode: number[];
  min: number | null;
  max: number | null;
  stdDev: number | null;
  q1: number | null;
  q3: number | null;
  sum: number;
}

function normalise(dist: Bucket[]): Bucket[] {
  const m = new Map<number, number>();
  for (const b of dist) {
    if (!Number.isFinite(b.value) || !(b.count > 0)) continue;
    m.set(b.value, (m.get(b.value) ?? 0) + b.count);
  }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
}

export function totalCount(dist: Bucket[]): number {
  return normalise(dist).reduce((s, b) => s + b.count, 0);
}

/** Value at a 0-based rank in the sorted expanded distribution. */
function valueAtRank(d: Bucket[], rank: number): number {
  let acc = 0;
  for (const b of d) {
    acc += b.count;
    if (rank < acc) return b.value;
  }
  return d[d.length - 1].value;
}

/** Quantile using linear interpolation between closest ranks (type 7, as in R/Excel). */
export function quantile(dist: Bucket[], p: number): number | null {
  const d = normalise(dist);
  const n = d.reduce((s, b) => s + b.count, 0);
  if (n === 0) return null;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const vlo = valueAtRank(d, lo);
  const vhi = valueAtRank(d, hi);
  return vlo + (h - lo) * (vhi - vlo);
}

export function describe(dist: Bucket[]): Descriptive {
  const d = normalise(dist);
  const n = d.reduce((s, b) => s + b.count, 0);
  if (n === 0) return { n: 0, mean: null, median: null, mode: [], min: null, max: null, stdDev: null, q1: null, q3: null, sum: 0 };
  const sum = d.reduce((s, b) => s + b.value * b.count, 0);
  const mean = sum / n;
  const ss = d.reduce((s, b) => s + b.count * (b.value - mean) ** 2, 0);
  const maxCount = Math.max(...d.map((b) => b.count));
  return {
    n,
    sum,
    mean,
    median: quantile(d, 0.5),
    mode: d.filter((b) => b.count === maxCount).map((b) => b.value),
    min: d[0].value,
    max: d[d.length - 1].value,
    stdDev: n > 1 ? Math.sqrt(ss / (n - 1)) : 0,
    q1: quantile(d, 0.25),
    q3: quantile(d, 0.75),
  };
}

/** Values outside 1.5×IQR fences (Tukey). Returns the outlying buckets. */
export function outliers(dist: Bucket[]): { lower: number | null; upper: number | null; buckets: Bucket[] } {
  const s = describe(dist);
  if (s.n < 4 || s.q1 === null || s.q3 === null) return { lower: null, upper: null, buckets: [] };
  const iqr = s.q3 - s.q1;
  const lower = s.q1 - 1.5 * iqr;
  const upper = s.q3 + 1.5 * iqr;
  return { lower, upper, buckets: normalise(dist).filter((b) => b.value < lower || b.value > upper) };
}

/** Percentage rounded to `dp` decimals. Returns 0 when the denominator is 0. */
export function percent(part: number, whole: number, dp = 1): number {
  if (!whole) return 0;
  const f = 10 ** dp;
  return Math.round((part / whole) * 100 * f) / f;
}

export function round(n: number | null, dp = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/* ---------- Chi-square test of independence ---------- */

function logGamma(z: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularised upper incomplete gamma Q(a, x). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 500; n++) {
      del *= x / (a + n);
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export function chiSquarePValue(chi2: number, df: number): number {
  if (df <= 0) return 1;
  return gammaQ(df / 2, chi2 / 2);
}

export interface ChiSquareResult {
  chi2: number;
  df: number;
  pValue: number;
  cramersV: number;
  n: number;
  /** True when >20% of expected counts are below 5 (test may be unreliable). */
  lowExpected: boolean;
}

/** Pearson chi-square test on a contingency table of observed counts. */
export function chiSquare(table: number[][]): ChiSquareResult | null {
  const rows = table.filter((r) => r.reduce((a, b) => a + b, 0) > 0);
  if (rows.length < 2) return null;
  const nCols = rows[0].length;
  const colTotals = Array.from({ length: nCols }, (_, j) => rows.reduce((s, r) => s + r[j], 0));
  const keepCols = colTotals.map((t, j) => (t > 0 ? j : -1)).filter((j) => j >= 0);
  if (keepCols.length < 2) return null;
  const t = rows.map((r) => keepCols.map((j) => r[j]));
  const rt = t.map((r) => r.reduce((a, b) => a + b, 0));
  const ct = keepCols.map((_, j) => t.reduce((s, r) => s + r[j], 0));
  const n = rt.reduce((a, b) => a + b, 0);
  let chi2 = 0;
  let low = 0;
  for (let i = 0; i < t.length; i++)
    for (let j = 0; j < ct.length; j++) {
      const e = (rt[i] * ct[j]) / n;
      if (e < 5) low++;
      chi2 += (t[i][j] - e) ** 2 / e;
    }
  const df = (t.length - 1) * (ct.length - 1);
  const k = Math.min(t.length, ct.length);
  return { chi2, df, pValue: chiSquarePValue(chi2, df), cramersV: Math.sqrt(chi2 / (n * (k - 1))), n, lowExpected: low / (t.length * ct.length) > 0.2 };
}

/* ---------- Text analysis helpers ---------- */

export const STOPWORDS = new Set(
  "a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves also just really get got like will one much many even well yes no n/a na none nothing thing things lot".split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export function keywordFrequency(texts: string[], top = 20): { word: string; count: number; documents: number }[] {
  const freq = new Map<string, { count: number; documents: number }>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const w of tokenize(t)) {
      const e = freq.get(w) ?? { count: 0, documents: 0 };
      e.count++;
      if (!seen.has(w)) {
        e.documents++;
        seen.add(w);
      }
      freq.set(w, e);
    }
  }
  return [...freq.entries()]
    .map(([word, v]) => ({ word, ...v }))
    .sort((a, b) => b.documents - a.documents || b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, top);
}

/** Remove obvious personal identifiers before text leaves the platform. */
export function redactPII(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\+?\d[\d ()\-.]{7,}\d/g, "[phone]")
    .replace(/https?:\/\/\S+/g, "[link]");
}
