import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@nova/db';
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
import { PrismaService, type Db } from '../../database/prisma.service';
import { ActivityService, type ActivityInput } from '../activity/activity.service';
import { approvalInclude, ApprovalsService } from '../approvals/approvals.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import {
  orderDetailInclude,
  orderSummaryInclude,
  toOrderDetail,
  toOrderSummary,
} from './procurement.mapper';

const requestInclude = {
  project: { select: { id: true, code: true, title: true } },
  requestedBy: { select: { id: true, name: true } },
  items: { include: { stockItem: { select: { id: true, sku: true, name: true } } } },
  quotes: { include: { vendor: { select: { id: true, name: true } } }, orderBy: { amount: 'asc' } },
  order: { select: { id: true, number: true, status: true } },
  approvals: { include: approvalInclude, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.PurchaseRequestInclude;

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Procurement: purchase request → quotations → approval (ADR-0010) → purchase order → receiving
 * into stock → vendor bill (an expense that follows the normal expense approval and payment).
 */
@Injectable()
export class ProcurementService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.register('PURCHASE_REQUEST', {
      onApproved: async (tx, r) => {
        await tx.purchaseRequest.updateMany({
          where: { id: r.purchaseRequestId!, status: 'SUBMITTED' },
          data: { status: 'APPROVED' },
        });
      },
      onRejected: async (tx, r) => {
        await tx.purchaseRequest.updateMany({
          where: { id: r.purchaseRequestId!, status: 'SUBMITTED' },
          data: { status: 'REJECTED' },
        });
      },
    });
  }

  private toRequest(
    r: Prisma.PurchaseRequestGetPayload<{ include: typeof requestInclude }>,
    user: SessionUser,
  ): PurchaseRequestView {
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      justification: r.justification,
      status: r.status,
      estimatedTotal: r.estimatedTotal,
      neededBy: isoOrNull(r.neededBy),
      project: r.project,
      requestedBy: r.requestedBy,
      createdAt: iso(r.createdAt),
      items: r.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        estimatedUnitCost: i.estimatedUnitCost,
        stockItem: i.stockItem,
      })),
      quotes: r.quotes.map((q) => ({
        id: q.id,
        vendor: q.vendor,
        amount: q.amount,
        validUntil: isoOrNull(q.validUntil),
        notes: q.notes,
        isSelected: q.isSelected,
      })),
      order: r.order,
      approval: r.approvals[0] ? this.approvals.toView(r.approvals[0], user) : null,
    };
  }

  async requests(q: PurchaseRequestListQuery, user: SessionUser): Promise<PurchaseRequestView[]> {
    const rows = await this.prisma.db.purchaseRequest.findMany({
      where: q.status ? { status: q.status } : {},
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toRequest(r, user));
  }

  async request(id: string, user: SessionUser): Promise<PurchaseRequestView> {
    const r = await this.prisma.db.purchaseRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!r) throw notFound('Purchase request');
    return this.toRequest(r, user);
  }

  private openApproval(
    tx: Db,
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
    return this.approvals.open(tx, log, {
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
    if (
      input.projectId &&
      !(await this.prisma.db.project.findUnique({ where: { id: input.projectId } }))
    ) {
      throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    const stockIds = input.items.map((i) => i.stockItemId).filter((x): x is string => !!x);
    if (stockIds.length) {
      const found = await this.prisma.db.stockItem.count({ where: { id: { in: stockIds } } });
      if (found !== new Set(stockIds).size) {
        throw unprocessable('INVALID_STOCK_ITEM', 'One of the stock items no longer exists.');
      }
    }
    const estimatedTotal = input.items.reduce((n, i) => n + i.quantity * i.estimatedUnitCost, 0);
    const id = await this.activity.transaction(async (tx, log) => {
      const number = await allocateNumber(tx, 'purchaseRequest');
      const r = await tx.purchaseRequest.create({
        data: {
          number,
          title: input.title,
          justification: input.justification,
          projectId: input.projectId ?? null,
          neededBy: input.neededBy ?? null,
          requestedById: user.id,
          status: input.submit ? 'SUBMITTED' : 'DRAFT',
          estimatedTotal,
          items: {
            create: input.items.map((i) => ({
              description: i.description,
              quantity: i.quantity,
              estimatedUnitCost: i.estimatedUnitCost,
              stockItemId: i.stockItemId ?? null,
            })),
          },
        },
      });
      await log({
        actorId: user.id,
        action: 'purchase_request.created',
        entityType: 'purchase_request',
        entityId: r.id,
        projectId: r.projectId,
        summary: `${user.name} ${input.submit ? 'raised' : 'drafted'} purchase request ${number} — ${r.title} (${rupees(estimatedTotal)})`,
      });
      if (input.submit) await this.openApproval(tx, log, r, user);
      return r.id;
    });
    return this.request(id, user);
  }

  private async ownRequest(id: string, user: SessionUser) {
    const r = await this.prisma.db.purchaseRequest.findUnique({ where: { id } });
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
    await this.activity.transaction(async (tx, log) => {
      const updated = await tx.purchaseRequest.update({
        where: { id },
        data: { status: 'SUBMITTED' },
      });
      await this.openApproval(tx, log, updated, user);
    });
    return this.request(id, user);
  }

  async cancelRequest(id: string, user: SessionUser) {
    const r = await this.ownRequest(id, user);
    await this.activity.transaction(async (tx, log) => {
      // Same lock as createOrder, so a cancel cannot race an order being issued.
      await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.purchaseRequest.findUniqueOrThrow({ where: { id } });
      if (fresh.status === 'ORDERED' || fresh.status === 'CANCELLED') {
        throw conflict('REQUEST_LOCKED', 'Ordered or cancelled requests cannot be cancelled.');
      }
      await this.approvals.cancelOpen(tx, { purchaseRequestId: id });
      await tx.purchaseRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
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
    const r = await this.prisma.db.purchaseRequest.findUnique({ where: { id } });
    if (!r) throw notFound('Purchase request');
    if (['ORDERED', 'CANCELLED', 'REJECTED'].includes(r.status)) {
      throw conflict('REQUEST_LOCKED', 'Quotations can no longer be added to this request.');
    }
    const vendor = await this.prisma.db.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor?.isActive) throw unprocessable('INVALID_VENDOR', 'Choose an active vendor.');
    if (
      await this.prisma.db.vendorQuote.findUnique({
        where: { requestId_vendorId: { requestId: id, vendorId: input.vendorId } },
      })
    ) {
      throw conflict('QUOTE_EXISTS', `${vendor.name} has already quoted on this request.`);
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.vendorQuote.create({ data: { ...input, requestId: id } });
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
    const q = await this.prisma.db.vendorQuote.findFirst({
      where: { id: quoteId, requestId: id },
      include: { vendor: true, request: true },
    });
    if (!q) throw notFound('Quotation');
    if (q.request.status === 'ORDERED')
      throw conflict('REQUEST_LOCKED', 'This request is already ordered.');
    await this.activity.transaction(async (tx, log) => {
      await tx.vendorQuote.updateMany({ where: { requestId: id }, data: { isSelected: false } });
      await tx.vendorQuote.update({ where: { id: quoteId }, data: { isSelected: true } });
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
    const rows = await this.prisma.db.purchaseOrder.findMany({
      include: orderSummaryInclude,
      orderBy: { issuedOn: 'desc' },
      take: 200,
    });
    return rows.map(toOrderSummary);
  }

  async order(id: string): Promise<PurchaseOrderDetail> {
    const o = await this.prisma.db.purchaseOrder.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!o) throw notFound('Purchase order');
    return toOrderDetail(o);
  }

  async createOrder(input: CreatePurchaseOrder, user: SessionUser): Promise<PurchaseOrderDetail> {
    const id = await this.activity.transaction(async (tx, log) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${input.requestId} FOR UPDATE`;
      const r = await tx.purchaseRequest.findUnique({
        where: { id: input.requestId },
        include: { items: true, quotes: true, order: true },
      });
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
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
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
      const approved = await tx.approvalRequest.findFirst({
        where: { purchaseRequestId: r.id, status: 'APPROVED' },
        orderBy: { decidedAt: 'desc' },
        select: { amount: true },
      });
      if (!approved || total > (approved.amount ?? 0)) {
        throw conflict(
          'OVER_APPROVED_AMOUNT',
          `The order total (₹${total.toLocaleString('en-IN')}) is above the approved ₹${(approved?.amount ?? 0).toLocaleString('en-IN')}. Cancel and raise a new request for the higher amount.`,
        );
      }
      const number = await allocateNumber(tx, 'purchaseOrder');
      const o = await tx.purchaseOrder.create({
        data: {
          number,
          requestId: r.id,
          vendorId,
          issuedOn: new Date(),
          expectedOn: input.expectedOn ?? null,
          total,
          notes: input.notes,
          createdById: user.id,
          lines: { create: lines },
        },
      });
      await tx.purchaseRequest.update({ where: { id: r.id }, data: { status: 'ORDERED' } });
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
    await this.activity.transaction(async (tx, log) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const o = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { lines: true, vendor: true, request: true, bill: true },
      });
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
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: { increment: r.quantity } },
        });
        line.receivedQty += r.quantity;
        units += r.quantity;
        if (line.stockItemId) {
          const item = await tx.stockItem.update({
            where: { id: line.stockItemId },
            data: { onHand: { increment: r.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              stockItemId: item.id,
              type: 'RECEIVED',
              quantity: r.quantity,
              balanceAfter: item.onHand,
              purchaseOrderLineId: line.id,
              projectId: o.request?.projectId ?? null,
              note: `Received on ${o.number}`,
              actorId: user.id,
            },
          });
        }
      }
      if (units === 0)
        throw unprocessable('NOTHING_RECEIVED', 'Enter at least one received quantity.');
      const status = orderStatusFromLines(o.lines);
      await tx.purchaseOrder.update({ where: { id }, data: { status } });
      await log({
        actorId: user.id,
        action: 'purchase_order.received',
        entityType: 'purchase_order',
        entityId: id,
        projectId: o.request?.projectId ?? null,
        summary: `${user.name} received ${units} unit${units === 1 ? '' : 's'} on ${o.number}${status === 'RECEIVED' ? ' — order complete' : ''}`,
      });
      if (status === 'RECEIVED' && input.createBill && !o.bill) {
        const number = await allocateNumber(tx, 'expense');
        const bill = await tx.expense.create({
          data: {
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
          },
        });
        await this.approvals.open(tx, log, {
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
    const o = await this.prisma.db.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!o) throw notFound('Purchase order');
    if (o.status !== 'ISSUED' || o.lines.some((l) => l.receivedQty > 0)) {
      throw conflict('ORDER_RECEIVING', 'Only an order with nothing received can be cancelled.');
    }
    await this.activity.transaction(async (tx, log) => {
      // Same lock as receive(): a receipt cannot land on an order being cancelled.
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });
      if (fresh.status !== 'ISSUED' || fresh.lines.some((l) => l.receivedQty > 0)) {
        throw conflict('ORDER_RECEIVING', 'Only an order with nothing received can be cancelled.');
      }
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      if (o.requestId) {
        // The approval still stands; the request can be ordered again from another vendor.
        await tx.purchaseRequest.update({
          where: { id: o.requestId },
          data: { status: 'APPROVED' },
        });
        await tx.purchaseOrder.update({ where: { id }, data: { requestId: null } });
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
