// Cloudflare Worker entry: /api/* goes to the live checker, everything else is the static site.
import { handle, secure, type Env } from "./live.ts";

interface WorkerEnv extends Env { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return secure(await handle(req, env));
    return secure(await env.ASSETS.fetch(req));
  },
};
