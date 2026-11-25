import { describe, expect, it } from "vitest";
import { parseSms, splitMessages } from "../shared/parser";
import { suggestCategoryName, merchantKey } from "../shared/categorize";

const cases: { name: string; sms: string; amount: number; currency: string | null; merchant: string | null }[] = [
  {
    name: "HDFC UPI (multi-line)",
    sms: "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 24/11/26\nRef 432112345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808",
    amount: 250, currency: "INR", merchant: "Swiggy",
  },
  {
    name: "HDFC credit card",
    sms: "Spent Rs.1,299.00 On HDFC Bank Card 1234 At AMAZON PAY INDIA On 2026-11-24:18:30:12.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1234 to 7308080808",
    amount: 1299, currency: "INR", merchant: "Amazon Pay India",
  },
  {
    name: "ICICI credit card (balance after amount)",
    sms: "INR 450.00 spent using ICICI Bank Card XX1234 on 24-Nov-26 on ZOMATO LTD. Avl Limit: INR 1,23,456.00. If not you, call 1800 2662/SMS BLOCK 1234 to 9215676766",
    amount: 450, currency: "INR", merchant: "Zomato Ltd",
  },
  {
    name: "ICICI UPI",
    sms: "ICICI Bank Acct XX123 debited for Rs 120.00 on 24-Nov-26; UBER INDIA credited. UPI:432112345678. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766",
    amount: 120, currency: "INR", merchant: "Uber India",
  },
  {
    name: "SBI UPI (no currency symbol)",
    sms: "Dear UPI user A/C X1234 debited by 75.0 on date 24Nov26 trf to RAPIDO Refno 432112345678. If not u? call 1800111109. -SBI",
    amount: 75, currency: null, merchant: "Rapido",
  },
  {
    name: "Axis UPI",
    sms: "INR 2000.00 debited\nA/c no. XX1234\n24-11-26, 18:30:12\nUPI/P2M/432112345678/PVR INOX LTD\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank",
    amount: 2000, currency: "INR", merchant: "PVR Inox Ltd",
  },
  {
    name: "Kotak UPI to a person",
    sms: "Sent Rs.500.00 from Kotak Bank AC X1234 to rahul.k@okaxis on 24-11-26.UPI Ref 432112345678. Not you, https://kotak.com/fraud",
    amount: 500, currency: "INR", merchant: "Rahul K",
  },
  {
    name: "Generic 'towards'",
    sms: "Rs 340 debited from A/c XX1234 on 24-11-2026 towards BIGBASKET. Avl Bal Rs 10,000",
    amount: 340, currency: "INR", merchant: "Bigbasket",
  },
  {
    name: "Info: field",
    sms: "Your A/c XX1234 is debited with INR 150.00 on 24-11-26. Info: UPI-ZEPTO MARKETPLACE. Avl Bal INR 5000",
    amount: 150, currency: "INR", merchant: "Zepto Marketplace",
  },
  {
    name: "Balance mentioned first",
    sms: "Avl Bal Rs 9,850.00 after Rs 150.00 debited from A/c XX1234 to BLINKIT on 24-11-26",
    amount: 150, currency: "INR", merchant: "Blinkit",
  },
  {
    name: "Chase",
    sms: "Chase: You made a $45.67 transaction with STARBUCKS STORE 123 on Nov 24, 2026 at 6:30 PM ET.",
    amount: 45.67, currency: "USD", merchant: "Starbucks Store 123",
  },
  {
    name: "Bank of America",
    sms: "Bank of America: A $12.50 purchase at TRADER JOE'S was made on your card ending in 1234.",
    amount: 12.5, currency: "USD", merchant: "Trader Joe's",
  },
  {
    name: "Amex",
    sms: "American Express: A charge of $89.00 at UBER EATS was made on your Card ending in 1234.",
    amount: 89, currency: "USD", merchant: "Uber Eats",
  },
  {
    name: "₹ symbol",
    sms: "₹1,250 paid to Netflix via UPI from your account ending 4321.",
    amount: 1250, currency: "INR", merchant: "Netflix",
  },
];

describe("parseSms — spends", () => {
  for (const c of cases) {
    it(c.name, () => {
      const p = parseSms(c.sms);
      expect(p.isTransaction).toBe(true);
      expect(p.direction).toBe("debit");
      expect(p.amount).toBe(c.amount);
      expect(p.currency).toBe(c.currency);
      expect(p.merchant).toBe(c.merchant);
    });
  }
});

describe("parseSms — things that are not spends", () => {
  it("ignores OTPs", () => {
    const p = parseSms("123456 is your OTP for txn of Rs 500.00 at AMAZON. Valid for 10 mins. Do not share.");
    expect(p.isTransaction).toBe(false);
    expect(p.reason).toMatch(/OTP/);
  });
  it("keeps a debit alert that merely warns about OTPs", () => {
    const p = parseSms("Rs 99 debited from A/c XX1234 to SPOTIFY on 24-11-26. Never share your OTP with anyone.");
    expect(p.isTransaction).toBe(true);
    expect(p.merchant).toBe("Spotify");
  });
  it("ignores credits", () => {
    const p = parseSms("Rs 5000.00 credited to your A/c XX1234 by NEFT from ACME CORP. Avl Bal Rs 15000");
    expect(p.isTransaction).toBe(false);
    expect(p.direction).toBe("credit");
  });
  it("ignores reminders", () => {
    const p = parseSms("Rs 199 will be debited on 01-Dec-26 for your Netflix subscription.");
    expect(p.isTransaction).toBe(false);
  });
  it("ignores UPI collect requests", () => {
    const p = parseSms("rahul@okaxis has requested money from you. Amount Rs 300.00. Pay via your UPI app.");
    expect(p.isTransaction).toBe(false);
  });
  it("ignores chit-chat without an amount", () => {
    expect(parseSms("See you at 7 for dinner?").isTransaction).toBe(false);
  });
  it("does not treat 'Mrs' or 'hrs' as rupees", () => {
    expect(parseSms("Meeting in 2 hrs 30 mins, Mrs 5 will join").isTransaction).toBe(false);
  });
});

describe("splitMessages", () => {
  it("splits on blank lines and keeps multi-line messages together", () => {
    const out = splitMessages("Sent Rs.1\nTo A\n\n\nSpent Rs.2 at B\n  \nINR 3 debited");
    expect(out).toEqual(["Sent Rs.1\nTo A", "Spent Rs.2 at B", "INR 3 debited"]);
  });
});

describe("suggestCategoryName", () => {
  it.each([
    ["Swiggy", "Food"],
    ["Uber Eats", "Food"],
    ["Uber India", "Transport"],
    ["Amazon Pay India", "Shopping"],
    ["Netflix", "Entertainment"],
    ["PVR Inox Ltd", "Entertainment"],
    ["Bigbasket", "Groceries"],
    ["Makemytrip", "Travel"],
    ["Coca Cola Store", null],
    ["Rahul K", null],
  ])("%s → %s", (merchant, expected) => {
    expect(suggestCategoryName(merchant)).toBe(expected);
  });
  it("merchantKey ignores store numbers and punctuation", () => {
    expect(merchantKey("STARBUCKS STORE 123")).toBe(merchantKey("Starbucks Store #456"));
  });
});
