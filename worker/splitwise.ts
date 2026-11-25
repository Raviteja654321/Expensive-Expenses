import type { SplitwiseMeta } from "../shared/types";

const BASE = "https://secure.splitwise.com/api/v3.0";

export class SplitwiseError extends Error {}

interface SwUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  default_currency?: string;
}

const fullName = (u: SwUser) => [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || `User ${u.id}`;

function errorText(errors: unknown): string | null {
  if (!errors) return null;
  if (Array.isArray(errors)) return errors.length ? errors.join("; ") : null;
  if (typeof errors === "object") {
    const parts = Object.values(errors as Record<string, unknown>).flat().filter(Boolean).map(String);
    return parts.length ? parts.join("; ") : null;
  }
  return String(errors);
}

async function call<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new SplitwiseError("couldn't reach Splitwise. Try again in a moment.");
  }
  if (res.status === 401 || res.status === 403) throw new SplitwiseError("the API key was rejected. Check it in Settings.");
  const data = (await res.json().catch(() => null)) as (T & { errors?: unknown; error?: unknown }) | null;
  if (!res.ok || !data) {
    throw new SplitwiseError(errorText(data?.errors) ?? errorText(data?.error) ?? `request failed (${res.status}).`);
  }
  return data;
}

export async function fetchSplitwiseMeta(key: string): Promise<SplitwiseMeta> {
  const [me, friends, groups] = await Promise.all([
    call<{ user: SwUser }>(key, "/get_current_user"),
    call<{ friends: SwUser[] }>(key, "/get_friends"),
    call<{ groups: { id: number; name: string; members: SwUser[] }[] }>(key, "/get_groups"),
  ]);
  const myId = me.user.id;
  return {
    connected: true,
    me: { id: myId, name: fullName(me.user), default_currency: me.user.default_currency },
    friends: friends.friends.map((f) => ({ id: f.id, name: fullName(f) })).sort((a, b) => a.name.localeCompare(b.name)),
    // Group 0 is Splitwise's pseudo-group for non-group expenses.
    groups: groups.groups
      .filter((g) => g.id !== 0)
      .map((g) => ({ id: g.id, name: g.name, member_ids: g.members.map((m) => m.id).filter((id) => id !== myId) })),
  };
}

export interface NewSplit {
  cost: number;
  description: string;
  currency: string;
  date: string;
  groupId: number;
  myShare: number;
  friendIds: number[];
}

/** Creates an expense paid fully by you, where you owe `myShare` and friends split the rest equally. Returns the expense id. */
export async function createSplitwiseExpense(key: string, s: NewSplit): Promise<string> {
  const me = await call<{ user: SwUser }>(key, "/get_current_user");
  const friendIds = [...new Set(s.friendIds)].filter((id) => id !== me.user.id);
  if (!friendIds.length) throw new SplitwiseError("pick at least one friend.");

  // Work in cents so the shares always add up exactly to the cost.
  const costC = Math.round(s.cost * 100);
  const mineC = Math.round(s.myShare * 100);
  const restC = costC - mineC;
  const each = Math.floor(restC / friendIds.length);
  let remainder = restC - each * friendIds.length;
  const money = (c: number) => (c / 100).toFixed(2);

  const p = new URLSearchParams({
    cost: money(costC),
    description: s.description.slice(0, 100),
    currency_code: s.currency,
    date: s.date,
    group_id: String(s.groupId || 0),
    users__0__user_id: String(me.user.id),
    users__0__paid_share: money(costC),
    users__0__owed_share: money(mineC),
  });
  friendIds.forEach((id, i) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    p.set(`users__${i + 1}__user_id`, String(id));
    p.set(`users__${i + 1}__paid_share`, "0.00");
    p.set(`users__${i + 1}__owed_share`, money(each + extra));
  });

  const data = await call<{ expenses?: { id: number }[]; errors?: unknown }>(key, "/create_expense", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const err = errorText(data.errors);
  if (err) throw new SplitwiseError(err);
  const id = data.expenses?.[0]?.id;
  if (!id) throw new SplitwiseError("Splitwise didn't return the new expense.");
  return String(id);
}
