# Expensive Expenses

**Your bank SMS, sorted into categories, budgets and charts, with friends' splits tracked.** Private by design: no account and no server. Each person's data stays on their own phone.

Every time you spend, your bank texts you. On iPhone, a Shortcuts automation hands those texts to this web app. Next time you open it, each new transaction pops up, one after another:

1. **Who was it for?** Just me / me and friends / not an expense
2. **Which category?** Food, Groceries, Travel, Transport, Shopping, Entertainment, Weekend, Health, Bills, Other (add, rename or recolour any time)
3. **For splits: your share.** Equal split, exact amount or percentage, plus who you split with

The app learns which category you use for each merchant and suggests it next time.

## What you get

| View | What it shows |
|---|---|
| **Home** | This month's total and change vs last month, today / last 7 days / daily average, budget meter, a pie chart of where the money went, top suggestions, recent expenses |
| **Insights › Breakdown** | Pick any date range (this month, last month, last 30 days, last 3 months, this year, all time, or custom dates). A pie chart splits the spend by category; hover or tap a slice to see its amount, share and number of expenses. Also a colour-coded bar per category, and day-by-day or month-by-month stacked bars |
| **Insights › Trends** | Daily spending and the last 6 months, stacked by category colour, plus average by weekday |
| **Insights › Categories** | Your share per category with change vs last month and budget meters; tap one for its 6-month trend, top merchants and expenses |
| **Insights › Calendar** | Spending heatmap for the month; tap a day to see what you bought |
| **Insights › Merchants** | Where you spend most, how often, and your average spend there |
| **Insights › Friends** | Who owes you what, with a share-able reminder and *Mark settled* |
| **Insights › Tips** | Suggestions: monthly pace, budget alerts, big category changes, frequent merchants, likely subscriptions, weekend share, small purchases, no-spend days |
| **Activity** | Search and filter every expense (type, category, month, all time) and edit any of them |
| **Budgets** | Categories with monthly budgets, colours, emoji and order |
| **Settings** | iPhone setup, paste from clipboard, sample data, **import from Notion or a spreadsheet (CSV)**, backup and restore, CSV export, theme (light, dark or auto) |
| **＋ Add** (top right) | Type in a payment yourself, e.g. one made with GPay or PhonePe that your bank didn't text you about |

## How it gets your messages

iOS doesn't let any website read the Messages app. A **Shortcuts automation** (built into iOS, free) passes each bank SMS to the page instead. The text travels in the part of the link after `#`, which browsers never send to the web server, so messages go from Messages straight to the page on your phone.

The full step-by-step guide is in the app under **Settings → Connect your iPhone**, with your link ready to copy. There are two styles:

- **Collect, review later** (recommended): an automation (*Message contains "debited"*) appends each SMS to `expenses-inbox.txt` in iCloud Drive. A **Review Expenses** shortcut on your Home Screen opens the app with everything collected (`…#inbox64=<Base64 of the file>`) and deletes the file.
- **Pop up right away**: the automation opens the app straight away with that one SMS (`…#add64=<Base64 of the message>`).

The messages are sent as **Base64** (with *Line Breaks: None*), not URL-encoded. iOS's *Open URLs* action scans its text for links, so a UPI ID or email address inside a URL-encoded message (`rahul@okaxis`, `care@jio.com`) is mistaken for a separate `mailto:` link, and the action fails with "missing a hostname". Base64 contains only letters, digits and `+ / =`. The older `#inbox=` / `#add=` links still work.

No setup at all? Copy a bank SMS and tap **Paste from clipboard**.

### Payments without an SMS (GPay, PhonePe, UPI Lite, some SBI payments)

iOS doesn't let a web page or Shortcut read GPay or PhonePe. Instead, an **App → Is Closed** automation for those apps opens `…#quick`, a short form for the amount and who you paid. If a bank SMS for the same payment arrives later (same amount, within 3 hours), the pop-up flags it and asks whether to skip it. Two SMS with the same amount are never flagged, because two ₹20 chais are both real.

## Importing from Notion or a spreadsheet

**Settings → Import** takes a CSV: Notion's *Export → Markdown & CSV*, or a Google Sheets or Excel CSV. It finds the Date, Amount, Category and Expense/Name columns, shows a preview, and merges the rows into your existing data:

- When a row has several tags, the first becomes the category and the others go into the note.
- Missing categories are created. The file's names win for synonyms (Transport → Transportation).
- Merchant → category habits are learned from the import, so later SMS from the same places are pre-filled.
- Importing the same file again adds nothing.

What's kept: spends (debited / spent / sent / paid / charged…). OTPs, reminders ("will be debited"), UPI collect requests, money received, and texts without an amount are skipped. The same SMS arriving twice is stored once. Dates come from the Shortcut's timestamp, or from the date printed in the SMS.

The parser handles HDFC, ICICI, SBI, Axis and Kotak formats, plus generic "Rs/INR/₹/$ … at/to/towards MERCHANT" alerts and US card alerts (Chase, Amex, BofA). See `tests/parser.test.ts`.

## Your data

- Stored in this browser's IndexedDB on your phone. Nothing is uploaded and there's nothing to log in to, so share the link with friends freely: everyone gets their own private copy.
- Use it in **Safari**. The Shortcut opens Safari, and a Home Screen icon added from Safari opens in Safari too, so they share the same data.
- Safari can clear site data for sites you haven't opened in a while. Use **Settings → Backup & restore** to save a backup to Files or iCloud Drive now and then. The same backup moves your data to a new phone.

## Tech

React 19 + TypeScript + Vite, with hand-built SVG charts (no chart library). It is a fully static site: a service worker caches the app shell for instant, offline loads.

```
shared/            SMS parser + category hints (unit-tested)
web/src/lib/       pure logic: actions, CSV importer, date ranges, stats, insights
web/src/store.tsx  React store over IndexedDB (db.ts), syncs open tabs
web/src/pages/     Home, Insights, Activity, Budgets, Settings
web/src/components charts/, review pop-ups, setup guide, onboarding
tests/             vitest suites
```

```bash
npm install
npm test           # 91 tests: parser, dates, import/review/backup, CSV import, quick add, ranges, insights
npm run dev        # http://localhost:5173
npm run build      # static site in web/dist
```

## Deploy (free)

The build in `web/dist` is plain static files and uses relative paths, so it works on any static host, at a root domain or a sub-path.

- **Cloudflare Pages / Netlify / Vercel** (private repos are fine): import this GitHub repo. Build command `npm run build`, output directory `web/dist` (`netlify.toml` and `vercel.json` already set this).
- **GitHub Pages** (repo must be public on a free plan): run `npm run build`, then publish `web/dist` to a `gh-pages` branch. Then in *Settings → Pages* choose *Deploy from a branch → gh-pages*.
