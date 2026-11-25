export const DEFAULT_CATEGORIES: { name: string; emoji: string; color: string }[] = [
  { name: "Food", emoji: "🍔", color: "#f97316" },
  { name: "Groceries", emoji: "🛒", color: "#16a34a" },
  { name: "Travel", emoji: "✈️", color: "#0ea5e9" },
  { name: "Transport", emoji: "🚕", color: "#ca8a04" },
  { name: "Shopping", emoji: "🛍️", color: "#db2777" },
  { name: "Entertainment", emoji: "🎬", color: "#7c3aed" },
  { name: "Weekend", emoji: "🎉", color: "#0d9488" },
  { name: "Bills", emoji: "🧾", color: "#475569" },
  { name: "Health", emoji: "💊", color: "#dc2626" },
  { name: "Other", emoji: "📦", color: "#78716c" },
];

/** Keyword hints used before the app has learned your own merchant → category choices. */
const KEYWORDS: Record<string, string[]> = {
  Food: [
    "swiggy", "zomato", "restaurant", "cafe", "café", "coffee", "starbucks", "domino", "pizza", "mcdonald",
    "kfc", "burger", "uber eats", "doordash", "grubhub", "bakery", "dine", "chai", "biryani", "barbeque",
    "eatclub", "eatsure", "subway", "haldiram", "chaayos", "blue tokai", "third wave", "food",
  ],
  Groceries: [
    "bigbasket", "big basket", "blinkit", "zepto", "instamart", "dmart", "d mart", "grocer", "supermarket",
    "more retail", "trader joe", "whole foods", "kroger", "safeway", "jiomart", "nature's basket",
    "ratnadeep", "spencer", "costco", "aldi", "fresh",
  ],
  Transport: [
    "uber", "ola", "rapido", "namma yatri", "metro", "fuel", "petrol", "diesel", "hpcl", "bpcl",
    "indian oil", "iocl", "shell", "parking", "fastag", "lyft", "toll", "bmtc", "best bus", "yulu",
  ],
  Travel: [
    "makemytrip", "make my trip", "goibibo", "irctc", "indigo", "air india", "vistara", "akasa", "spicejet",
    "airbnb", "oyo", "hotel", "booking.com", "cleartrip", "ixigo", "redbus", "airline", "airways",
    "expedia", "agoda", "zostel", "delta", "united air",
  ],
  Shopping: [
    "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "decathlon", "ikea", "croma",
    "reliance digital", "reliance trends", "tata cliq", "lifestyle", "westside", "zara", "h&m", "uniqlo",
    "target", "walmart", "best buy", "apple store", "mall",
  ],
  Entertainment: [
    "netflix", "spotify", "prime video", "hotstar", "jiocinema", "jio cinema", "sonyliv", "zee5",
    "bookmyshow", "book my show", "district", "pvr", "inox", "cinepolis", "cinema", "movie", "steam",
    "playstation", "xbox", "youtube", "apple music", "disney", "hbo", "concert",
  ],
  Bills: [
    "airtel", "jio", "vodafone", "bsnl", "electricity", "bescom", "tata power", "adani", "broadband",
    "act fibernet", "recharge", "insurance", "lic", "gas", "water bill", "rent", "comcast", "verizon",
    "t-mobile", "at&t",
  ],
  Health: [
    "pharmacy", "apollo", "medplus", "1mg", "pharmeasy", "hospital", "clinic", "netmeds", "practo",
    "diagnostic", "lab", "cvs", "walgreens", "cult.fit", "cultfit", "gym",
  ],
};

export function merchantKey(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

function matches(haystack: string, kw: string): boolean {
  if (kw.length <= 4) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`).test(haystack);
  }
  return haystack.includes(kw);
}

/** Returns the default category *name* whose keyword best matches the merchant (longest keyword wins). */
export function suggestCategoryName(merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  const hay = merchant.toLowerCase();
  let best: { name: string; len: number } | null = null;
  for (const [name, kws] of Object.entries(KEYWORDS)) {
    for (const kw of kws) {
      if (matches(hay, kw) && (!best || kw.length > best.len)) best = { name, len: kw.length };
    }
  }
  return best?.name ?? null;
}
