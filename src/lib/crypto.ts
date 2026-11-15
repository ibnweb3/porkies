const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Cryptographically random URL-safe token. 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const data = (typeof input === "string" ? enc.encode(input) : input) as BufferSource;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  return [...(await sha256(input))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await sha256(verifier));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function aesKey(b64Key: string): Promise<CryptoKey> {
  const raw = fromB64url(b64Key.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-256-GCM. Output: v1.<iv>.<ciphertext>, all base64url. */
export async function encryptString(b64Key: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(b64Key), enc.encode(plaintext));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptString(b64Key: string, packed: string): Promise<string> {
  const [v, iv, ct] = packed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("bad ciphertext");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) as BufferSource }, await aesKey(b64Key), fromB64url(ct) as BufferSource);
  return dec.decode(pt);
}
