import { describe, expect, it } from "vitest";
import { createProfile, emptyData, ingestMessages, reviewTxn } from "../web/src/lib/actions";
import { categoryBuckets, inRange, presetRange, rangeDays } from "../web/src/lib/range";

const NOW = new Date(2026, 10, 25, 20, 0);

describe("date ranges", () => {
  it.each([
    ["this-month", "2026-11-01", "2026-11-25"],
    ["last-month", "2026-10-01", "2026-10-31"],
    ["last-30", "2026-10-27", "2026-11-25"],
    ["this-year", "2026-01-01", "2026-11-25"],
  ] as const)("%s", (p, from, to) => {
    expect(presetRange(p, NOW)).toEqual({ preset: p, from, to });
  });
  it("all time starts at the earliest expense", () => {
    expect(presetRange("all", NOW, "2025-09-01T06:30:00.000Z").from).toBe("2025-09-01");
  });
  it("counts days up to today only", () => {
    expect(rangeDays({ preset: "this-month", from: "2026-11-01", to: "2026-11-30" }, NOW)).toBe(25);
  });
});

describe("categoryBuckets", () => {
  const setup = () => {
    let d = createProfile(emptyData(), { name: "R", currency: "INR" }, NOW);
    d = ingestMessages(
      d,
      [
        { text: "Rs 100 debited to SWIGGY", at: new Date(2026, 10, 2, 13).toISOString() },
        { text: "Rs 50 debited to UBER", at: new Date(2026, 10, 2, 18).toISOString() },
        { text: "Rs 300 debited to SWIGGY ref 2", at: new Date(2026, 9, 15, 13).toISOString() },
      ],
      "manual",
      NOW,
    ).data;
    const food = d.categories.find((c) => c.name === "Food")!.id;
    const tr = d.categories.find((c) => c.name === "Transport")!.id;
    d = reviewTxn(d, d.transactions[0].id, { kind: "personal", category_id: food });
    d = reviewTxn(d, d.transactions[1].id, { kind: "personal", category_id: tr });
    d = reviewTxn(d, d.transactions[2].id, { kind: "personal", category_id: food });
    return d;
  };
  it("buckets by day for a month, split by category colour", () => {
    const d = setup();
    const r = presetRange("this-month", NOW);
    expect(inRange(d.transactions, r)).toHaveLength(2);
    const b = categoryBuckets(d.transactions, d.categories, r);
    expect(b).toHaveLength(25);
    expect(b[1].total).toBe(150);
    expect(b[1].segments.map((s) => [s.label, s.value, s.color])).toEqual([
      ["🍔 Food", 100, "var(--c-orange)"],
      ["🚕 Transport", 50, "var(--c-yellow)"],
    ]);
  });
  it("buckets by month for long ranges and folds small categories into Other", () => {
    const d = setup();
    const b = categoryBuckets(d.transactions, d.categories, presetRange("this-year", NOW), 1);
    expect(b).toHaveLength(11);
    expect(b[9].total).toBe(300); // October
    expect(b[10].segments.map((s) => s.label)).toEqual(["🍔 Food", "Other"]);
  });
});
