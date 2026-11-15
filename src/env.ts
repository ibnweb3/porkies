import { readFileSync } from "node:fs";

/** Loads KEY=VALUE lines from .env into process.env. Never prints values. */
export function loadEnv(path = new URL("../.env", import.meta.url)): void {
  const text = readFileSync(path, "utf8").replace(/\r/g, "");
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && m[2]) process.env[m[1]!] = m[2];
  }
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing from .env`);
  return v;
}
