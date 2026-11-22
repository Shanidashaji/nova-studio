/**
 * MongoDB access for NOVA (Mongoose). One `Database` per process: the API creates it at boot,
 * the Vercel function caches it across invocations, tests create one per suite.
 *
 * Transactions: `db.transaction(fn)` runs `fn` in a MongoDB transaction. Mongoose's
 * `transactionAsyncLocalStorage` is on, so every model call inside `fn` joins the transaction
 * without passing a session around. `fn` can run more than once (MongoDB retries transient
 * conflicts), so keep side effects such as emitting events outside of it.
 */
import mongoose, { type ClientSession, type Connection, type Model } from 'mongoose';
import { FOREIGN_KEYS, MODEL_NAMES, type ModelName } from './models/relations';
import { SCHEMAS } from './models/schemas';
import { leanIds } from './models/plugins';
import { COLLECTION_VALIDATORS } from './models/validators';
import type * as T from './models/types';

mongoose.set('transactionAsyncLocalStorage', true);
mongoose.set('strictQuery', true);
// Prisma accepted '' for a required string; keep that (only null/undefined count as missing).
mongoose.Schema.Types.String.checkRequired((v: unknown) => v !== null && v !== undefined);

let pluginsApplied = false;
function applyPlugins(): void {
  if (pluginsApplied) return;
  for (const schema of Object.values(SCHEMAS)) leanIds(schema as mongoose.Schema);
  pluginsApplied = true;
}

/** Typed model for every collection, keyed by the former Prisma model name. */
export type Models = {
  User: Model<T.User>;
  Session: Model<T.Session>;
  Role: Model<T.Role>;
  Permission: Model<T.Permission>;
  RolePermission: Model<T.RolePermission>;
  TeamMember: Model<T.TeamMember>;
  ProjectMember: Model<T.ProjectMember>;
  Client: Model<T.Client>;
  ClientContact: Model<T.ClientContact>;
  ClientInteraction: Model<T.ClientInteraction>;
  Lead: Model<T.Lead>;
  WorkflowTemplate: Model<T.WorkflowTemplate>;
  StageDefinition: Model<T.StageDefinition>;
  Project: Model<T.Project>;
  ProjectStage: Model<T.ProjectStage>;
  StageTransition: Model<T.StageTransition>;
  Task: Model<T.Task>;
  TaskDependency: Model<T.TaskDependency>;
  Deliverable: Model<T.Deliverable>;
  RevisionRound: Model<T.RevisionRound>;
  FeedbackItem: Model<T.FeedbackItem>;
  Approval: Model<T.Approval>;
  Shoot: Model<T.Shoot>;
  CrewCall: Model<T.CrewCall>;
  Asset: Model<T.Asset>;
  AssetMaintenance: Model<T.AssetMaintenance>;
  AssetBooking: Model<T.AssetBooking>;
  FinancialRecord: Model<T.FinancialRecord>;
  ActivityLog: Model<T.ActivityLog>;
  Notification: Model<T.Notification>;
  AssistantInteraction: Model<T.AssistantInteraction>;
  AssistantAction: Model<T.AssistantAction>;
  NotificationPreference: Model<T.NotificationPreference>;
  Milestone: Model<T.Milestone>;
  ProjectRisk: Model<T.ProjectRisk>;
  Department: Model<T.Department>;
  EmployeeRecord: Model<T.EmployeeRecord>;
  LeaveRequest: Model<T.LeaveRequest>;
  AttendanceRecord: Model<T.AttendanceRecord>;
  Vendor: Model<T.Vendor>;
  ApprovalRule: Model<T.ApprovalRule>;
  ApprovalRequest: Model<T.ApprovalRequest>;
  ApprovalStep: Model<T.ApprovalStep>;
  Expense: Model<T.Expense>;
  Invoice: Model<T.Invoice>;
  InvoiceLine: Model<T.InvoiceLine>;
  Payment: Model<T.Payment>;
  PurchaseRequest: Model<T.PurchaseRequest>;
  PurchaseRequestItem: Model<T.PurchaseRequestItem>;
  VendorQuote: Model<T.VendorQuote>;
  PurchaseOrder: Model<T.PurchaseOrder>;
  PurchaseOrderLine: Model<T.PurchaseOrderLine>;
  StockItem: Model<T.StockItem>;
  StockMovement: Model<T.StockMovement>;
  Studio: Model<T.Studio>;
  StudioBooking: Model<T.StudioBooking>;
  Document: Model<T.Document>;
  DocumentVersion: Model<T.DocumentVersion>;
};

/** Thrown when a write targets a record that does not exist (HTTP 404). */
export class RecordNotFoundError extends Error {
  override readonly name = 'RecordNotFoundError';
  constructor(readonly model: string) {
    super(`${model} not found.`);
  }
}

/** Thrown when a delete is blocked by records that still reference the target (HTTP 409). */
export class ReferenceConflictError extends Error {
  override readonly name = 'ReferenceConflictError';
  constructor(
    readonly model: string,
    readonly referencedBy: string,
  ) {
    super(`${model} is still referenced by ${referencedBy}.`);
  }
}

