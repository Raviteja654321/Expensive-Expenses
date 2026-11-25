import { describe, expect, it } from "vitest";
import { createProfile, emptyData, ingestMessages, suggestCategory } from "../web/src/lib/actions";
import { importRows, parseAmount, parseCsv, parseLooseDate, previewCsv } from "../web/src/lib/importer";

const NOW = new Date(2026, 10, 25, 20, 0);
const fresh = () => createProfile(emptyData(), { name: "Ravi", currency: "INR" }, NOW);

// Shaped like Notion's "Export → Markdown & CSV" of a database.
const NOTION_CSV =
  "﻿Expense,Amount,Category,Date\n" +
  'Rent,"₹17,510",Housing,"September 1, 2025"\n' +
  "Auto,₹30,Transportation,\"September 1, 2025\"\n" +
  "Auto,₹30,Transportation,\"September 1, 2025\"\n" +
  'Movie,₹450,"Weekend, Entertainment","September 6, 2025"\n' +
  '"Lunch, office",₹83,Daily Food,"September 8, 2025 → September 9, 2025"\n' +
  "Blank,,,\n" +
  "Refund,-200,Shopping,\"September 9, 2025\"\n";

describe("CSV parsing", () => {
  it("handles BOM, quotes, commas and newlines inside quotes", () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi"""\r\n"multi\nline",2\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["multi\nline", "2"],
    ]);
  });
  it.each([
    ["2025-09-01", "2025-09-01"],
    ["2025-09-01T10:30:00.000+05:30", "2025-09-01T10:30"],
    ["September 1, 2025", "2025-09-01"],
    ["Sep 1, 2025 9:05 PM", "2025-09-01T21:05"],
    ["1 Sep 2025", "2025-09-01"],
    ["01/09/2025", "2025-09-01"],
    ["2025/9/1", "2025-09-01"],
    ["September 8, 2025 → September 9, 2025", "2025-09-08"],
    ["yesterday", null],
  ])("date %s", (input, out) => expect(parseLooseDate(input)).toBe(out));
  it.each([
    ["₹17,510", 17510],
    ["1,23,456.50", 123456.5],
    ["Rs. 99", 99],
    ["", null],
    ["-200", null],
    ["0", null],
  ])("amount %s", (input, out) => expect(parseAmount(input)).toBe(out));
});

describe("Notion import", () => {
  it("previews rows, skipping blanks and refunds", () => {
    const p = previewCsv(NOTION_CSV);
    expect(p.rows).toHaveLength(5);
    expect(p.skipped).toBe(2);
    expect([p.from, p.to, p.total]).toEqual(["2025-09-01", "2025-09-08", 18103]);
    expect(p.rows[3].categories).toEqual(["Weekend", "Entertainment"]);
    expect(p.rows[4].title).toBe("Lunch, office");
  });

  it("merges into existing data: matching, renaming synonyms, creating categories, keeping identical rows", () => {
    let d = fresh();
    d = ingestMessages(d, [{ text: "Rs 90 debited to CAFE" }], "manual", NOW).data;
    const transportId = d.categories.find((c) => c.name === "Transport")!.id;
    const r = importRows(d, previewCsv(NOTION_CSV).rows, NOW);
    expect(r.added).toBe(5);
    expect(r.renamed).toEqual([["Transport", "Transportation"]]);
    expect(r.created.sort()).toEqual(["Daily Food", "Housing"]);
    const names = r.data.categories.map((c) => c.name);
    expect(names).toContain("Transportation");
    expect(names).not.toContain("Transport");
    const autos = r.data.transactions.filter((t) => t.merchant === "Auto");
    expect(autos).toHaveLength(2); // two real ₹30 rides on the same day
    expect(autos[0].category_id).toBe(transportId); // renamed category keeps its id
    const movie = r.data.transactions.find((t) => t.merchant === "Movie")!;
    expect(r.data.categories.find((c) => c.id === movie.category_id)!.name).toBe("Weekend");
    expect(movie.note).toBe("Also tagged: Entertainment");
    expect([movie.status, movie.kind, movie.my_share]).toEqual(["done", "personal", 450]);
    expect(new Date(movie.received_at).getDate()).toBe(6);
    expect(r.data.transactions.filter((t) => t.status === "pending")).toHaveLength(1); // the SMS is untouched
    // learned: a future "AUTO" SMS is suggested as Transportation
    expect(suggestCategory(r.data, "Auto")).toBe(transportId);
  });

  it("importing the same file again adds nothing", () => {
    const once = importRows(fresh(), previewCsv(NOTION_CSV).rows, NOW);
    const twice = importRows(once.data, previewCsv(NOTION_CSV).rows, NOW);
    expect([twice.added, twice.duplicates]).toEqual([0, 5]);
    expect(twice.data.categories.length).toBe(once.data.categories.length);
  });

  it("explains which columns are missing", () => {
    expect(() => previewCsv("Name,Price\nA,1\n")).toThrow(/Date and Amount/);
  });
});
