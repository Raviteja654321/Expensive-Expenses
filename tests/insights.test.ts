import { describe, expect, it } from "vitest";
import { createProfile, emptyData, ingestMessages, reviewTxn } from "../web/src/lib/actions";
import { buildInsights } from "../web/src/lib/insights";

const NOW = new Date(2026, 10, 25, 20, 0); // 25 Nov 2026, 8pm local
const fresh = () => createProfile(emptyData(), { name: "Ravi", currency: "INR" }, NOW);

describe("insights", () => {
  it("flags budgets, frequent merchants and money owed", () => {
    let d = fresh();
    const food = d.categories.find((c) => c.name === "Food")!;
    d = { ...d, categories: d.categories.map((c) => (c.id === food.id ? { ...c, budget: 1000 } : c)) };
    const msgs = Array.from({ length: 4 }, (_, i) => ({ text: `Rs 300 debited to SWIGGY ref ${i}`, at: new Date(2026, 10, 10 + i, 13).toISOString() }));
    d = ingestMessages(d, msgs, "manual", NOW).data;
    for (const t of d.transactions) d = reviewTxn(d, t.id, { kind: "split", category_id: food.id, my_share: 300 - (t === d.transactions[0] ? 100 : 0), split_with: "Rahul" }, NOW);
    const ids = buildInsights(d.transactions, d.categories, "INR", NOW).map((i) => i.id);
    expect(ids).toContain(`budget-${food.id}`); // 1100 of 1000
    expect(ids).toContain("merchant");
    expect(ids).toContain("owed");
  });
});
