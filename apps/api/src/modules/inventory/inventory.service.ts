import { Injectable } from '@nestjs/common';
import {
  RecordNotFoundError,
  StockCategory,
  type Asset,
  type AssetBooking,
  type AssetMaintenance,
  type PopulateOptions,
  type Project,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
  type Shoot,
  type StockItem,
  type StockMovement,
  type TeamMember,
  type User,
  type Vendor,
} from '@nova/db';
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
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';

type ItemRow = StockItem & {
  orderLines: Pick<PurchaseOrderLine, '_id' | 'id' | 'stockItemId' | 'quantity' | 'receivedQty'>[];
};

/** Open order lines only: what is on order but not yet received. */
const OPEN_ORDER_STATUSES: PurchaseOrderStatus[] = ['ISSUED', 'PARTIALLY_RECEIVED'];

/** Former Postgres enum order of StockCategory (enums sorted by declaration, not by name). */
const CATEGORY_ORDER: readonly string[] = Object.values(StockCategory);

const byCategoryThenName = (a: StockItem, b: StockItem) =>
  CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

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

type MovementRow = StockMovement & {
  project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  purchaseOrderLine:
    | (Pick<PurchaseOrderLine, '_id' | 'id' | 'orderId'> & {
        order: Pick<PurchaseOrder, '_id' | 'id' | 'number'> | null;
      })
    | null;
  actor: Pick<User, '_id' | 'id' | 'name'> | null;
};

type AssetRow = Asset & {
  custodian: Pick<TeamMember, '_id' | 'id' | 'name'> | null;
  maintenance: (AssetMaintenance & { vendor: Pick<Vendor, '_id' | 'id' | 'name'> | null })[];
  bookings: (AssetBooking & {
    shoot: Pick<Shoot, '_id' | 'id' | 'title'> | null;
    project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  })[];
};

