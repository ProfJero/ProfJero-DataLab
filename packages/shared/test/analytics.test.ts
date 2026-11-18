import { describe, expect, it } from "vitest";
import { buildCrosstab, summariseQuestion, type Question } from "../src";

const Q: Question = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sectionId: "11111111-1111-4111-8111-111111111111", type: "single_choice", title: "Network", required: true, config: { options: [{ id: "mtn", label: "MTN" }, { id: "tel", label: "Telecel" }, { id: "at", label: "AT" }] }, visibility: null };

describe("question summaries", () => {
  it("computes counts and percentages from aggregates", () => {
    const s = summariseQuestion(Q, [
      { question_id: Q.id, metric: "answered", key: null, num: null, cnt: 80 },
      { question_id: Q.id, metric: "opt", key: "mtn", num: null, cnt: 48 },
      { question_id: Q.id, metric: "opt", key: "tel", num: null, cnt: 20 },
      { question_id: Q.id, metric: "opt", key: "at", num: null, cnt: 12 },
    ], 100)!;
    expect(s.kind).toBe("choice");
    if (s.kind !== "choice") return;
    expect(s.answered).toBe(80);
    expect(s.skipped).toBe(20);
    expect(s.options.find((o) => o.id === "mtn")).toMatchObject({ count: 48, percent: 60 });
    expect(s.options.reduce((a, o) => a + o.percent, 0)).toBe(100);
  });
  it("reports removed options instead of hiding them", () => {
    const s = summariseQuestion(Q, [{ question_id: Q.id, metric: "answered", key: null, num: null, cnt: 2 }, { question_id: Q.id, metric: "opt", key: "old", num: null, cnt: 2 }], 2)!;
    if (s.kind !== "choice") throw new Error();
    expect(s.options.some((o) => o.label.startsWith("Removed option"))).toBe(true);
  });
  it("computes rating statistics with full scale distribution", () => {
    const R: Question = { ...Q, type: "rating", config: { scaleMax: 5 } };
    const s = summariseQuestion(R, [
      { question_id: Q.id, metric: "answered", key: null, num: null, cnt: 4 },
      { question_id: Q.id, metric: "num", key: null, num: 5, cnt: 2 },
      { question_id: Q.id, metric: "num", key: null, num: 3, cnt: 1 },
      { question_id: Q.id, metric: "num", key: null, num: 1, cnt: 1 },
    ], 4)!;
    if (s.kind !== "numeric") throw new Error();
    expect(s.stats.mean).toBe(3.5);
    expect(s.stats.median).toBe(4);
    expect(s.distribution.map((b) => b.count)).toEqual([1, 0, 1, 0, 2]);
  });
  it("handles empty data", () => {
    const s = summariseQuestion(Q, [], 0)!;
    if (s.kind !== "choice") throw new Error();
    expect(s.answered).toBe(0);
    expect(s.options.every((o) => o.percent === 0)).toBe(true);
  });
});

describe("crosstab", () => {
  it("builds counts, totals and row percentages", () => {
    const G: Question = { ...Q, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Gender", config: { options: [{ id: "f", label: "Female" }, { id: "m", label: "Male" }] } };
    const ct = buildCrosstab(G, Q, [
      { row_key: "f", col_key: "mtn", cnt: 30 },
      { row_key: "f", col_key: "tel", cnt: 10 },
      { row_key: "m", col_key: "mtn", cnt: 18 },
      { row_key: "m", col_key: "at", cnt: 12 },
      { row_key: "x", col_key: "mtn", cnt: 99 },
    ]);
    expect(ct.counts).toEqual([[30, 10, 0], [18, 0, 12]]);
    expect(ct.rowTotals).toEqual([40, 30]);
    expect(ct.colTotals).toEqual([48, 10, 12]);
    expect(ct.total).toBe(70);
    expect(ct.rowPercents[0]).toEqual([75, 25, 0]);
  });
});
