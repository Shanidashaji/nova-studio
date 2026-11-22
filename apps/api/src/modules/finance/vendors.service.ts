import { Injectable } from '@nestjs/common';
import type {
  Expense,
  PopulateOptions,
  PurchaseOrder,
  PurchaseRequest,
  Vendor,
  VendorQuote,
} from '@nova/db';
import type {
  CreateVendor,
  SessionUser,
  UpdateVendor,
  VendorDetail,
  VendorView,
} from '@nova/shared';
import { conflict, notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';
import { expensePopulate, toExpense, type ExpenseRow } from './expenses.service';
import {
  orderSummaryPopulate,
  toOrderSummary,
  type OrderSummaryRow,
} from '../procurement/procurement.mapper';

const vendorPopulate: PopulateOptions[] = [
  {
    path: 'expenses',
    match: { status: { $in: ['APPROVED', 'PAID'] } },
    select: { vendorId: 1, amount: 1 },
  },
  {
    path: 'purchaseOrders',
    match: { status: { $in: ['ISSUED', 'PARTIALLY_RECEIVED'] } },
    select: { vendorId: 1 },
  },
];

type VendorRow = Vendor & {
  expenses: Pick<Expense, '_id' | 'id' | 'vendorId' | 'amount'>[];
  purchaseOrders: Pick<PurchaseOrder, '_id' | 'id' | 'vendorId'>[];
};

type QuoteRow = VendorQuote & {
  request: Pick<PurchaseRequest, '_id' | 'id' | 'number' | 'title'>;
};

@Injectable()
export class VendorsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  private toView(v: VendorRow): VendorView {
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
    const rows = await this.database.models.Vendor.find()
      .populate(vendorPopulate)
      .sort({ isActive: -1, name: 1 })
      .lean<VendorRow[]>();
    return rows.map((v) => this.toView(v));
  }

  /** Spend history (expenses) is financial data: included only for `finance:read`. */
  async get(id: string, canSeeFinance: boolean): Promise<VendorDetail> {
    const {
      Vendor: Vendors,
      Expense: Expenses,
      PurchaseOrder,
      VendorQuote: Quotes,
    } = this.database.models;
    const v = await Vendors.findById(id).populate(vendorPopulate).lean<VendorRow>();
    if (!v) throw notFound('Vendor');
    const [expenses, orders, quotes] = await Promise.all([
      canSeeFinance
        ? Expenses.find({ vendorId: id })
            .populate(expensePopulate)
            .sort({ incurredOn: -1 })
            .limit(50)
            .lean<ExpenseRow[]>()
        : Promise.resolve([] as ExpenseRow[]),
      PurchaseOrder.find({ vendorId: id })
        .populate(orderSummaryPopulate)
        .sort({ issuedOn: -1 })
        .lean<OrderSummaryRow[]>(),
      Quotes.find({ vendorId: id })
        .populate({ path: 'request', select: { number: 1, title: 1 } })
        .sort({ createdAt: -1 })
        .lean<QuoteRow[]>(),
    ]);
    return {
      ...this.toView(v),
      expenses: expenses.map(toExpense),
      orders: orders.map(toOrderSummary),
      quotes: quotes.map((q) => ({
        id: q.id,
        amount: q.amount,
        request: { id: q.request.id, number: q.request.number, title: q.request.title },
        isSelected: q.isSelected,
        createdAt: iso(q.createdAt),
      })),
    };
  }

  async create(input: CreateVendor, user: SessionUser): Promise<VendorDetail> {
    const { Vendor: Vendors } = this.database.models;
    if (await Vendors.exists({ name: input.name })) {
      throw conflict('VENDOR_EXISTS', 'A vendor with this name already exists.');
    }
    const v = await this.activity.transaction(async (log) => {
      const created = (await Vendors.create(input)).toObject<Vendor>();
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
    const { Vendor: Vendors } = this.database.models;
    const before = await Vendors.findById(id).lean<Vendor>();
    if (!before) throw notFound('Vendor');
    if (input.name && input.name !== before.name) {
      if (await Vendors.exists({ name: input.name })) {
        throw conflict('VENDOR_EXISTS', 'A vendor with this name already exists.');
      }
    }
    await this.activity.transaction(async (log) => {
      const res = await Vendors.updateOne({ _id: id }, { $set: input });
      if (res.matchedCount === 0) throw notFound('Vendor');
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
