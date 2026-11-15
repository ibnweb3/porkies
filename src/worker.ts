// Cloudflare Worker entry: /api/* goes to the live checker, everything else is the static site.
import { handle, type Env } from "./live.ts";

interface WorkerEnv extends Env { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handle(req, env);
    return env.ASSETS.fetch(req);
  },
};
