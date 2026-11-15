import { canonicalJson } from "./canonical.ts";
import { sha256Hex } from "./crypto.ts";

/**
 * A hash chain. Each entry's hash covers its own contents AND the previous entry's hash, so changing, removing
 * or reordering any entry breaks every hash after it. Anyone holding the entries can re-check the chain without
 * trusting Backstop. If the newest hash (the "head") has been written down somewhere else, even cutting entries
 * off the end is detected.
 *
 * Honest limit: this is tamper-EVIDENT, not tamper-proof. Someone with full write access to the database could
 * rewrite the whole chain consistently; the head hash shown on each receipt is how that gets caught.
 */

export const GENESIS = "0".repeat(64);

export interface EntryBody {
  stream: string;
  /** 1-based position within the stream. */
  n: number;
  /** Epoch milliseconds. */
  ts: number;
  type: string;
  actor: string;
  data: unknown;
  prev: string;
}

export interface Entry extends EntryBody {
  hash: string;
}

export async function entryHash(body: EntryBody): Promise<string> {
  return sha256Hex(
    canonicalJson({
      stream: body.stream,
      n: body.n,
      ts: body.ts,
      type: body.type,
      actor: body.actor,
      data: body.data,
      prev: body.prev,
    }),
  );
}

export type ChainCheck =
  | { ok: true; length: number; head: string }
  | { ok: false; length: number; brokenAt: number; reason: string };

/** Re-computes every hash and link. `expectedHead` is a head hash recorded elsewhere, if the caller has one. */
export async function verifyChain(entries: Entry[], expectedHead?: string): Promise<ChainCheck> {
  let prev = GENESIS;
  let stream: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const fail = (reason: string): ChainCheck => ({ ok: false, length: entries.length, brokenAt: e.n, reason });
    stream ??= e.stream;
    if (e.stream !== stream) return fail("entry belongs to a different stream");
    if (e.n !== i + 1) return fail(`expected entry ${i + 1}, found ${e.n} (entry missing, repeated or reordered)`);
    if (e.prev !== prev) return fail("does not link to the previous entry");
    let recomputed: string;
    try {
      recomputed = await entryHash(e);
    } catch {
      return fail("entry contents cannot be hashed");
    }
    if (recomputed !== e.hash) return fail("contents do not match the recorded hash (entry was changed)");
    prev = e.hash;
  }
  if (expectedHead !== undefined && prev !== expectedHead) {
    return { ok: false, length: entries.length, brokenAt: entries.length, reason: "the chain does not end at the recorded head (entries added, removed or replaced)" };
  }
  return { ok: true, length: entries.length, head: prev };
}
