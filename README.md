# Expensive Expenses

Turn the bank SMS on your iPhone into categorized expenses and Splitwise splits.

Each time you spend money, your bank texts you. This app collects those messages. When you open it later, each new transaction pops up, one after another, and asks:

1. **Who was it for?** Just me / me and friends / not an expense
2. **Which category?** Food, Travel, Shopping, Entertainment, Weekend, Transport… (editable; add new ones any time)
3. **For splits: what's your share?** Equally between N people, an exact amount, or a percentage. You can also add it to Splitwise directly.

It remembers which category you chose for each merchant and suggests it next time.

## How it reads your messages

iOS doesn't let any website (or app) read the Messages app. The supported way is an **iPhone Shortcuts automation**:

```
Bank SMS arrives ──► Shortcuts automation ("Message contains: debited")
                         │  POST message text
                         ▼
              https://<your-app>/api/ingest?token=…   (Cloudflare Worker)
                         │  parse amount + merchant, drop OTPs/credits, dedupe
                         ▼
                 pending queue (SQLite in a Durable Object)
                         │
   You open the website ─┴─► one pop-up per new transaction
```

The step-by-step iPhone setup is inside the app (**Settings → iPhone setup**), with your personal link ready to copy. In short:

1. Shortcuts → **Automation** → **+** → **Message**, *Message Contains* `debited`, **Run Immediately**.
2. Add the action **Get Contents of URL** with your personal link, Method **POST**, Request Body **JSON**, field `text` = *Shortcut Input → Content*.
3. Repeat for `spent` and `Sent Rs` (or whatever words your bank uses). A message that matches two automations is only counted once.

You can also paste messages by hand in **Settings → Add messages manually**, for example to import older ones.

### Which messages are kept

Only messages that contain your trigger words leave the phone. On the server:

- **Spends** (debited / spent / sent / paid / charged…) are queued for review.
- **OTPs, reminders ("will be debited"), UPI collect requests, money received, and messages without an amount** are dropped immediately and never stored.
- The same SMS arriving twice is detected and stored once.

The parser handles the common formats from HDFC, ICICI, SBI, Axis and Kotak, plus generic "Rs/INR/₹/$ … at/to/towards MERCHANT" alerts and US card alerts (Chase, Amex, BofA). See `tests/parser.test.ts`. If a merchant or amount is read wrong, fix it in the pop-up.

## Features

- Pop-up review queue that opens by itself when new transactions are waiting, with a progress bar ("2 of 5"), skip, and edit of amount or merchant
- Personal vs. split, with your share by equal split, exact amount or percent, and friend names remembered for next time
- Optional **Splitwise** push: creates the expense with you as payer, your share as what you owe, and the rest split equally among the friends you pick (optionally in a group)
- Editable categories: add, rename, change emoji, reorder, delete
- Monthly dashboard: what you spent (your share only), share by category, how much friends owe you, and the full expense list (tap to edit)
- Passcode lock; a separate secret link for the iPhone, which you can regenerate
- CSV export; installable on the Home Screen (PWA); light and dark mode

## Tech

| Part | What |
|---|---|
| Frontend | React 19 + Vite + TypeScript (`web/`) |
| Backend | Cloudflare Worker (`worker/`) with one SQLite-backed Durable Object for storage. Works on the free plan; no database to provision |
| Shared | SMS parser + category hints (`shared/`), unit-tested with Vitest |

## Run locally

```bash
npm install
npm test          # parser tests
npm run dev       # builds the app and serves it + the API on http://localhost:8787
```

## Deploy your own copy (Cloudflare, free)

1. Create a free Cloudflare account.
2. Run:

```bash
npx wrangler login
```

or set `CLOUDFLARE_API_TOKEN` to a token made from the **Edit Cloudflare Workers** template.

3. Run:

```bash
npm run deploy
```

Wrangler prints your URL (`https://expensive-expenses.<you>.workers.dev`). Open it, create your passcode, and follow **Settings → iPhone setup**.

## Splitwise

Optional. Go to <https://secure.splitwise.com/apps> → *Register your application*, copy the **API key**, and paste it in **Settings → Splitwise**. The key is checked against Splitwise before it is saved, and it is stored only on your server.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/ingest?token=…` | iPhone token | Body: JSON `{ "text": "...", "sender": "..." }`, form, or plain text |
| `GET /api/ingest?token=…` | iPhone token | Checks the link works |
| `GET /api/pending` | session | Transactions waiting for review (with a suggested category) |
| `POST /api/transactions/:id/review` | session | `{ kind: "personal" \| "split", category_id, my_share, split_with, splitwise? }` |
| `POST /api/transactions/:id/ignore` / `reopen` | session | Mark as not an expense / send back to review |
| `GET/POST/PATCH/DELETE /api/categories` | session | Manage categories |
| `POST /api/messages` | session | Paste one or more SMS (separated by blank lines) |
| `GET /api/export` | session | CSV of all reviewed expenses |
