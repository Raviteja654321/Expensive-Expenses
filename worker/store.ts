import { DurableObject } from "cloudflare:workers";
import { parseSms, splitMessages } from "../shared/parser";
import { DEFAULT_CATEGORIES, merchantKey, suggestCategoryName } from "../shared/categorize";
import type { Category, ReviewInput, SplitwiseMeta, Transaction } from "../shared/types";
import { createSplitwiseExpense, fetchSplitwiseMeta, SplitwiseError } from "./splitwise";

export interface Env {
  STORE: DurableObjectNamespace<Store>;
  ASSETS: Fetcher;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (bytes = 24) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PBKDF2_ITERATIONS = 100_000; // the Workers runtime maximum

async function pbkdf2(passcode: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return b64url(bits);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const SESSION_DAYS = 365;
const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * The automation fires the moment an SMS arrives, so arrival time is the right default.
 * A supplied date is only trusted if it carries a time zone (e.g. ISO 8601 with Z or +05:30);
 * "Nov 24, 2026 at 6:30 PM" has none and would be read as UTC on the server.
 */
function parseDate(input: unknown): string {
  if (typeof input === "string" && /(\d[zZ]|[+-]\d{2}:?\d{2}|\b(GMT|UTC))\s*$/.test(input.trim())) {
    const t = Date.parse(input.trim());
    if (!Number.isNaN(t) && t <= Date.now() + 5 * 60_000) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Row = Record<string, SqlStorageValue>;

export class Store extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        emoji TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#78716c',
        sort INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        raw TEXT NOT NULL,
        sender TEXT,
        received_at TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        merchant TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        kind TEXT,
        category_id TEXT,
        my_share REAL,
        split_with TEXT,
        splitwise_expense_id TEXT,
        note TEXT,
        source TEXT NOT NULL DEFAULT 'shortcut',
        created_at TEXT NOT NULL,
        reviewed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status, received_at);
      CREATE TABLE IF NOT EXISTS merchant_rules (merchant_key TEXT PRIMARY KEY, category_id TEXT NOT NULL);
    `);
    const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM categories").one().n;
    if (count === 0) {
      DEFAULT_CATEGORIES.forEach((c, i) =>
        this.sql.exec(
          "INSERT INTO categories (id, name, emoji, color, sort) VALUES (?, ?, ?, ?, ?)",
          crypto.randomUUID(), c.name, c.emoji, c.color, i,
        ),
      );
    }
    if (!this.getSetting("ingest_token")) this.setSetting("ingest_token", randomToken());
    if (!this.getSetting("currency")) this.setSetting("currency", "INR");
  }

  // ---------- settings helpers ----------
  private getSetting(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = ?", key).toArray();
    return rows[0]?.value ?? null;
  }
  private setSetting(key: string, value: string | null) {
    if (value === null) this.sql.exec("DELETE FROM settings WHERE key = ?", key);
    else this.sql.exec("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }

  // ---------- auth ----------
  private async createSession(): Promise<string> {
    const token = randomToken(32);
    this.sql.exec("INSERT INTO sessions (token_hash, created_at) VALUES (?, ?)", await sha256(token), new Date().toISOString());
    return token;
  }

  private bearer(req: Request): string | null {
    const h = req.headers.get("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m ? m[1].trim() : null;
  }

  private async isAuthed(req: Request): Promise<boolean> {
    const token = this.bearer(req);
    if (!token) return false;
    const rows = this.sql
      .exec<{ created_at: string }>("SELECT created_at FROM sessions WHERE token_hash = ?", await sha256(token))
      .toArray();
    if (!rows.length) return false;
    const age = Date.now() - Date.parse(rows[0].created_at);
    return age < SESSION_DAYS * 86_400_000;
  }

  private async requireAuth(req: Request) {
    if (!(await this.isAuthed(req))) throw new HttpError(401, "Please unlock the app first.");
  }

  private async checkPasscode(passcode: string): Promise<boolean> {
    const stored = this.getSetting("passcode");
    if (!stored) return false;
    const [, , salt, hash] = stored.split("$");
    return safeEqual(await pbkdf2(passcode, salt), hash);
  }

  private async storePasscode(passcode: string) {
    const salt = randomToken(16);
    this.setSetting("passcode", `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${await pbkdf2(passcode, salt)}`);
  }

  private validatePasscode(p: unknown): string {
    if (typeof p !== "string" || p.length < 4) throw new HttpError(400, "Use at least 4 characters for your passcode.");
    if (p.length > 200) throw new HttpError(400, "That passcode is too long.");
    return p;
  }

  // ---------- data helpers ----------
  private categories(): Category[] {
    return this.sql.exec<Category & Row>("SELECT id, name, emoji, color, sort FROM categories ORDER BY sort, name").toArray();
  }

  private getTxn(id: string): Transaction {
    const rows = this.sql.exec<Row>("SELECT * FROM transactions WHERE id = ?", id).toArray();
    if (!rows.length) throw new HttpError(404, "That transaction no longer exists.");
    return rows[0] as unknown as Transaction;
  }

  private suggestCategory(merchant: string): string | null {
    const key = merchantKey(merchant);
    if (key) {
      const rule = this.sql.exec<{ category_id: string }>("SELECT category_id FROM merchant_rules WHERE merchant_key = ?", key).toArray();
      if (rule.length && this.categories().some((c) => c.id === rule[0].category_id)) return rule[0].category_id;
    }
    const name = suggestCategoryName(merchant);
    if (!name) return null;
    return this.categories().find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  }

  private async ingest(text: string, opts: { sender?: string | null; date?: unknown; source: string }) {
    const parsed = parseSms(text);
    if (!parsed.isTransaction || parsed.amount == null) {
      return { status: "ignored" as const, reason: parsed.reason ?? "not a spend" };
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    const hash = await sha256(normalized);
    if (this.sql.exec("SELECT 1 FROM transactions WHERE hash = ?", hash).toArray().length) {
      return { status: "duplicate" as const, reason: "already received this message" };
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const merchant = parsed.merchant ?? "Unknown merchant";
    this.sql.exec(
      `INSERT INTO transactions (id, hash, raw, sender, received_at, amount, currency, merchant, direction, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      id, hash, text.trim(), opts.sender ?? null, parseDate(opts.date), round2(parsed.amount),
      parsed.currency ?? this.getSetting("currency") ?? "INR", merchant, parsed.direction, opts.source, now,
    );
    return { status: "queued" as const, id, amount: round2(parsed.amount), merchant };
  }

  // ---------- request handling ----------
  async fetch(req: Request): Promise<Response> {
    try {
      return await this.route(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof SplitwiseError) return json({ error: `Splitwise: ${err.message}` }, 502);
      console.error(err);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  }

  private async body<T = Record<string, unknown>>(req: Request): Promise<T> {
    try {
      return (await req.json()) as T;
    } catch {
      throw new HttpError(400, "Expected a JSON body.");
    }
  }

  private async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();
    const seg = path.split("/").filter(Boolean);

    // ----- public -----
    if (path === "/status" && method === "GET") {
      return json({ setup_done: !!this.getSetting("passcode"), authed: await this.isAuthed(req) });
    }

    if (path === "/setup" && method === "POST") {
      if (this.getSetting("passcode")) throw new HttpError(409, "This app is already set up. Unlock it with your passcode.");
      const { passcode } = await this.body<{ passcode: unknown }>(req);
      await this.storePasscode(this.validatePasscode(passcode));
      return json({ token: await this.createSession() });
    }

    if (path === "/login" && method === "POST") {
      const failures = Number(this.getSetting("login_failures") ?? 0);
      const lastFail = Number(this.getSetting("login_last_failure") ?? 0);
      if (failures >= 5 && Date.now() - lastFail < 5 * 60_000) {
        throw new HttpError(429, "Too many wrong attempts. Try again in a few minutes.");
      }
      const { passcode } = await this.body<{ passcode: unknown }>(req);
      if (typeof passcode !== "string" || !(await this.checkPasscode(passcode))) {
        this.setSetting("login_failures", String(failures >= 5 ? 1 : failures + 1));
        this.setSetting("login_last_failure", String(Date.now()));
        throw new HttpError(401, "Wrong passcode.");
      }
      this.setSetting("login_failures", "0");
      return json({ token: await this.createSession() });
    }

    if (path === "/ingest") {
      const ct = req.headers.get("content-type") ?? "";
      let text: unknown = "";
      let sender: unknown = null;
      let date: unknown = null;
      let token: unknown = url.searchParams.get("token") ?? this.bearer(req);
      if (method === "POST") {
        if (ct.includes("json")) {
          const j = (await req.json().catch(() => null)) as unknown;
          if (typeof j === "string") text = j;
          else if (j && typeof j === "object") {
            const o = j as Record<string, unknown>;
            text = o.text ?? o.message ?? o.content ?? o.body ?? o.sms ?? "";
            sender = o.sender ?? o.from ?? null;
            date = o.date ?? o.received_at ?? null;
            token = token ?? o.token;
          }
        } else if (ct.includes("form")) {
          const f = await req.formData();
          text = f.get("text") ?? f.get("message") ?? "";
          sender = f.get("sender");
          date = f.get("date");
          token = token ?? f.get("token");
        } else {
          text = await req.text();
        }
      } else if (method !== "GET") {
        throw new HttpError(405, "Use POST.");
      }
      const expected = this.getSetting("ingest_token") ?? "";
      if (typeof token !== "string" || !safeEqual(token, expected)) {
        throw new HttpError(401, "Invalid or missing token. Copy the URL again from Settings → iPhone setup.");
      }
      if (method === "GET") return json({ ok: true, message: "Token is valid. Your iPhone can send messages here." });
      const str = typeof text === "string" ? text : JSON.stringify(text);
      // Answer 200 so a test run of the Shortcut (which has no message) doesn't show an error.
      if (!str.trim()) return json({ status: "ignored", reason: "empty message: set the Shortcut's 'text' field to the message content" });
      const result = await this.ingest(str, { sender: typeof sender === "string" ? sender : null, date, source: "shortcut" });
      return json(result);
    }

    // ----- everything below needs an unlocked session -----
    await this.requireAuth(req);

    if (path === "/logout" && method === "POST") {
      const token = this.bearer(req);
      if (token) this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", await sha256(token));
      return json({ ok: true });
    }

    if (path === "/passcode" && method === "POST") {
      const { current, next } = await this.body<{ current: unknown; next: unknown }>(req);
      if (typeof current !== "string" || !(await this.checkPasscode(current))) throw new HttpError(400, "Your current passcode is wrong.");
      await this.storePasscode(this.validatePasscode(next));
      return json({ ok: true });
    }

    if (path === "/messages" && method === "POST") {
      const { text } = await this.body<{ text: unknown }>(req);
      if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "Paste at least one message.");
      const results = [];
      for (const msg of splitMessages(text).slice(0, 200)) {
        results.push({ text: msg.slice(0, 80), ...(await this.ingest(msg, { source: "manual" })) });
      }
      return json({ results });
    }

    if (path === "/pending" && method === "GET") {
      const rows = this.sql
        .exec<Row>("SELECT * FROM transactions WHERE status = 'pending' ORDER BY received_at ASC, created_at ASC")
        .toArray() as unknown as Transaction[];
      return json(rows.map((t) => ({ ...t, suggested_category_id: this.suggestCategory(t.merchant) })));
    }

    if (path === "/transactions" && method === "GET") {
      const status = url.searchParams.get("status") ?? "done";
      if (!["pending", "done", "ignored"].includes(status)) throw new HttpError(400, "Unknown status.");
      // from/to are ISO timestamps for the start of the month in the viewer's own time zone.
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let rows: Row[];
      if (from && to && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to))) {
        rows = this.sql
          .exec<Row>(
            "SELECT * FROM transactions WHERE status = ? AND received_at >= ? AND received_at < ? ORDER BY received_at DESC",
            status, new Date(from).toISOString(), new Date(to).toISOString(),
          )
          .toArray();
      } else {
        rows = this.sql.exec<Row>("SELECT * FROM transactions WHERE status = ? ORDER BY received_at DESC LIMIT 500", status).toArray();
      }
      return json(rows);
    }

    if (path === "/people" && method === "GET") {
      const rows = this.sql
        .exec<{ split_with: string }>("SELECT split_with FROM transactions WHERE split_with IS NOT NULL AND split_with != '' ORDER BY reviewed_at DESC LIMIT 300")
        .toArray();
      const seen = new Map<string, string>();
      for (const r of rows) {
        for (const name of r.split_with.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
        }
      }
      return json([...seen.values()].slice(0, 30));
    }

    if (seg[0] === "transactions" && seg[1]) {
      const id = seg[1];
      const action = seg[2];
      if (action === "review" && method === "POST") return json(await this.review(id, await this.body<ReviewInput>(req)));
      if (action === "ignore" && method === "POST") {
        this.getTxn(id);
        this.sql.exec("UPDATE transactions SET status = 'ignored', reviewed_at = ? WHERE id = ?", new Date().toISOString(), id);
        return json(this.getTxn(id));
      }
      if (action === "reopen" && method === "POST") {
        this.getTxn(id);
        this.sql.exec(
          "UPDATE transactions SET status = 'pending', kind = NULL, category_id = NULL, my_share = NULL, split_with = NULL, reviewed_at = NULL WHERE id = ?",
          id,
        );
        return json(this.getTxn(id));
      }
      if (!action && method === "DELETE") {
        this.getTxn(id);
        this.sql.exec("DELETE FROM transactions WHERE id = ?", id);
        return json({ ok: true });
      }
    }

    if (path === "/categories" && method === "GET") return json(this.categories());

    if (path === "/categories" && method === "POST") {
      const b = await this.body<{ name?: unknown; emoji?: unknown; color?: unknown }>(req);
      const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
      if (!name) throw new HttpError(400, "Give the category a name.");
      if (this.categories().some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `"${name}" already exists.`);
      const sort = this.sql.exec<{ m: number | null }>("SELECT MAX(sort) AS m FROM categories").one().m ?? 0;
      const id = crypto.randomUUID();
      this.sql.exec(
        "INSERT INTO categories (id, name, emoji, color, sort) VALUES (?, ?, ?, ?, ?)",
        id, name,
        typeof b.emoji === "string" ? b.emoji.slice(0, 8) : "🏷️",
        typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#78716c",
        sort + 1,
      );
      return json(this.categories().find((c) => c.id === id), 201);
    }

    if (path === "/categories/reorder" && method === "POST") {
      const { ids } = await this.body<{ ids: unknown }>(req);
      if (!Array.isArray(ids)) throw new HttpError(400, "Expected ids.");
      ids.forEach((id, i) => this.sql.exec("UPDATE categories SET sort = ? WHERE id = ?", i, String(id)));
      return json(this.categories());
    }

    if (seg[0] === "categories" && seg[1] && seg.length === 2) {
      const id = seg[1];
      const existing = this.categories().find((c) => c.id === id);
      if (!existing) throw new HttpError(404, "That category no longer exists.");
      if (method === "PATCH") {
        const b = await this.body<{ name?: unknown; emoji?: unknown; color?: unknown }>(req);
        if (typeof b.name === "string") {
          const name = b.name.trim().slice(0, 40);
          if (!name) throw new HttpError(400, "Name can't be empty.");
          if (this.categories().some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
            throw new HttpError(409, `"${name}" already exists.`);
          }
          this.sql.exec("UPDATE categories SET name = ? WHERE id = ?", name, id);
        }
        if (typeof b.emoji === "string") this.sql.exec("UPDATE categories SET emoji = ? WHERE id = ?", b.emoji.slice(0, 8), id);
        if (typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color)) this.sql.exec("UPDATE categories SET color = ? WHERE id = ?", b.color, id);
        return json(this.categories().find((c) => c.id === id));
      }
      if (method === "DELETE") {
        this.sql.exec("UPDATE transactions SET category_id = NULL WHERE category_id = ?", id);
        this.sql.exec("DELETE FROM merchant_rules WHERE category_id = ?", id);
        this.sql.exec("DELETE FROM categories WHERE id = ?", id);
        return json({ ok: true });
      }
    }

    if (path === "/settings" && method === "GET") {
      return json({
        currency: this.getSetting("currency") ?? "INR",
        ingest_token: this.getSetting("ingest_token"),
        splitwise_connected: !!this.getSetting("splitwise_key"),
      });
    }

    if (path === "/settings" && method === "PATCH") {
      const b = await this.body<{ currency?: unknown; splitwise_key?: unknown }>(req);
      if (typeof b.currency === "string") {
        const c = b.currency.trim().toUpperCase();
        if (!CURRENCY_RE.test(c)) throw new HttpError(400, "Use a 3-letter currency code like INR or USD.");
        this.setSetting("currency", c);
      }
      if (b.splitwise_key === null || b.splitwise_key === "") this.setSetting("splitwise_key", null);
      else if (typeof b.splitwise_key === "string") {
        const key = b.splitwise_key.trim();
        const meta = await fetchSplitwiseMeta(key); // validates the key before saving
        if (!meta.me) throw new HttpError(400, "Splitwise didn't accept that API key.");
        this.setSetting("splitwise_key", key);
      }
      return json({ ok: true });
    }

    if (path === "/settings/rotate-token" && method === "POST") {
      this.setSetting("ingest_token", randomToken());
      return json({ ingest_token: this.getSetting("ingest_token") });
    }

    if (path === "/splitwise" && method === "GET") {
      const key = this.getSetting("splitwise_key");
      if (!key) return json({ connected: false, friends: [], groups: [] } satisfies SplitwiseMeta);
      try {
        return json(await fetchSplitwiseMeta(key));
      } catch (e) {
        return json({ connected: true, friends: [], groups: [], error: (e as Error).message } satisfies SplitwiseMeta);
      }
    }

    if (path === "/export" && method === "GET") {
      const cats = new Map(this.categories().map((c) => [c.id, c.name]));
      const rows = this.sql.exec<Row>("SELECT * FROM transactions WHERE status = 'done' ORDER BY received_at").toArray() as unknown as Transaction[];
      const header = ["date", "merchant", "amount", "currency", "type", "category", "my_share", "split_with", "note", "splitwise_expense_id"];
      const lines = [header.join(",")];
      for (const t of rows) {
        lines.push(
          [t.received_at, t.merchant, t.amount, t.currency, t.kind, t.category_id ? cats.get(t.category_id) : "", t.my_share, t.split_with, t.note, t.splitwise_expense_id]
            .map(csvCell)
            .join(","),
        );
      }
      return new Response(lines.join("\n"), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="expenses.csv"', "cache-control": "no-store" },
      });
    }

    throw new HttpError(404, "Not found.");
  }

  private async review(id: string, b: ReviewInput) {
    const txn = this.getTxn(id);
    if (b.kind !== "personal" && b.kind !== "split") throw new HttpError(400, "Choose 'Just me' or 'Split'.");

    const amount = b.amount != null ? Number(b.amount) : txn.amount;
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "The amount must be more than zero.");
    const merchant = typeof b.merchant === "string" && b.merchant.trim() ? b.merchant.trim().slice(0, 80) : txn.merchant;

    let categoryId: string | null = b.category_id ?? null;
    if (categoryId && !this.categories().some((c) => c.id === categoryId)) throw new HttpError(400, "That category no longer exists.");

    let myShare = amount;
    let splitWith: string | null = null;
    if (b.kind === "split") {
      myShare = Number(b.my_share);
      if (!Number.isFinite(myShare) || myShare < 0 || myShare > amount + 0.001) {
        throw new HttpError(400, "Your share must be between 0 and the full amount.");
      }
      splitWith = typeof b.split_with === "string" ? b.split_with.trim().slice(0, 200) || null : null;
    }
    myShare = round2(myShare);

    let splitwiseId = txn.splitwise_expense_id;
    if (b.kind === "split" && b.splitwise && !splitwiseId) {
      const key = this.getSetting("splitwise_key");
      if (!key) throw new HttpError(400, "Connect Splitwise in Settings first.");
      if (!b.splitwise.friend_ids?.length) throw new HttpError(400, "Pick at least one Splitwise friend to split with.");
      if (myShare >= amount) throw new HttpError(400, "Your share is the whole amount, so there's nothing to split on Splitwise.");
      splitwiseId = await createSplitwiseExpense(key, {
        cost: amount,
        description: merchant,
        currency: txn.currency,
        date: txn.received_at,
        groupId: b.splitwise.group_id ?? 0,
        myShare,
        friendIds: b.splitwise.friend_ids,
      });
    }

    this.sql.exec(
      `UPDATE transactions SET status = 'done', kind = ?, category_id = ?, amount = ?, merchant = ?, my_share = ?, split_with = ?,
         note = ?, splitwise_expense_id = ?, reviewed_at = ? WHERE id = ?`,
      b.kind, categoryId, round2(amount), merchant, myShare, splitWith,
      typeof b.note === "string" ? b.note.trim().slice(0, 300) || null : txn.note,
      splitwiseId, new Date().toISOString(), id,
    );

    const key = merchantKey(merchant);
    if (categoryId && key) {
      this.sql.exec(
        "INSERT INTO merchant_rules (merchant_key, category_id) VALUES (?, ?) ON CONFLICT(merchant_key) DO UPDATE SET category_id = excluded.category_id",
        key, categoryId,
      );
    }
    return this.getTxn(id);
  }
}