/** Consumable stock with an append-only movement ledger, and equipment condition/maintenance. */
@Injectable()
export class InventoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Stock items with their open purchase-order lines (for `onOrder`). */
  private async loadItems(filter: Record<string, unknown>): Promise<ItemRow[]> {
    const { StockItem, PurchaseOrder } = this.database.models;
    const openOrderIds = await PurchaseOrder.distinct('_id', {
      status: { $in: OPEN_ORDER_STATUSES },
    });
    const populate: PopulateOptions = {
      path: 'orderLines',
      match: { orderId: { $in: openOrderIds } },
      select: { stockItemId: 1, quantity: 1, receivedQty: 1 },
    };
    return StockItem.find(filter).populate(populate).lean<ItemRow[]>();
  }

  async items(): Promise<StockItemView[]> {
    const rows = await this.loadItems({});
    return rows.sort(byCategoryThenName).map(toItem);
  }

  async item(id: string): Promise<StockItemDetail> {
    const [i] = await this.loadItems({ _id: id });
    if (!i) throw notFound('Stock item');
    const movements = await this.database.models.StockMovement.find({ stockItemId: id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .populate([
        { path: 'project', select: { code: 1, title: 1 } },
        {
          path: 'purchaseOrderLine',
          select: { orderId: 1 },
          populate: { path: 'order', select: { number: 1 } },
        },
        { path: 'actor', select: { name: 1 } },
      ])
      .lean<MovementRow[]>();
    return {
      ...toItem(i),
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        project: m.project
          ? { id: m.project.id, code: m.project.code, title: m.project.title }
          : null,
        purchaseOrder: m.purchaseOrderLine?.order
          ? { id: m.purchaseOrderLine.order.id, number: m.purchaseOrderLine.order.number }
          : null,
        note: m.note,
        actor: m.actor ? { id: m.actor.id, name: m.actor.name } : null,
        createdAt: iso(m.createdAt),
      })),
    };
  }

  async create(input: CreateStockItem, user: SessionUser): Promise<StockItemDetail> {
    const { StockItem, StockMovement } = this.database.models;
    if (await StockItem.exists({ sku: input.sku })) {
      throw conflict('SKU_EXISTS', 'A stock item with this SKU already exists.');
    }
    const id = await this.activity.transaction(async (log) => {
      const item = (
        await StockItem.create({ ...input, notes: input.notes ?? null })
      ).toObject<StockItem>();
      if (input.onHand > 0) {
        await StockMovement.create({
          stockItemId: item.id,
          type: 'ADJUSTED',
          quantity: input.onHand,
          balanceAfter: input.onHand,
          note: 'Opening count',
          actorId: user.id,
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
    const { StockItem } = this.database.models;
    const item = await StockItem.findById(id).lean<StockItem>();
    if (!item) throw notFound('Stock item');
    await this.activity.transaction(async (log) => {
      const res = await StockItem.updateOne({ _id: id }, { $set: input });
      if (res.matchedCount === 0) throw new RecordNotFoundError('StockItem');
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
   * Issues, returns or recounts stock. The item is locked first, so concurrent movements are
   * serialised: the balance cannot be driven below zero and every movement's balanceAfter
   * matches the item's on-hand count at that point in the ledger.
   */
  async move(id: string, input: StockMovementRequest, user: SessionUser): Promise<StockItemDetail> {
    const { StockItem, StockMovement, Project } = this.database.models;
    await this.activity.transaction(async (log) => {
      await this.database.lock('StockItem', id);
      const item = await StockItem.findById(id).lean<StockItem>();
      if (!item) throw notFound('Stock item');
      const projectId = input.type === 'ADJUSTED' ? null : (input.projectId ?? null);
      if (projectId && !(await Project.exists({ _id: projectId }))) {
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
      await StockItem.updateOne({ _id: id }, { $set: { onHand: balance } });
      await StockMovement.create({
        stockItemId: id,
        type: input.type,
        quantity: delta,
        balanceAfter: balance,
        projectId,
        note: input.note ?? null,
        actorId: user.id,
      });
      const crossedLow = item.onHand > item.reorderLevel && balance <= item.reorderLevel;
      if (crossedLow) {
        await this.notifications.notifyPermission(
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
    const a = await this.database.models.Asset.findById(id)
      .populate([
        { path: 'custodian', select: { name: 1 } },
        {
          path: 'maintenance',
          options: { sort: { startedOn: -1 } },
          populate: { path: 'vendor', select: { name: 1 } },
        },
        {
          path: 'bookings',
          match: { endsAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } },
          options: { sort: { startsAt: 1 } },
          populate: [
            { path: 'shoot', select: { title: 1 } },
            { path: 'project', select: { code: 1, title: 1 } },
          ],
        },
      ])
      .lean<AssetRow>();
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
      custodian: a.custodian ? { id: a.custodian.id, name: a.custodian.name } : null,
      maintenance: a.maintenance.map((m) => ({
        id: m.id,
        kind: m.kind,
        description: m.description,
        cost: m.cost,
        vendor: m.vendor ? { id: m.vendor.id, name: m.vendor.name } : null,
        startedOn: iso(m.startedOn),
        completedOn: isoOrNull(m.completedOn),
      })),
      bookings: a.bookings.map((b) => ({
        id: b.id,
        startsAt: iso(b.startsAt),
        endsAt: iso(b.endsAt),
        shoot: b.shoot ? { id: b.shoot.id, title: b.shoot.title } : null,
        project: b.project
          ? { id: b.project.id, code: b.project.code, title: b.project.title }
          : null,
      })),
    };
  }

  async updateAsset(
    id: string,
    input: UpdateAssetDetails,
    user: SessionUser,
  ): Promise<AssetDetail> {
    const { Asset, TeamMember } = this.database.models;
    const a = await Asset.findById(id).lean<Asset>();
    if (!a) throw notFound('Asset');
    let custodianName: string | null = null;
    if (input.custodianId) {
      const m = await TeamMember.findById(input.custodianId).lean<TeamMember>();
      if (!m) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
      custodianName = m.name;
    }
    await this.activity.transaction(async (log) => {
      const res = await Asset.updateOne({ _id: id }, { $set: input });
      if (res.matchedCount === 0) throw new RecordNotFoundError('Asset');
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
    const { Asset, Vendor, AssetMaintenance } = this.database.models;
    const a = await Asset.findById(id).lean<Asset>();
    if (!a) throw notFound('Asset');
    if (input.vendorId && !(await Vendor.exists({ _id: input.vendorId }))) {
      throw unprocessable('INVALID_VENDOR', 'Choose an existing vendor.');
    }
    await this.activity.transaction(async (log) => {
      await AssetMaintenance.create({
        assetId: id,
        kind: input.kind,
        description: input.description,
        cost: input.cost ?? null,
        vendorId: input.vendorId ?? null,
        startedOn: input.startedOn,
        completedOn: input.completedOn ?? null,
      });
      // A retired asset stays retired whatever work is logged against it.
      if (input.takeOutOfService && !input.completedOn && a.status !== 'RETIRED') {
        const res = await Asset.updateOne({ _id: id }, { $set: { status: 'MAINTENANCE' } });
        if (res.matchedCount === 0) throw new RecordNotFoundError('Asset');
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
    const { Asset, AssetMaintenance } = this.database.models;
    const m = await AssetMaintenance.findOne({ _id: maintenanceId, assetId: id })
      .populate('asset')
      .lean<AssetMaintenance & { asset: Asset }>();
    if (!m) throw notFound('Maintenance record');
    if (m.completedOn) throw conflict('ALREADY_COMPLETE', 'This work is already complete.');
    await this.activity.transaction(async (log) => {
      const res = await AssetMaintenance.updateOne(
        { _id: maintenanceId },
        { $set: { completedOn: new Date() } },
      );
      if (res.matchedCount === 0) throw new RecordNotFoundError('AssetMaintenance');
      const stillOpen = await AssetMaintenance.countDocuments({
        assetId: id,
        completedOn: null,
        _id: { $ne: maintenanceId },
      });
      if (!stillOpen && m.asset.status === 'MAINTENANCE') {
        const updated = await Asset.updateOne({ _id: id }, { $set: { status: 'AVAILABLE' } });
        if (updated.matchedCount === 0) throw new RecordNotFoundError('Asset');
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
