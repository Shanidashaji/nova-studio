import { z } from 'zod';

/** Environment contract. The API refuses to start when it is not met. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
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
  return parsed.data;
}
