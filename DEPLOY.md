# Deploying Claim Audit (Cloudflare Worker + static site)

The page works on its own, but the **Try it** box needs the Worker, because the SERV and Reppo keys must never be in the browser.

## 1. Test locally first

```bash
cd ListingAudit
node src/dev-server.ts        # http://localhost:4195, reads keys from .env, live checks ON
```

## 2. Log in to Cloudflare yourself (in your own terminal or browser)

```bash
npx wrangler login
```

## 3. (Recommended) create the usage-limit store

```bash
npx wrangler kv namespace create LIMITS
```

Paste the `id` it prints into `wrangler.jsonc` and uncomment the `kv_namespaces` line. Without it, limits reset whenever the Worker restarts.

## 4. Add the keys as secrets (type or paste each value when asked; do not put them in any file)

```bash
npx wrangler secret put SERV_API_KEY
npx wrangler secret put REPPO_EVAL_KEY
```

The EPC token is not needed by the live page.

## 5. Deploy

```bash
npm run site          # rebuild site/index.html from the latest run
npx wrangler deploy
```

## Limits (change in `wrangler.jsonc`)

- `LIMIT_IP`: live checks per visitor per day (default 2).
- `LIMIT_DAY`: live checks for everyone per day (default 40).
- Each live check costs 440 Reppo credits plus a few cents of SERV credits. Top up Reppo before the judging window.
- Reppo reviews are public, so the page warns visitors and rejects emails and phone numbers.
