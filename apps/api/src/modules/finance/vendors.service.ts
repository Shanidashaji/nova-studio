import { Injectable } from '@nestjs/common';
import type { Prisma } from '@nova/db';
import type {
  CreateVendor,
  SessionUser,
  UpdateVendor,
  VendorDetail,
  VendorView,
} from '@nova/shared';
import { conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';
import { expenseInclude, toExpense } from './expenses.service';
import { orderSummaryInclude, toOrderSummary } from '../procurement/procurement.mapper';

const vendorInclude = {
  expenses: { where: { status: { in: ['APPROVED', 'PAID'] } }, select: { amount: true } },
  purchaseOrders: {
    where: { status: { in: ['ISSUED', 'PARTIALLY_RECEIVED'] } },
    select: { id: true },
  },
} satisfies Prisma.VendorInclude;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private toView(v: Prisma.VendorGetPayload<{ include: typeof vendorInclude }>): VendorView {
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      contactName: v.contactName,
      email: v.email,
      phone: v.phone,
      city: v.city,
      notes: v.notes,
      isActive: v.isActive,
      totalSpend: v.expenses.reduce((n, e) => n + e.amount, 0),
      openOrders: v.purchaseOrders.length,
    };
  }

  async list(): Promise<VendorView[]> {
    const rows = await this.prisma.db.vendor.findMany({
      include: vendorInclude,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map((v) => this.toView(v));
  }

  /** Spend history (expenses) is financial data: included only for `finance:read`. */
  async get(id: string, canSeeFinance: boolean): Promise<VendorDetail> {
    const v = await this.prisma.db.vendor.findUnique({ where: { id }, include: vendorInclude });
    if (!v) throw notFound('Vendor');
    const [expenses, orders, quotes] = await Promise.all([
      canSeeFinance
        ? this.prisma.db.expense.findMany({
            where: { vendorId: id },
            include: expenseInclude,
            orderBy: { incurredOn: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      this.prisma.db.purchaseOrder.findMany({
        where: { vendorId: id },
        include: orderSummaryInclude,
        orderBy: { issuedOn: 'desc' },
      }),
      this.prisma.db.vendorQuote.findMany({
        where: { vendorId: id },
        include: { request: { select: { id: true, number: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      ...this.toView(v),
      expenses: expenses.map(toExpense),
      orders: orders.map(toOrderSummary),
      quotes: quotes.map((q) => ({
        id: q.id,
        amount: q.amount,
        request: q.request,
        isSelected: q.isSelected,
        createdAt: iso(q.createdAt),
      })),
    };
  }

  async create(input: CreateVendor, user: SessionUser): Promise<VendorDetail> {
    if (await this.prisma.db.vendor.findUnique({ where: { name: input.name } })) {
      throw conflict('VENDOR_EXISTS', 'A vendor with this name already exists.');
    }
    const v = await this.activity.transaction(async (tx, log) => {
      const created = await tx.vendor.create({ data: input });
      await log({
        actorId: user.id,
        action: 'vendor.created',
        entityType: 'vendor',
        entityId: created.id,
        summary: `${user.name} added vendor ${created.name}`,
      });
      return created;
    });
    return this.get(v.id, user.permissions.includes('finance:read'));
  }

  async update(id: string, input: UpdateVendor, user: SessionUser): Promise<VendorDetail> {
    const before = await this.prisma.db.vendor.findUnique({ where: { id } });
    if (!before) throw notFound('Vendor');
    if (input.name && input.name !== before.name) {
      if (await this.prisma.db.vendor.findUnique({ where: { name: input.name } })) {
        throw conflict('VENDOR_EXISTS', 'A vendor with this name already exists.');
      }
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.vendor.update({ where: { id }, data: input });
      await log({
        actorId: user.id,
        action: 'vendor.updated',
        entityType: 'vendor',
        entityId: id,
        summary:
          input.isActive === false
            ? `${user.name} deactivated vendor ${before.name}`
            : `${user.name} updated vendor ${input.name ?? before.name}`,
      });
    });
    return this.get(id, user.permissions.includes('finance:read'));
  }
}
