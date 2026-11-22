/**
 * Seeds NOVA with DEMONSTRATION DATA (see fixtures.ts). Running it wipes every collection first.
 *
 *   pnpm db:seed
 *
 * Requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the root .env. Collections and indexes
 * are created first (same as `pnpm db:setup`), so a fresh database needs nothing else.
 */
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';

import { PERMISSIONS, SEED_ROLES, SUPER_ADMIN_ROLE } from '@nova/shared';
import { connectDatabase } from '../database';
import { hashPassword } from '../password';
import { buildErpWorld } from './erp';
import { buildStudioWorld } from './studio';
import { buildDemoWorld } from './world';

config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding.');
  }
  if (adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  }
  // The seed wipes every collection. In a production environment it must be asked for explicitly.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_CONFIRM_WIPE !== 'yes') {
    throw new Error(
      'Refusing to seed with NODE_ENV=production: the seed deletes all data. ' +
        'Set SEED_CONFIRM_WIPE=yes to load the demo studio into this database anyway.',
    );
  }

  const db = await connectDatabase();
  const m = db.models;
  try {
    // Collections and indexes, then wipe every collection (documents, files and counters).
    await db.syncIndexes();
    await db.wipe();

    // Roles and permissions.
    const permissionIds = new Map<string, string>();
    for (const key of PERMISSIONS) {
      const p = await m.Permission.create({ key });
      permissionIds.set(key, p._id);
    }
    const roleIds = new Map<string, string>();
    for (const r of SEED_ROLES) {
      const role = await m.Role.create({
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: true,
      });
      await m.RolePermission.insertMany(
        r.permissions.map((p) => ({ roleId: role._id, permissionId: permissionIds.get(p)! })),
      );
      roleIds.set(r.key, role._id);
    }

    // Users. Demo producer/viewer passwords are random and printed once.
    const admin = await m.User.create({
      email: adminEmail,
      name: process.env.SEED_ADMIN_NAME?.trim() || 'Studio Admin',
      passwordHash: await hashPassword(adminPassword),
      roleId: roleIds.get(SUPER_ADMIN_ROLE)!,
    });
    const demoPasswords: { email: string; role: string; password: string }[] = [];
    // Demo accounts, one per working role (fictional people; see fixtures.ts).
    const extraUsers = new Map<string, string>();
    for (const [key, email, name] of [
      ['PRODUCTION_MANAGER', 'producer@nova.local', 'Karthik Subramanian'],
      ['FINANCE', 'finance@nova.local', 'Lakshmi Pillai'],
      ['HR', 'hr@nova.local', 'Sameera Thomas'],
      ['CREATIVE', 'creative@nova.local', 'Arjun Nair'],
      ['VIEWER', 'viewer@nova.local', 'Guest Viewer'],
    ] as const) {
      const password = randomBytes(12).toString('base64url');
      const user = await m.User.create({
        email,
        name,
        passwordHash: await hashPassword(password),
        roleId: roleIds.get(key)!,
      });
      extraUsers.set(key, user._id);
      demoPasswords.push({ email, role: key, password });
    }

    const counts = await buildDemoWorld(db, {
      adminId: admin._id,
      producerUserId: extraUsers.get('PRODUCTION_MANAGER')!,
    });
    const erpCounts = await buildErpWorld(db, {
      adminId: admin._id,
      producerUserId: extraUsers.get('PRODUCTION_MANAGER')!,
      financeUserId: extraUsers.get('FINANCE')!,
      hrUserId: extraUsers.get('HR')!,
      creativeUserId: extraUsers.get('CREATIVE')!,
    });

    const studioCounts = await buildStudioWorld(db, {
      adminId: admin._id,
      producerUserId: extraUsers.get('PRODUCTION_MANAGER')!,
      creativeUserId: extraUsers.get('CREATIVE')!,
    });

    console.log('\nNOVA demo data seeded:');
    console.table({ ...counts, ...erpCounts, ...studioCounts });
    console.log(`Administrator: ${adminEmail} (password from SEED_ADMIN_PASSWORD)`);
    console.log('Demo accounts (passwords are regenerated on every seed):');
    console.table(demoPasswords);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
