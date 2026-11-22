import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RecordNotFoundError,
  type ApprovalRequest,
  type Expense,
  type PopulateOptions,
  type Project,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseRequest,
  type PurchaseRequestItem,
  type StockItem,
  type User,
  type Vendor,
  type VendorQuote,
} from '@nova/db';
import {
  orderStatusFromLines,
  type AddQuote,
  type CreatePurchaseOrder,
  type CreatePurchaseRequest,
  type PurchaseOrderDetail,
  type PurchaseOrderSummary,
  type PurchaseRequestListQuery,
  type PurchaseRequestView,
  type ReceiveOrder,
  type SessionUser,
} from '@nova/shared';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { allocateNumber } from '../../common/numbering';
import { DatabaseService } from '../../database/database.service';
import { ActivityService, type ActivityInput } from '../activity/activity.service';
import {
  approvalPopulate,
  ApprovalsService,
  type ApprovalRow,
} from '../approvals/approvals.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import {
  orderDetailPopulate,
  orderSummaryPopulate,
  toOrderDetail,
  toOrderSummary,
  type OrderDetailRow,
  type OrderSummaryRow,
} from './procurement.mapper';

const requestPopulate: PopulateOptions[] = [
  { path: 'project', select: { code: 1, title: 1 } },
  { path: 'requestedBy', select: { name: 1 } },
  { path: 'items', populate: { path: 'stockItem', select: { sku: 1, name: 1 } } },
  {
    path: 'quotes',
    options: { sort: { amount: 1 } },
    populate: { path: 'vendor', select: { name: 1 } },
  },
  // Keyed by the order's requestId: Mongoose needs it selected to match the order back.
  { path: 'order', select: { number: 1, status: 1, requestId: 1 } },
  // Newest first; only the latest is shown (a request has a handful at most).
  { path: 'approvals', options: { sort: { createdAt: -1 } }, populate: approvalPopulate },
];

