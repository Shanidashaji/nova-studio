import { z } from 'zod';

/** Environment contract. The API refuses to start when it is not met. */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** MongoDB connection string (Atlas: `mongodb+srv://…`). Transactions need a replica set. */
    // Not z.url(): a multi-host string (mongodb://a:27017,b:27017/nova) is valid but not a WHATWG URL.
    DATABASE_URL: z
      .string()
      .trim()
      .regex(
        /^mongodb(\+srv)?:\/\/\S+$/,
        'Must be a mongodb:// or mongodb+srv:// connection string',
      ),
    API_PORT: z.coerce.number().int().positive().default(4000),
    /**
     * Origin(s) of the web app allowed to make state-changing requests. The Studio runs on :3100.
     * Comma-separated, so another trusted origin can be added (e.g. `http://localhost:3100,https://studio.example`).
     */
    WEB_ORIGIN: z
      .string()
      .default('http://localhost:3100')
      .transform((value, ctx) => {
        const origins: string[] = [];
        for (const part of value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          try {
            origins.push(new URL(part).origin);
          } catch {
            ctx.addIssue({ code: 'custom', message: `Not a URL: ${part}` });
            return z.NEVER;
          }
        }
        if (origins.length === 0) {
          ctx.addIssue({ code: 'custom', message: 'At least one origin is required' });
          return z.NEVER;
        }
        return origins;
      }),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
    SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),
    ANTHROPIC_API_KEY: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    ASSISTANT_MODEL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Session cookies are Secure in production; a plain-http public origin would silently break
    // sign-in, so refuse it (localhost stays allowed for a local production check).
    if (env.NODE_ENV !== 'production') return;
    for (const origin of env.WEB_ORIGIN) {
      const url = new URL(origin);
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'https:' && !local) {
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGIN'],
          message: `${origin} must use https in production`,
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  // On Vercel the app is its own origin: trust the deployment, branch and production hostnames
  // Vercel injects, so preview deployments work without listing each URL in WEB_ORIGIN.
  const vercelHosts = ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']
    .map((key) => source[key]?.trim())
    .filter((host): host is string => !!host && /^[a-z0-9.-]+$/i.test(host))
    .map((host) => `https://${host}`);
  return { ...parsed.data, WEB_ORIGIN: [...new Set([...parsed.data.WEB_ORIGIN, ...vercelHosts])] };
}
