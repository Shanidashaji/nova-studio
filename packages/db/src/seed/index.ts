/**
 * Seeds NOVA with DEMONSTRATION DATA (see fixtures.ts). Running it wipes every table first.
 *
 *   pnpm db:seed
 *
 * Requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the root .env.
 */
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';

import { PERMISSIONS, SEED_ROLES, SUPER_ADMIN_ROLE } from '@nova/shared';
import { createPrismaClient } from '../index';
import { hashPassword } from '../password';
import { buildErpWorld } from './erp';
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

  const prisma = createPrismaClient();
  try {
    // Wipe all application tables (keeps the migration history).
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
      );
    }

    // Roles and permissions.
    const permissionIds = new Map<string, string>();
    for (const key of PERMISSIONS) {
      const p = await prisma.permission.create({ data: { key } });
      permissionIds.set(key, p.id);
    }
    const roleIds = new Map<string, string>();
    for (const r of SEED_ROLES) {
      const role = await prisma.role.create({
        data: {
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: true,
          permissions: {
            create: r.permissions.map((p) => ({ permissionId: permissionIds.get(p)! })),
          },
        },
      });
      roleIds.set(r.key, role.id);
    }

    // Users. Demo producer/viewer passwords are random and printed once.
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: process.env.SEED_ADMIN_NAME?.trim() || 'Studio Admin',
        passwordHash: await hashPassword(adminPassword),
        roleId: roleIds.get(SUPER_ADMIN_ROLE)!,
      },
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
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash: await hashPassword(password),
          roleId: roleIds.get(key)!,
        },
      });
      extraUsers.set(key, user.id);
      demoPasswords.push({ email, role: key, password });
    }

    const counts = await buildDemoWorld(prisma, {
      adminId: admin.id,
      producerUserId: extraUsers.get('PRODUCTION_MANAGER')!,
    });
    const erpCounts = await buildErpWorld(prisma, {
      adminId: admin.id,
      producerUserId: extraUsers.get('PRODUCTION_MANAGER')!,
      financeUserId: extraUsers.get('FINANCE')!,
      hrUserId: extraUsers.get('HR')!,
      creativeUserId: extraUsers.get('CREATIVE')!,
    });

    console.log('\nNOVA demo data seeded:');
    console.table({ ...counts, ...erpCounts });
    console.log(`Administrator: ${adminEmail} (password from SEED_ADMIN_PASSWORD)`);
    console.log('Demo accounts (passwords are regenerated on every seed):');
    console.table(demoPasswords);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
