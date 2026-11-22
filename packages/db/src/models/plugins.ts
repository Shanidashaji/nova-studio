import { randomBytes } from 'node:crypto';
import type { Query, Schema, SchemaOptions } from 'mongoose';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Collision-resistant, URL-safe string key in the style of the cuid ids the app used before
 * (lowercase, starts with a letter, 25 characters: a time prefix keeps inserts roughly ordered).
 */
export function newId(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const bytes = randomBytes(15);
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % 36];
  return `c${time}${rand}`;
}

export function baseSchemaOptions(collection: string) {
  return {
    collection,
    versionKey: false,
    // Relations are virtuals; include them (and `id`) whenever a document is serialised.
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strictQuery: true,
  } satisfies SchemaOptions;
}

type UpdateQuery = Query<unknown, unknown> & { getOptions(): { skipTouch?: boolean } };

/** Keeps `updatedAt` current on every write, as Prisma's `@updatedAt` did. */
export function touchUpdatedAt(schema: Schema): void {
  schema.pre('save', function () {
    if (!this.isNew && !this.isModified('updatedAt')) this.set('updatedAt', new Date());
  });
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
    schema.pre(op, function (this: UpdateQuery) {
      if (this.getOptions().skipTouch) return;
      const update = this.getUpdate();
      if (!update || Array.isArray(update)) return;
      const set = (update.$set ?? {}) as Record<string, unknown>;
      if (!('updatedAt' in update) && !('updatedAt' in set)) {
        update.$set = { ...set, updatedAt: new Date() };
      }
    });
  }
}

/**
 * Lean reads return plain objects keyed by `_id`; the app (and every API response) speaks `id`.
 * This copies `_id` to `id` on every object in a lean result, populated relations included.
 */
export function addIds<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (v instanceof Date || Buffer.isBuffer(v)) return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    const obj = v as Record<string, unknown>;
    if (typeof obj._id === 'string' && obj.id === undefined) obj.id = obj._id;
    for (const key of Object.keys(obj)) walk(obj[key]);
  };
  walk(value);
  return value;
}

const LEAN_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
] as const;

export function leanIds(schema: Schema): void {
  for (const op of LEAN_OPS) {
    schema.post(op, function (this: Query<unknown, unknown>, result: unknown) {
      if (this.mongooseOptions().lean) addIds(result);
    });
  }
}
