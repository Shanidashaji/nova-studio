# Deploying NOVA to Vercel

NOVA ships as **one Vercel project**: the Next.js app in `apps/web`. That app also serves the NestJS API at `/api/*` ([ADR-0014](../decisions/0014-mongodb-and-single-vercel-app.md)). Data lives in MongoDB Atlas, and uploaded documents live there too, in GridFS.

## 1. MongoDB Atlas

1. Create a cluster. M0 (free) works for a demo, M10 or larger for real use. Choose **AWS / Mumbai (ap-south-1)**, which sits next to the function region `bom1`.
2. **Database Access** → add a user, for example `nova_prod`, with a strong generated password and the role _readWrite_ on database `nova` only.
3. **Network Access** → add `0.0.0.0/0`, because Vercel functions have no fixed outbound IPs. Alternatively, connect the project through the Vercel ↔ MongoDB Atlas integration.
4. **Connect → Drivers** → copy the `mongodb+srv://…` string and put the database name in the path: `…mongodb.net/nova?retryWrites=true&w=majority&appName=nova-studio`.
5. Create the collections and indexes once, from your machine:

   ```bash
   DATABASE_URL='mongodb+srv://…/nova?…' pnpm db:setup
   ```

   For a demo deployment you can also load the demonstration studio. **This wipes the database first:**

   ```bash
   DATABASE_URL='mongodb+srv://…/nova?…' SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='…' pnpm db:seed
   ```

   On a real production database, run `db:setup` only. Then create the first admin through the seed's admin step, or create it on a scratch copy and migrate it across.

## 2. Vercel project

1. **Add New → Project** → import the GitHub repository.
2. **Root Directory:** `apps/web`. Vercel reads `apps/web/vercel.json`:
   - install: `pnpm install --frozen-lockfile` at the repository root
   - build: `pnpm turbo run build --filter=@nova/web...`, which builds `shared`, then `db`, then `api` (`nest build`), then `web`
   - region `bom1` (Mumbai); the `/api` function gets `maxDuration` 300 s, which keeps the live-update stream open
3. **Node.js version:** 24.x. It is pinned by `engines` in `apps/web/package.json`. Password hashing needs Node ≥ 24.7.
4. **Environment Variables** (Production; repeat for Preview with a separate database). The full list is in [`.env.production.example`](../../.env.production.example):

   | Variable                                  | Required | Notes                                                                                                      |
   | ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                            | yes      | Atlas `mongodb+srv://` string with the database name                                                       |
   | `WEB_ORIGIN`                              | yes\*    | Your custom domain(s), `https://` only. \*The `*.vercel.app` URLs Vercel injects are trusted automatically |
   | `SESSION_TTL_HOURS`, `SESSION_IDLE_HOURS` | no       | Defaults: 168 and 8                                                                                        |
   | `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`    | no       | Without a key the assistant runs in demo mode                                                              |

   Vercel sets `NODE_ENV=production` itself, which makes the session cookie `Secure`. Do **not** set `API_INTERNAL_URL` on Vercel.

5. Deploy. Check the deployment at `https://<deployment>/api/v1/health`, which should return `{"status":"ok","database":"ok",…}`.

From the CLI instead of the dashboard:

```bash
cd apps/web
vercel link
vercel env add DATABASE_URL production
vercel env add WEB_ORIGIN production
vercel --prod
```

## 3. Custom domain

Add it under **Settings → Domains**, then add `https://your.domain` to `WEB_ORIGIN` and redeploy.

## Operational notes

- **Cold start.** The first request on a new instance boots Nest and connects to Atlas, which takes about 1–2 s. Later requests reuse both.
- **Connections.** Each instance keeps a pool of at most 5 connections. M0 allows 500, so keep an eye on it under heavy concurrency, or move up a tier.
- **Live updates (SSE).** An event reaches clients connected to the instance that handled the write. Other clients pick changes up when their stream reconnects (at least every 300 s) or when they refetch.
- **Rate limits** are kept in memory per instance. For a hard global limit, add Vercel Firewall rate-limiting rules on `/api/v1/auth/login`.
- **Uploads** are limited to 4 MB per file, which keeps them under Vercel's 4.5 MB request-body limit.
- **Backups.** Enable Atlas Cloud Backup (M10+) or schedule `mongodump`.
