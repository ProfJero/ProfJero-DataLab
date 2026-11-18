import { describe as d, expect, it } from "vitest";
import { chiSquare, chiSquarePValue, describe, keywordFrequency, outliers, percent, quantile, redactPII, tokenize } from "../src/stats";

const expand = (vals: number[]) => {
  const m = new Map<number, number>();
  vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  return [...m].map(([value, count]) => ({ value, count }));
};

d("descriptive statistics", () => {
  it("computes mean, median, mode, min, max, sd from a distribution", () => {
    const s = describe(expand([1, 2, 2, 3, 4, 5, 5, 5]));
    expect(s.n).toBe(8);
    expect(s.mean).toBeCloseTo(3.375, 10);
    expect(s.median).toBe(3.5);
    expect(s.mode).toEqual([5]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    // sample sd computed independently: sqrt(sum((x-mean)^2)/(n-1))
    const xs = [1, 2, 2, 3, 4, 5, 5, 5];
    const m = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
    expect(s.stdDev).toBeCloseTo(sd, 10);
  });
  it("matches R type-7 quantiles", () => {
    const dist = expand([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(quantile(dist, 0.25)).toBeCloseTo(3.25);
    expect(quantile(dist, 0.75)).toBeCloseTo(7.75);
    expect(quantile(dist, 0.5)).toBeCloseTo(5.5);
  });
  it("handles empty and single-value data", () => {
    expect(describe([]).mean).toBeNull();
    expect(describe([]).n).toBe(0);
    const one = describe([{ value: 7, count: 1 }]);
    expect(one.median).toBe(7);
    expect(one.stdDev).toBe(0);
  });
  it("ignores invalid buckets and merges duplicates", () => {
    const s = describe([{ value: 2, count: 1 }, { value: 2, count: 2 }, { value: NaN, count: 3 }, { value: 9, count: 0 }]);
    expect(s.n).toBe(3);
    expect(s.mean).toBe(2);
  });
  it("detects Tukey outliers", () => {
    const o = outliers(expand([10, 11, 12, 12, 13, 13, 14, 100]));
    expect(o.buckets.map((b) => b.value)).toEqual([100]);
  });
});

d("percent", () => {
  it("rounds to one decimal and guards zero", () => {
    expect(percent(48, 80)).toBe(60);
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(5, 0)).toBe(0);
  });
});

d("chi-square", () => {
  it("matches a known textbook result", () => {
    // Observed: [[10, 20], [20, 40]] → perfectly independent → chi2 = 0
    const r = chiSquare([[10, 20], [20, 40]])!;
    expect(r.chi2).toBeCloseTo(0, 10);
    expect(r.pValue).toBeCloseTo(1, 6);
  });
  it("computes chi2 and p-value for a 2x2 table", () => {
    // scipy.stats.chi2_contingency([[30,10],[10,30]], correction=False) → chi2=20.0, p≈7.744e-06
    const r = chiSquare([[30, 10], [10, 30]])!;
    expect(r.chi2).toBeCloseTo(20, 8);
    expect(r.df).toBe(1);
    expect(r.pValue).toBeCloseTo(7.744e-6, 8);
    expect(r.cramersV).toBeCloseTo(0.5, 8);
  });
  it("computes p-value for larger df", () => {
    // chi2 = 11.07 with df = 5 → p ≈ 0.05
    expect(chiSquarePValue(11.0705, 5)).toBeCloseTo(0.05, 3);
  });
  it("returns null when a dimension has fewer than two categories", () => {
    expect(chiSquare([[5, 5]])).toBeNull();
    expect(chiSquare([[5, 0], [3, 0]])).toBeNull();
  });
});

d("text helpers", () => {
  it("tokenizes without stopwords", () => {
    expect(tokenize("The network is SLOW and the data is expensive!")).toEqual(["network", "slow", "data", "expensive"]);
  });
  it("counts keyword document frequency", () => {
    const k = keywordFrequency(["data data expensive", "expensive network", "network network"]);
    expect(k[0]).toEqual({ word: "network", count: 3, documents: 2 });
    expect(k[1]).toEqual({ word: "expensive", count: 2, documents: 2 });
    expect(k.find((x) => x.word === "data")).toEqual({ word: "data", count: 2, documents: 1 });
  });
  it("redacts emails, phone numbers and links", () => {
    expect(redactPII("Call 024 123 4567 or mail kofi@example.com, see https://x.y/z")).toBe("Call [phone] or mail [email], see [link]");
  });
});
