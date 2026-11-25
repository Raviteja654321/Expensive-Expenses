import { describe, expect, it } from "vitest";
import {
  addCategory, createProfile, deleteCategory, emptyData, ingestMessages, mergeBackup, readInboxFromUrl, reviewTxn,
  settleFriend, splitInbox, suggestCategory, validateBackup,
} from "../web/src/lib/actions";
import { friendBalances } from "../web/src/lib/stats";

const NOW = new Date(2026, 10, 25, 20, 0); // 25 Nov 2026, 8pm local
const fresh = () => createProfile(emptyData(), { name: "Ravi", currency: "INR" }, NOW);

describe("inbox hand-off from the iPhone Shortcut", () => {
  it("reads #inbox= and #add= links", () => {
    expect(readInboxFromUrl("#inbox=" + encodeURIComponent("### hi\n### there"))).toBe("### hi\n### there");
    expect(readInboxFromUrl("#add=Rs%20100%20debited")).toBe("Rs 100 debited");
    expect(readInboxFromUrl("", "?add=Rs%2050")).toBe("Rs 50");
    expect(readInboxFromUrl("#/settings")).toBeNull();
  });

  it("splits ### entries, with and without timestamps, keeping multi-line SMS together", () => {
    const text = "### 2026-11-24T18:30:00+05:30\nSent Rs.250.00\nTo SWIGGY\n###\nINR 99 debited to SPOTIFY\n\n### Rs 10 spent at CAFE";
    expect(splitInbox(text)).toEqual([
      { text: "Sent Rs.250.00\nTo SWIGGY", at: "2026-11-24T18:30:00+05:30" },
      { text: "INR 99 debited to SPOTIFY" },
      { text: "Rs 10 spent at CAFE" },
    ]);
  });

  it("falls back to blank-line separation for pasted text", () => {
    expect(splitInbox("Rs 1 debited to A\n\nRs 2 debited to B").length).toBe(2);
  });
});

describe("ingestMessages", () => {
  it("queues spends, skips OTPs and duplicates", () => {
    const d0 = fresh();
    const { data, results } = ingestMessages(
      d0,
      [
        { text: "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 24/11/26\nRef 1" },
        { text: "123456 is your OTP for txn of Rs 500 at AMAZON" },
        { text: "Sent   Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 24/11/26\nRef 1" },
      ],
      "shortcut",
      NOW,
    );
    expect(results.map((r) => r.status)).toEqual(["queued", "ignored", "duplicate"]);
    expect(data.transactions).toHaveLength(1);
    const t = data.transactions[0];
    expect(t.merchant).toBe("Swiggy");
    expect(t.currency).toBe("INR");
    // dated from the SMS (24 Nov, noon local) rather than import time
    expect(new Date(t.received_at).getDate()).toBe(24);
    expect(new Date(t.received_at).getHours()).toBe(12);
  });

  it("prefers the Shortcut's exact timestamp", () => {
    const { data } = ingestMessages(fresh(), [{ text: "Rs 90 debited to CAFE", at: "2026-11-25T09:15:00+00:00" }], "shortcut", NOW);
    expect(data.transactions[0].received_at).toBe("2026-11-25T09:15:00.000Z");
  });

  it("uses arrival time when the SMS only says today", () => {
    const { data } = ingestMessages(fresh(), [{ text: "Rs 90 debited on 25-11-26 to CAFE" }], "shortcut", NOW);
    expect(data.transactions[0].received_at).toBe(NOW.toISOString());
  });
});

describe("review + learning", () => {
  it("records a split and learns the merchant's category", () => {
    let d = fresh();
    d = ingestMessages(d, [{ text: "Rs 300 debited to SWIGGY" }, { text: "Rs 120 debited to SWIGGY ref 2" }], "manual", NOW).data;
    const food = d.categories.find((c) => c.name === "Food")!;
    const weekend = d.categories.find((c) => c.name === "Weekend")!;
    expect(suggestCategory(d, "Swiggy")).toBe(food.id); // keyword hint
    d = reviewTxn(d, d.transactions[0].id, { kind: "split", category_id: weekend.id, my_share: 100, split_with: "Rahul, Priya" }, NOW);
    expect(suggestCategory(d, "Swiggy")).toBe(weekend.id); // learned
    const t = d.transactions[0];
    expect([t.status, t.kind, t.my_share]).toEqual(["done", "split", 100]);
    expect(friendBalances(d.transactions).map((f) => [f.name, f.owed])).toEqual([["Rahul", 100], ["Priya", 100]]);
    d = settleFriend(d, "rahul");
    expect(friendBalances(d.transactions)).toEqual([]); // the split is settled for everyone on it
  });

  it("rejects a share larger than the amount", () => {
    let d = fresh();
    d = ingestMessages(d, [{ text: "Rs 300 debited to SWIGGY" }], "manual", NOW).data;
    expect(() => reviewTxn(d, d.transactions[0].id, { kind: "split", category_id: null, my_share: 400 })).toThrow(/share/);
  });

  it("deleting a category un-categorizes its expenses and forgets its rules", () => {
    let d = fresh();
    d = ingestMessages(d, [{ text: "Rs 300 debited to SWIGGY" }], "manual", NOW).data;
    const food = d.categories.find((c) => c.name === "Food")!;
    d = reviewTxn(d, d.transactions[0].id, { kind: "personal", category_id: food.id });
    d = deleteCategory(d, food.id);
    expect(d.transactions[0].category_id).toBeNull();
    expect(Object.values(d.rules)).not.toContain(food.id);
  });

  it("new categories get an unused palette color and duplicate names are refused", () => {
    const d = fresh();
    const { category } = addCategory(d, { name: "Gifts", emoji: "🎁" });
    expect(category.color).toBe("cyan"); // first colour the defaults don't use
    expect(() => addCategory(d, { name: "food" })).toThrow(/exists/);
  });
});

describe("backup", () => {
  it("round-trips and merges without duplicating", () => {
    let d = fresh();
    d = ingestMessages(d, [{ text: "Rs 300 debited to SWIGGY" }], "manual", NOW).data;
    const backup = validateBackup(JSON.parse(JSON.stringify(d)));
    let other = ingestMessages(fresh(), [{ text: "Rs 50 debited to CAFE" }], "manual", NOW).data;
    const merged = mergeBackup(other, backup);
    expect(merged.added).toBe(1);
    other = merged.data;
    expect(mergeBackup(other, backup).added).toBe(0);
    expect(() => validateBackup({ hello: 1 })).toThrow();
  });
});

import { money } from "../web/src/lib/format";

describe("money", () => {
  it("shows whole amounts without decimals and others with exactly two", () => {
    expect(money(1250, "INR")).toBe("₹1,250");
    expect(money(4407.5, "INR")).toBe("₹4,407.50");
    expect(money(123456.789, "INR")).toBe("₹1,23,456.79");
    expect(money(6.45, "USD")).toBe("$6.45");
  });
});
