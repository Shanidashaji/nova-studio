/**
 * Password hashing with Argon2id from Node's built-in `crypto` module (Node ≥ 24.7).
 * No native add-on is needed, which matters on machines where Windows Smart App Control
 * blocks unsigned `.node` binaries.
 *
 * Hashes are stored in the standard PHC string format:
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt b64>$<hash b64>
 * Parameters follow the OWASP Password Storage Cheat Sheet minimum for Argon2id.
 */
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const;

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');
const fromB64 = (s: string) => Buffer.from(s, 'base64');

function derive(
  password: string,
  salt: Buffer,
  p: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...p }, (err, key) =>
      err ? reject(err) : resolve(Buffer.from(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(key)}`;
}

/** Constant-time verification. Returns false for malformed hashes instead of throwing. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(stored);
  if (!match) return false;
  const [, m, t, p, salt, hash] = match;
  const expected = fromB64(hash!);
  const actual = await derive(password, fromB64(salt!), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
