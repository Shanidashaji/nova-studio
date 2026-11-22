import { Injectable } from '@nestjs/common';
import type { Prisma } from '@nova/db';
import {
  stockLevel,
  type AssetDetail,
  type CreateStockItem,
  type LogMaintenance,
  type SessionUser,
  type StockItemDetail,
  type StockItemView,
  type StockMovementRequest,
  type UpdateAssetDetails,
  type UpdateStockItem,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const itemInclude = {
  orderLines: {
    where: { order: { status: { in: ['ISSUED', 'PARTIALLY_RECEIVED'] } } },
    select: { quantity: true, receivedQty: true },
  },
} satisfies Prisma.StockItemInclude;

type ItemRow = Prisma.StockItemGetPayload<{ include: typeof itemInclude }>;

const toItem = (i: ItemRow): StockItemView => ({
  id: i.id,
  sku: i.sku,
  name: i.name,
  category: i.category,
  unit: i.unit,
  onHand: i.onHand,
  reorderLevel: i.reorderLevel,
  level: stockLevel(i.onHand, i.reorderLevel),
  location: i.location,
  unitCost: i.unitCost,
  notes: i.notes,
  onOrder: i.orderLines.reduce((n, l) => n + (l.quantity - l.receivedQty), 0),
});

/** Consumable stock with an append-only movement ledger, and equipment condition/maintenance. */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async items(): Promise<StockItemView[]> {
    const rows = await this.prisma.db.stockItem.findMany({
      include: itemInclude,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toItem);
  }

  async item(id: string): Promise<StockItemDetail> {
    const i = await this.prisma.db.stockItem.findUnique({ where: { id }, include: itemInclude });
    if (!i) throw notFound('Stock item');
    const movements = await this.prisma.db.stockMovement.findMany({
      where: { stockItemId: id },
      include: {
        project: { select: { id: true, code: true, title: true } },
        purchaseOrderLine: { select: { order: { select: { id: true, number: true } } } },
        actor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      ...toItem(i),
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        project: m.project,
        purchaseOrder: m.purchaseOrderLine?.order ?? null,
        note: m.note,
        actor: m.actor,
        createdAt: iso(m.createdAt),
      })),
    };
  }

  async create(input: CreateStockItem, user: SessionUser): Promise<StockItemDetail> {
    if (await this.prisma.db.stockItem.findUnique({ where: { sku: input.sku } })) {
      throw conflict('SKU_EXISTS', 'A stock item with this SKU already exists.');
    }
    const id = await this.activity.transaction(async (tx, log) => {
      const item = await tx.stockItem.create({ data: input });
      if (input.onHand > 0) {
        await tx.stockMovement.create({
          data: {
            stockItemId: item.id,
            type: 'ADJUSTED',
            quantity: input.onHand,
            balanceAfter: input.onHand,
            note: 'Opening count',
            actorId: user.id,
          },
        });
      }
      await log({
        actorId: user.id,
        action: 'stock.created',
        entityType: 'stock',
        entityId: item.id,
        summary: `${user.name} added stock item ${item.sku} — ${item.name} (${item.onHand} ${item.unit})`,
      });
      return item.id;
    });
    return this.item(id);
  }

  async update(id: string, input: UpdateStockItem, user: SessionUser): Promise<StockItemDetail> {
    const item = await this.prisma.db.stockItem.findUnique({ where: { id } });
    if (!item) throw notFound('Stock item');
    await this.activity.transaction(async (tx, log) => {
      await tx.stockItem.update({ where: { id }, data: input });
      await log({
        actorId: user.id,
        action: 'stock.updated',
        entityType: 'stock',
        entityId: id,
        summary: `${user.name} updated stock item ${item.sku}`,
      });
    });
    return this.item(id);
  }

  /**
   * Issues, returns or recounts stock. The row is locked so concurrent issues cannot drive the
   * balance below zero (a CHECK constraint backs this up).
   */
  async move(id: string, input: StockMovementRequest, user: SessionUser): Promise<StockItemDetail> {
    await this.activity.transaction(async (tx, log) => {
      await tx.$queryRaw`SELECT id FROM "StockItem" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.stockItem.findUnique({ where: { id } });
      if (!item) throw notFound('Stock item');
      const projectId = input.type === 'ADJUSTED' ? null : (input.projectId ?? null);
      if (projectId && !(await tx.project.findUnique({ where: { id: projectId } }))) {
        throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
      }
      const delta =
        input.type === 'ISSUED'
          ? -input.quantity
          : input.type === 'RETURNED'
            ? input.quantity
            : input.countedOnHand - item.onHand;
      const balance = item.onHand + delta;
      if (balance < 0) {
        throw unprocessable(
          'INSUFFICIENT_STOCK',
          `Only ${item.onHand} ${item.unit} of ${item.name} on hand.`,
        );
      }
      if (delta === 0 && input.type === 'ADJUSTED') {
        throw unprocessable('NO_CHANGE', 'The count matches the current balance.');
      }
      await tx.stockItem.update({ where: { id }, data: { onHand: balance } });
      await tx.stockMovement.create({
        data: {
          stockItemId: id,
          type: input.type,
          quantity: delta,
          balanceAfter: balance,
          projectId,
          note: input.note,
          actorId: user.id,
        },
      });
      const crossedLow = item.onHand > item.reorderLevel && balance <= item.reorderLevel;
      if (crossedLow) {
        await this.notifications.notifyPermission(
          tx,
          'procurement:request',
          {
            kind: 'stock.low',
            title: balance === 0 ? `${item.name} is out of stock` : `${item.name} is low`,
            body: `${balance} ${item.unit} left (reorder at ${item.reorderLevel})`,
            entityType: 'stock',
            entityId: id,
          },
          user.id,
        );
      }
      const verb =
        input.type === 'ISSUED' ? 'issued' : input.type === 'RETURNED' ? 'returned' : 'recounted';
      await log({
        actorId: user.id,
        action: `stock.${input.type.toLowerCase()}`,
        entityType: 'stock',
        entityId: id,
        projectId,
        summary:
          input.type === 'ADJUSTED'
            ? `${user.name} recounted ${item.name}: ${item.onHand} → ${balance} (${input.note})`
            : `${user.name} ${verb} ${Math.abs(delta)} ${item.unit} of ${item.name} — ${balance} left`,
      });
    });
    return this.item(id);
  }

  // ── Equipment details ─────────────────────────────────────────────────────

  async asset(id: string): Promise<AssetDetail> {
    const a = await this.prisma.db.asset.findUnique({
      where: { id },
      include: {
        custodian: { select: { id: true, name: true } },
        maintenance: {
          orderBy: { startedOn: 'desc' },
          include: { vendor: { select: { id: true, name: true } } },
        },
        bookings: {
          where: { endsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
          orderBy: { startsAt: 'asc' },
          include: {
            shoot: { select: { id: true, title: true } },
            project: { select: { id: true, code: true, title: true } },
          },
        },
      },
    });
    if (!a) throw notFound('Asset');
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      serialTag: a.serialTag,
      homeLocation: a.homeLocation,
      status: a.status,
      condition: a.condition,
      dailyRate: a.dailyRate,
      purchasedOn: isoOrNull(a.purchasedOn),
      purchaseCost: a.purchaseCost,
      notes: a.notes,
      custodian: a.custodian,
      maintenance: a.maintenance.map((m) => ({
        id: m.id,
        kind: m.kind,
        description: m.description,
        cost: m.cost,
        vendor: m.vendor,
        startedOn: iso(m.startedOn),
        completedOn: isoOrNull(m.completedOn),
      })),
      bookings: a.bookings.map((b) => ({
        id: b.id,
        startsAt: iso(b.startsAt),
        endsAt: iso(b.endsAt),
        shoot: b.shoot,
        project: b.project,
      })),
    };
  }

  async updateAsset(
    id: string,
    input: UpdateAssetDetails,
    user: SessionUser,
  ): Promise<AssetDetail> {
    const a = await this.prisma.db.asset.findUnique({ where: { id } });
    if (!a) throw notFound('Asset');
    let custodianName: string | null = null;
    if (input.custodianId) {
      const m = await this.prisma.db.teamMember.findUnique({ where: { id: input.custodianId } });
      if (!m) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
      custodianName = m.name;
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.asset.update({ where: { id }, data: input });
      const parts = [
        input.condition && input.condition !== a.condition
          ? `condition ${a.condition.toLowerCase()} → ${input.condition.toLowerCase().replace('_', ' ')}`
          : null,
        input.custodianId !== undefined
          ? input.custodianId
            ? `custody to ${custodianName}`
            : 'returned to the store'
          : null,
      ].filter(Boolean);
      await log({
        actorId: user.id,
        action: 'asset.updated',
        entityType: 'asset',
        entityId: id,
        summary: `${user.name} updated ${a.name}${parts.length ? `: ${parts.join(', ')}` : ''}`,
      });
    });
    return this.asset(id);
  }

  async logMaintenance(id: string, input: LogMaintenance, user: SessionUser): Promise<AssetDetail> {
    const a = await this.prisma.db.asset.findUnique({ where: { id } });
    if (!a) throw notFound('Asset');
    if (
      input.vendorId &&
      !(await this.prisma.db.vendor.findUnique({ where: { id: input.vendorId } }))
    ) {
      throw unprocessable('INVALID_VENDOR', 'Choose an existing vendor.');
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.assetMaintenance.create({
        data: {
          assetId: id,
          kind: input.kind,
          description: input.description,
          cost: input.cost ?? null,
          vendorId: input.vendorId ?? null,
          startedOn: input.startedOn,
          completedOn: input.completedOn ?? null,
        },
      });
      // A retired asset stays retired whatever work is logged against it.
      if (input.takeOutOfService && !input.completedOn && a.status !== 'RETIRED') {
        await tx.asset.update({ where: { id }, data: { status: 'MAINTENANCE' } });
      }
      await log({
        actorId: user.id,
        action: 'asset.maintenance',
        entityType: 'asset',
        entityId: id,
        summary: `${user.name} logged ${input.kind.toLowerCase()} for ${a.name}: ${input.description}`,
      });
    });
    return this.asset(id);
  }

  async completeMaintenance(id: string, maintenanceId: string, user: SessionUser) {
    const m = await this.prisma.db.assetMaintenance.findFirst({
      where: { id: maintenanceId, assetId: id },
      include: { asset: true },
    });
    if (!m) throw notFound('Maintenance record');
    if (m.completedOn) throw conflict('ALREADY_COMPLETE', 'This work is already complete.');
    await this.activity.transaction(async (tx, log) => {
      await tx.assetMaintenance.update({
        where: { id: maintenanceId },
        data: { completedOn: new Date() },
      });
      const stillOpen = await tx.assetMaintenance.count({
        where: { assetId: id, completedOn: null, id: { not: maintenanceId } },
      });
      if (!stillOpen && m.asset.status === 'MAINTENANCE') {
        await tx.asset.update({ where: { id }, data: { status: 'AVAILABLE' } });
      }
      await log({
        actorId: user.id,
        action: 'asset.maintenance_done',
        entityType: 'asset',
        entityId: id,
        summary: `${user.name} completed ${m.kind.toLowerCase()} on ${m.asset.name}${!stillOpen ? ' — back in service' : ''}`,
      });
    });
    return this.asset(id);
  }
}