/** True for a unique-index violation (MongoDB E11000), the former Prisma P2002. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: unknown }).code === 11000 || (error as { code?: unknown }).code === 11001)
  );
}

export interface Database {
  readonly connection: Connection;
  readonly models: Models;
  /** Runs `fn` in a transaction (retried on transient conflicts) and returns its result. */
  transaction<R>(fn: (session: ClientSession) => Promise<R>): Promise<R>;
  /**
   * Row lock for read-modify-write inside a transaction (the former `SELECT … FOR UPDATE`):
   * writes to the document so a concurrent transaction touching it conflicts and is retried.
   * Returns false when the document does not exist.
   */
  lock(model: ModelName, id: string): Promise<boolean>;
  /** Next value of a named counter, never lower than `floor + 1`. Atomic. */
  nextSequence(name: string, floor?: number): Promise<number>;
  /**
   * Deletes the matching records and applies each foreign key's former `onDelete` rule:
   * Cascade deletes dependants, SetNull clears the reference, Restrict refuses (throws
   * ReferenceConflictError). Run inside `transaction()` so a refusal leaves nothing half-done.
   * Returns how many records of `model` were deleted.
   */
  deleteCascade(model: ModelName, filter: Record<string, unknown>): Promise<number>;
  /** Creates every collection, index and validator (idempotent). */
  syncIndexes(): Promise<void>;
  /** Drops every collection's documents (seed and tests only). */
  wipe(): Promise<void>;
  close(): Promise<void>;
}

const COUNTERS = 'counters';

export interface ConnectOptions {
  /** Database name; defaults to the one in the connection string. */
  dbName?: string;
  /** Max sockets per process. Serverless functions should stay small. */
  maxPoolSize?: number;
}

/** Connects to MongoDB and registers every model. */
export async function connectDatabase(
  uri = process.env.DATABASE_URL,
  options: ConnectOptions = {},
): Promise<Database> {
  if (!uri) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  applyPlugins();
  const connection = mongoose.createConnection(uri, {
    dbName: options.dbName,
    maxPoolSize: options.maxPoolSize ?? 10,
    serverSelectionTimeoutMS: 10_000,
    // Indexes are created by `pnpm db:setup` / seed, never implicitly on a production boot.
    autoIndex: false,
    autoCreate: false,
  });
  await connection.asPromise();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry, typed via Models below
  const models = {} as Record<ModelName, Model<any>>;
  for (const name of MODEL_NAMES) {
    models[name] = connection.model(name, SCHEMAS[name] as mongoose.Schema);
  }
  const typed = models as unknown as Models;
  const counters = connection.collection<{ _id: string; value: number }>(COUNTERS);

  const db: Database = {
    connection,
    models: typed,
    transaction: (fn) => connection.transaction(fn),
    async lock(model, id) {
      const res = await models[model].updateOne({ _id: id }, { $inc: { _lock: 1 } }, {
        strict: false,
        skipTouch: true,
      } as Record<string, unknown>);
      return res.matchedCount > 0;
    },
    async nextSequence(name, floor = 0) {
      const session = currentSession(connection);
      const doc = await counters.findOneAndUpdate(
        { _id: name },
        [{ $set: { value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, floor] }, 1] } } }],
        { upsert: true, returnDocument: 'after', session },
      );
      return doc!.value;
    },
    async deleteCascade(model, filter) {
      return deleteWithRules(typed, model, filter);
    },
    async syncIndexes() {
      for (const name of MODEL_NAMES) {
        await models[name].createCollection().catch(ignoreExists);
        await models[name].syncIndexes();
        const validator = COLLECTION_VALIDATORS[name];
        if (validator) {
          await connection.db!.command({
            collMod: models[name].collection.collectionName,
            validator,
            validationLevel: 'strict',
            validationAction: 'error',
          });
        }
      }
      await connection.createCollection(COUNTERS).catch(ignoreExists);
    },
    async wipe() {
      const cols = await connection.db!.listCollections({}, { nameOnly: true }).toArray();
      for (const c of cols) {
        if (!c.name.startsWith('system.')) await connection.db!.collection(c.name).deleteMany({});
      }
    },
    close: () => connection.close(),
  };
  return db;
}

function ignoreExists(error: unknown): void {
  if ((error as { codeName?: string }).codeName === 'NamespaceExists') return;
  throw error;
}

/** The session of the transaction running in this async context, if any. */
function currentSession(connection: Connection): ClientSession | undefined {
  const store = (
    connection.base as unknown as {
      transactionAsyncLocalStorage?: { getStore(): { session?: ClientSession } | undefined };
    }
  ).transactionAsyncLocalStorage?.getStore();
  return store?.session;
}

async function deleteWithRules(
  models: Models,
  model: ModelName,
  filter: Record<string, unknown>,
): Promise<number> {
  const m = models[model] as unknown as Model<{ _id: string }>;
  const ids = (await m.find(filter, { _id: 1 }).lean()).map((d) => d._id);
  if (ids.length === 0) return 0;
  for (const fk of FOREIGN_KEYS.filter((k) => k.target === model)) {
    const ref = models[fk.model] as unknown as Model<{ _id: string }>;
    const where = { [fk.field]: { $in: ids } };
    if (fk.onDelete === 'Restrict') {
      if (await ref.exists(where)) throw new ReferenceConflictError(model, fk.model);
    } else if (fk.onDelete === 'SetNull') {
      await ref.updateMany(where, { $set: { [fk.field]: null } });
    } else {
      await deleteWithRules(models, fk.model, where);
    }
  }
  const res = await m.deleteMany({ _id: { $in: ids } });
  return res.deletedCount;
}