type RequestRow = PurchaseRequest & {
  project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  requestedBy: Pick<User, '_id' | 'id' | 'name'>;
  items: (PurchaseRequestItem & {
    stockItem: Pick<StockItem, '_id' | 'id' | 'sku' | 'name'> | null;
  })[];
  quotes: (VendorQuote & { vendor: Pick<Vendor, '_id' | 'id' | 'name'> })[];
  order: Pick<PurchaseOrder, '_id' | 'id' | 'number' | 'status'> | null;
  approvals: ApprovalRow[];
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Procurement: purchase request → quotations → approval (ADR-0010) → purchase order → receiving
 * into stock → vendor bill (an expense that follows the normal expense approval and payment).
 */
@Injectable()
export class ProcurementService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.register('PURCHASE_REQUEST', {
      onApproved: async (r) => {
        await this.database.models.PurchaseRequest.updateMany(
          { _id: r.purchaseRequestId!, status: 'SUBMITTED' },
          { $set: { status: 'APPROVED' } },
        );
      },
      onRejected: async (r) => {
        await this.database.models.PurchaseRequest.updateMany(
          { _id: r.purchaseRequestId!, status: 'SUBMITTED' },
          { $set: { status: 'REJECTED' } },
        );
      },
    });
  }

  private toRequest(r: RequestRow, user: SessionUser): PurchaseRequestView {
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      justification: r.justification,
      status: r.status,
      estimatedTotal: r.estimatedTotal,
      neededBy: isoOrNull(r.neededBy),
      project: r.project
        ? { id: r.project.id, code: r.project.code, title: r.project.title }
        : null,
      requestedBy: { id: r.requestedBy.id, name: r.requestedBy.name },
      createdAt: iso(r.createdAt),
      items: r.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        estimatedUnitCost: i.estimatedUnitCost,
        stockItem: i.stockItem
          ? { id: i.stockItem.id, sku: i.stockItem.sku, name: i.stockItem.name }
          : null,
      })),
      quotes: r.quotes.map((q) => ({
        id: q.id,
        vendor: { id: q.vendor.id, name: q.vendor.name },
        amount: q.amount,
        validUntil: isoOrNull(q.validUntil),
        notes: q.notes,
        isSelected: q.isSelected,
      })),
      order: r.order ? { id: r.order.id, number: r.order.number, status: r.order.status } : null,
      approval: r.approvals[0] ? this.approvals.toView(r.approvals[0], user) : null,
    };
  }

  async requests(q: PurchaseRequestListQuery, user: SessionUser): Promise<PurchaseRequestView[]> {
    const rows = await this.database.models.PurchaseRequest.find(
      q.status ? { status: q.status } : {},
    )
      .sort({ createdAt: -1 })
      .limit(200)
      .populate(requestPopulate)
      .lean<RequestRow[]>();
    return rows.map((r) => this.toRequest(r, user));
  }

  async request(id: string, user: SessionUser): Promise<PurchaseRequestView> {
    const r = await this.database.models.PurchaseRequest.findById(id)
      .populate(requestPopulate)
      .lean<RequestRow>();
    if (!r) throw notFound('Purchase request');
    return this.toRequest(r, user);
  }

  private openApproval(
    log: (i: ActivityInput) => Promise<void>,
    r: {
      id: string;
      number: string;
      title: string;
      estimatedTotal: number;
      projectId: string | null;
    },
    user: SessionUser,
  ) {
    return this.approvals.open(log, {
      subject: 'PURCHASE_REQUEST',
      title: `${r.number} · ${r.title}`,
      amount: r.estimatedTotal,
      requester: user,
      projectId: r.projectId,
      link: { purchaseRequestId: r.id },
    });
  }

  async createRequest(
    input: CreatePurchaseRequest,
    user: SessionUser,
  ): Promise<PurchaseRequestView> {
    const { Project, StockItem, PurchaseRequest, PurchaseRequestItem } = this.database.models;
    if (input.projectId && !(await Project.exists({ _id: input.projectId }))) {
      throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    const stockIds = input.items.map((i) => i.stockItemId).filter((x): x is string => !!x);
    if (stockIds.length) {
      const found = await StockItem.countDocuments({ _id: { $in: stockIds } });
      if (found !== new Set(stockIds).size) {
        throw unprocessable('INVALID_STOCK_ITEM', 'One of the stock items no longer exists.');
      }
    }
    const estimatedTotal = input.items.reduce((n, i) => n + i.quantity * i.estimatedUnitCost, 0);
    const id = await this.activity.transaction(async (log) => {
      const number = await allocateNumber(this.database, 'purchaseRequest');
      const r = (
        await PurchaseRequest.create({
          number,
          title: input.title,
          justification: input.justification ?? null,
          projectId: input.projectId ?? null,
          neededBy: input.neededBy ?? null,
          requestedById: user.id,
          status: input.submit ? 'SUBMITTED' : 'DRAFT',
          estimatedTotal,
        })
      ).toObject<PurchaseRequest>();
      await PurchaseRequestItem.insertMany(
        input.items.map((i) => ({
          requestId: r.id,
          description: i.description,
          quantity: i.quantity,
          estimatedUnitCost: i.estimatedUnitCost,
          stockItemId: i.stockItemId ?? null,
        })),
      );
      await log({
        actorId: user.id,
        action: 'purchase_request.created',
        entityType: 'purchase_request',
        entityId: r.id,
        projectId: r.projectId,
        summary: `${user.name} ${input.submit ? 'raised' : 'drafted'} purchase request ${number} — ${r.title} (${rupees(estimatedTotal)})`,
      });
      if (input.submit) await this.openApproval(log, r, user);
      return r.id;
    });
    return this.request(id, user);
  }

  private async ownRequest(id: string, user: SessionUser) {
    const r = await this.database.models.PurchaseRequest.findById(id).lean<PurchaseRequest>();
    if (!r) throw notFound('Purchase request');
    if (r.requestedById !== user.id && !user.permissions.includes('procurement:order')) {
      throw forbidden('Only the requester can change this purchase request.');
    }
    return r;
  }

  async submitRequest(id: string, user: SessionUser) {
    const r = await this.ownRequest(id, user);
    if (r.status !== 'DRAFT' && r.status !== 'REJECTED') {
      throw conflict('REQUEST_NOT_DRAFT', 'This request has already been submitted.');
    }
    await this.activity.transaction(async (log) => {
      const updated = await this.database.models.PurchaseRequest.findByIdAndUpdate(
        id,
        { $set: { status: 'SUBMITTED' } },
        { new: true },
      ).lean<PurchaseRequest>();
      if (!updated) throw new RecordNotFoundError('PurchaseRequest');
      await this.openApproval(log, updated, user);
    });
    return this.request(id, user);
  }

  async cancelRequest(id: string, user: SessionUser) {
    const r = await this.ownRequest(id, user);
    const { PurchaseRequest } = this.database.models;
    await this.activity.transaction(async (log) => {
      // Same lock as createOrder, so a cancel cannot race an order being issued.
      await this.database.lock('PurchaseRequest', id);
      const fresh = await PurchaseRequest.findById(id).lean<PurchaseRequest>();
      if (!fresh) throw new RecordNotFoundError('PurchaseRequest');
      if (fresh.status === 'ORDERED' || fresh.status === 'CANCELLED') {
        throw conflict('REQUEST_LOCKED', 'Ordered or cancelled requests cannot be cancelled.');
      }
      await this.approvals.cancelOpen({ purchaseRequestId: id });
      await PurchaseRequest.updateOne({ _id: id }, { $set: { status: 'CANCELLED' } });
      await log({
        actorId: user.id,
        action: 'purchase_request.cancelled',
        entityType: 'purchase_request',
        entityId: id,
        projectId: r.projectId,
        summary: `${user.name} cancelled purchase request ${r.number}`,
      });
    });
    return this.request(id, user);
  }

  async addQuote(id: string, input: AddQuote, user: SessionUser) {
    const { PurchaseRequest, Vendor, VendorQuote } = this.database.models;
    const r = await PurchaseRequest.findById(id).lean<PurchaseRequest>();
    if (!r) throw notFound('Purchase request');
    if (['ORDERED', 'CANCELLED', 'REJECTED'].includes(r.status)) {
      throw conflict('REQUEST_LOCKED', 'Quotations can no longer be added to this request.');
    }
    const vendor = await Vendor.findById(input.vendorId).lean<Vendor>();
    if (!vendor?.isActive) throw unprocessable('INVALID_VENDOR', 'Choose an active vendor.');
    if (await VendorQuote.exists({ requestId: id, vendorId: input.vendorId })) {
      throw conflict('QUOTE_EXISTS', `${vendor.name} has already quoted on this request.`);
    }
    await this.activity.transaction(async (log) => {
      await VendorQuote.create({
        requestId: id,
        vendorId: input.vendorId,
        amount: input.amount,
        validUntil: input.validUntil ?? null,
        notes: input.notes ?? null,
      });
      await log({
        actorId: user.id,
        action: 'purchase_request.quote',
        entityType: 'purchase_request',
        entityId: id,
        projectId: r.projectId,
        summary: `${user.name} recorded a ${rupees(input.amount)} quotation from ${vendor.name} on ${r.number}`,
      });
    });
    return this.request(id, user);
  }

  async selectQuote(id: string, quoteId: string, user: SessionUser) {
    const { VendorQuote } = this.database.models;
    const q = await VendorQuote.findOne({ _id: quoteId, requestId: id })
      .populate(['vendor', 'request'])
      .lean<VendorQuote & { vendor: Vendor; request: PurchaseRequest }>();
    if (!q) throw notFound('Quotation');
    if (q.request.status === 'ORDERED')
      throw conflict('REQUEST_LOCKED', 'This request is already ordered.');
    await this.activity.transaction(async (log) => {
      await VendorQuote.updateMany({ requestId: id }, { $set: { isSelected: false } });
      await VendorQuote.updateOne({ _id: quoteId }, { $set: { isSelected: true } });
      await log({
        actorId: user.id,
        action: 'purchase_request.quote_selected',
        entityType: 'purchase_request',
        entityId: id,
        projectId: q.request.projectId,
        summary: `${user.name} selected ${q.vendor.name}’s quotation (${rupees(q.amount)}) for ${q.request.number}`,
      });
    });
    return this.request(id, user);
  }

  // ── Purchase orders ───────────────────────────────────────────────────────

  async orders(): Promise<PurchaseOrderSummary[]> {
    const rows = await this.database.models.PurchaseOrder.find()
      .sort({ issuedOn: -1 })
      .limit(200)
      .populate(orderSummaryPopulate)
      .lean<OrderSummaryRow[]>();
    return rows.map(toOrderSummary);
  }

  async order(id: string): Promise<PurchaseOrderDetail> {
    const o = await this.database.models.PurchaseOrder.findById(id)
      .populate(orderDetailPopulate)
      .lean<OrderDetailRow>();
    if (!o) throw notFound('Purchase order');
    return toOrderDetail(o);
  }

  async createOrder(input: CreatePurchaseOrder, user: SessionUser): Promise<PurchaseOrderDetail> {
    const { PurchaseRequest, Vendor, ApprovalRequest, PurchaseOrder, PurchaseOrderLine } =
      this.database.models;
    const id = await this.activity.transaction(async (log) => {
      await this.database.lock('PurchaseRequest', input.requestId);
      const r = await PurchaseRequest.findById(input.requestId)
        .populate(['items', 'quotes', 'order'])
        .lean<
          PurchaseRequest & {
            items: PurchaseRequestItem[];
            quotes: VendorQuote[];
            order: PurchaseOrder | null;
          }
        >();
      if (!r) throw notFound('Purchase request');
      if (r.status !== 'APPROVED' || r.order) {
        throw conflict(
          'REQUEST_NOT_APPROVED',
          'Only an approved request without an order can be ordered.',
        );
      }
      const selected = r.quotes.find((q) => q.isSelected);
      const vendorId = input.vendorId ?? selected?.vendorId;
      if (!vendorId) {
        throw unprocessable('VENDOR_REQUIRED', 'Choose a vendor or select a quotation first.');
      }
      const vendor = await Vendor.findById(vendorId).lean<Vendor>();
      if (!vendor?.isActive) throw unprocessable('INVALID_VENDOR', 'Choose an active vendor.');
      const lines = r.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitCost: i.estimatedUnitCost,
        stockItemId: i.stockItemId,
      }));
      // When ordering from the selected quotation, the quoted amount is the order total.
      const total =
        selected && selected.vendorId === vendorId
          ? selected.amount
          : lines.reduce((n, l) => n + l.quantity * l.unitCost, 0);
      // The approval covered a specific amount; a dearer order needs a fresh approval.
      const approved = await ApprovalRequest.findOne({
        purchaseRequestId: r.id,
        status: 'APPROVED',
      })
        .sort({ decidedAt: -1 })
        .select({ amount: 1 })
        .lean<Pick<ApprovalRequest, 'amount'>>();
      if (!approved || total > (approved.amount ?? 0)) {
        throw conflict(
          'OVER_APPROVED_AMOUNT',
          `The order total (₹${total.toLocaleString('en-IN')}) is above the approved ₹${(approved?.amount ?? 0).toLocaleString('en-IN')}. Cancel and raise a new request for the higher amount.`,
        );
      }
      const number = await allocateNumber(this.database, 'purchaseOrder');
      const o = (
        await PurchaseOrder.create({
          number,
          requestId: r.id,
          vendorId,
          issuedOn: new Date(),
          expectedOn: input.expectedOn ?? null,
          total,
          notes: input.notes ?? null,
          createdById: user.id,
        })
      ).toObject<PurchaseOrder>();
      await PurchaseOrderLine.insertMany(lines.map((l) => ({ ...l, orderId: o.id })));
      await PurchaseRequest.updateOne({ _id: r.id }, { $set: { status: 'ORDERED' } });
      await log({
        actorId: user.id,
        action: 'purchase_order.issued',
        entityType: 'purchase_order',
        entityId: o.id,
        projectId: r.projectId,
        summary: `${user.name} issued ${number} to ${vendor.name} for ${r.number} (${rupees(total)})`,
      });
      return o.id;
    });
    return this.order(id);
  }

  /** Records goods received. Stock lines increase on-hand; the last receipt can raise the bill. */
  async receive(id: string, input: ReceiveOrder, user: SessionUser): Promise<PurchaseOrderDetail> {
    const { PurchaseOrder, PurchaseOrderLine, StockItem, StockMovement, Expense } =
      this.database.models;
    await this.activity.transaction(async (log) => {
      await this.database.lock('PurchaseOrder', id);
      const o = await PurchaseOrder.findById(id)
        .populate(['lines', 'vendor', 'request', 'bill'])
        .lean<
          PurchaseOrder & {
            lines: PurchaseOrderLine[];
            vendor: Vendor;
            request: PurchaseRequest | null;
            bill: Expense | null;
          }
        >();
      if (!o) throw notFound('Purchase order');
      if (o.status === 'RECEIVED' || o.status === 'CANCELLED') {
        throw conflict('ORDER_CLOSED', 'This order is already closed.');
      }
      let units = 0;
      for (const r of input.lines) {
        const line = o.lines.find((l) => l.id === r.lineId);
        if (!line) throw unprocessable('INVALID_LINE', 'A line does not belong to this order.');
        if (r.quantity === 0) continue;
        if (line.receivedQty + r.quantity > line.quantity) {
          throw unprocessable(
            'OVER_RECEIPT',
            `“${line.description}”: only ${line.quantity - line.receivedQty} still to receive.`,
          );
        }
        await PurchaseOrderLine.updateOne({ _id: line.id }, { $inc: { receivedQty: r.quantity } });
        line.receivedQty += r.quantity;
        units += r.quantity;
        if (line.stockItemId) {
          // The atomic increment writes the stock item inside this transaction, so a concurrent
          // movement on it conflicts and retries: balanceAfter always matches the ledger.
          const item = await StockItem.findByIdAndUpdate(
            line.stockItemId,
            { $inc: { onHand: r.quantity } },
            { new: true },
          ).lean<StockItem>();
          if (!item) throw new RecordNotFoundError('StockItem');
          await StockMovement.create({
            stockItemId: item.id,
            type: 'RECEIVED',
            quantity: r.quantity,
            balanceAfter: item.onHand,
            purchaseOrderLineId: line.id,
            projectId: o.request?.projectId ?? null,
            note: `Received on ${o.number}`,
            actorId: user.id,
          });
        }
      }
      if (units === 0)
        throw unprocessable('NOTHING_RECEIVED', 'Enter at least one received quantity.');
      const status = orderStatusFromLines(o.lines);
      await PurchaseOrder.updateOne({ _id: id }, { $set: { status } });
      await log({
        actorId: user.id,
        action: 'purchase_order.received',
        entityType: 'purchase_order',
        entityId: id,
        projectId: o.request?.projectId ?? null,
        summary: `${user.name} received ${units} unit${units === 1 ? '' : 's'} on ${o.number}${status === 'RECEIVED' ? ' — order complete' : ''}`,
      });
      if (status === 'RECEIVED' && input.createBill && !o.bill) {
        const number = await allocateNumber(this.database, 'expense');
        const bill = (
          await Expense.create({
            number,
            title: `Vendor bill — ${o.number} (${o.vendor.name})`,
            category: 'CONSUMABLES',
            amount: o.total,
            incurredOn: new Date(),
            vendorId: o.vendorId,
            projectId: o.request?.projectId ?? null,
            purchaseOrderId: o.id,
            submittedById: user.id,
            status: 'SUBMITTED',
          })
        ).toObject<Expense>();
        await this.approvals.open(log, {
          subject: 'EXPENSE',
          title: `${number} · ${bill.title}`,
          amount: bill.amount,
          requester: user,
          projectId: bill.projectId,
          link: { expenseId: bill.id },
        });
      }
    });
    return this.order(id);
  }

  async cancelOrder(id: string, user: SessionUser): Promise<PurchaseOrderDetail> {
    const { PurchaseOrder, PurchaseRequest } = this.database.models;
    type OrderWithLines = PurchaseOrder & { lines: PurchaseOrderLine[] };
    const o = await PurchaseOrder.findById(id).populate('lines').lean<OrderWithLines>();
    if (!o) throw notFound('Purchase order');
    if (o.status !== 'ISSUED' || o.lines.some((l) => l.receivedQty > 0)) {
      throw conflict('ORDER_RECEIVING', 'Only an order with nothing received can be cancelled.');
    }
    await this.activity.transaction(async (log) => {
      // Same lock as receive(): a receipt cannot land on an order being cancelled.
      await this.database.lock('PurchaseOrder', id);
      const fresh = await PurchaseOrder.findById(id).populate('lines').lean<OrderWithLines>();
      if (!fresh) throw new RecordNotFoundError('PurchaseOrder');
      if (fresh.status !== 'ISSUED' || fresh.lines.some((l) => l.receivedQty > 0)) {
        throw conflict('ORDER_RECEIVING', 'Only an order with nothing received can be cancelled.');
      }
      await PurchaseOrder.updateOne({ _id: id }, { $set: { status: 'CANCELLED' } });
      if (o.requestId) {
        // The approval still stands; the request can be ordered again from another vendor.
        await PurchaseRequest.updateOne({ _id: o.requestId }, { $set: { status: 'APPROVED' } });
        await PurchaseOrder.updateOne({ _id: id }, { $set: { requestId: null } });
      }
      await log({
        actorId: user.id,
        action: 'purchase_order.cancelled',
        entityType: 'purchase_order',
        entityId: id,
        summary: `${user.name} cancelled ${o.number}`,
      });
    });
    return this.order(id);
  }
}
