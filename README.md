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
| **Home** | This month's total and change vs last month, today / last 7 days / daily average, budget meter, where the money went, top suggestions, recent expenses |
| **Insights › Trends** | Daily spending (with average line), last 6 months, average by weekday |
| **Insights › Categories** | Your share per category with change vs last month and budget meters; tap one for its 6-month trend, top merchants and expenses |
| **Insights › Calendar** | Spending heatmap for the month; tap a day to see what you bought |
| **Insights › Merchants** | Where you spend most, how often, and your average spend there |
| **Insights › Friends** | Who owes you what, with a share-able reminder and *Mark settled* |
| **Insights › Tips** | Suggestions: monthly pace, budget alerts, big category changes, frequent merchants, likely subscriptions, weekend share, small purchases, no-spend days |
| **Activity** | Search and filter every expense (type, category, month, all time) and edit any of them |
| **Budgets** | Categories with monthly budgets, colours, emoji and order |
| **Settings** | iPhone setup, paste from clipboard, sample data, backup and restore, CSV export, theme (light, dark or auto) |

## How it gets your messages

iOS doesn't let any website read the Messages app. A **Shortcuts automation** (built into iOS, free) passes each bank SMS to the page instead. The text travels in the part of the link after `#`, which browsers never send to the web server, so messages go from Messages straight to the page on your phone.

The full step-by-step guide is in the app under **Settings → Connect your iPhone**, with your link ready to copy. There are two styles:

- **Collect, review later** (recommended): an automation (*Message contains "debited"*) appends each SMS to `expenses-inbox.txt` in iCloud Drive. A **Review Expenses** shortcut on your Home Screen opens the app with everything collected (`…#inbox=<messages>`) and clears the file.
- **Pop up right away**: the automation opens the app straight away with that one SMS (`…#add=<message>`).

No setup at all? Copy a bank SMS and tap **Paste from clipboard**.

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
web/src/lib/       pure logic: import/review/backup actions, stats, insights
web/src/store.tsx  React store over IndexedDB (db.ts), syncs open tabs
web/src/pages/     Home, Insights, Activity, Budgets, Settings
web/src/components charts/, review pop-ups, setup guide, onboarding
tests/             vitest suites
```

```bash
npm install
npm test           # 54 tests: parser, dates, import/review/backup, insights, formatting
npm run dev        # http://localhost:5173
npm run build      # static site in web/dist
```

## Deploy (free)

The build in `web/dist` is plain static files and uses relative paths, so it works on any static host, at a root domain or a sub-path.

- **Cloudflare Pages / Netlify / Vercel** (private repos are fine): import this GitHub repo. Build command `npm run build`, output directory `web/dist` (`netlify.toml` and `vercel.json` already set this).
- **GitHub Pages** (repo must be public on a free plan): run `npm run build`, then publish `web/dist` to a `gh-pages` branch. Then in *Settings → Pages* choose *Deploy from a branch → gh-pages*.
