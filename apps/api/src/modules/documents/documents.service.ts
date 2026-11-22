import { Injectable } from '@nestjs/common';
import {
  openObject,
  putObject,
  RecordNotFoundError,
  removeObject,
  type Client,
  type Document,
  type DocumentVersion,
  type Expense,
  type Invoice,
  type Lead,
  type PopulateOptions,
  type Project,
  type PurchaseOrder,
  type TeamMember,
  type User,
  type Vendor,
} from '@nova/db';
import type {
  CreateDocument,
  DocumentDetail,
  DocumentListQuery,
  DocumentView,
  SessionUser,
} from '@nova/shared';
import { notFound, unprocessable } from '../../common/errors';
import { containsI } from '../../common/query';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';
import { normaliseMime, rejectReason, safeFileName, type UploadedFile } from './file-type';

type Ref<T extends { _id: string; id: string }, K extends keyof T> = Pick<T, '_id' | 'id' | K>;

const documentPopulate: PopulateOptions[] = [
  { path: 'project', select: { code: 1, title: 1 } },
  { path: 'client', select: { name: 1 } },
  { path: 'lead', select: { title: 1 } },
  { path: 'vendor', select: { name: 1 } },
  { path: 'teamMember', select: { name: 1 } },
  { path: 'invoice', select: { number: 1 } },
  { path: 'expense', select: { number: 1 } },
  { path: 'purchaseOrder', select: { number: 1 } },
  { path: 'createdBy', select: { name: 1 } },
  {
    path: 'versions',
    options: { sort: { version: -1 } },
    populate: { path: 'uploadedBy', select: { name: 1 } },
  },
];

type DocumentRow = Document & {
  project: Ref<Project, 'code' | 'title'> | null;
  client: Ref<Client, 'name'> | null;
  lead: Ref<Lead, 'title'> | null;
  vendor: Ref<Vendor, 'name'> | null;
  teamMember: Ref<TeamMember, 'name'> | null;
  invoice: Ref<Invoice, 'number'> | null;
  expense: Ref<Expense, 'number'> | null;
  purchaseOrder: Ref<PurchaseOrder, 'number'> | null;
  createdBy: Ref<User, 'name'>;
  versions: (DocumentVersion & { uploadedBy: Ref<User, 'name'> })[];
};

const named = (r: { id: string; name: string } | null) => (r ? { id: r.id, name: r.name } : null);
const numbered = (r: { id: string; number: string } | null) =>
  r ? { id: r.id, number: r.number } : null;

const toVersion = (v: DocumentRow['versions'][number]) => ({
  version: v.version,
  fileName: v.fileName,
  mimeType: v.mimeType,
  sizeBytes: v.sizeBytes,
  sha256: v.sha256,
  note: v.note,
  uploadedBy: { id: v.uploadedBy.id, name: v.uploadedBy.name },
  createdAt: iso(v.createdAt),
});

const toView = (d: DocumentRow): DocumentView => ({
  id: d.id,
  title: d.title,
  category: d.category,
  description: d.description,
  confidential: d.confidential,
  currentVersion: d.currentVersion,
  latest: d.versions[0] ? toVersion(d.versions[0]) : null,
  links: {
    project: d.project ? { id: d.project.id, code: d.project.code, title: d.project.title } : null,
    client: named(d.client),
    lead: d.lead ? { id: d.lead.id, title: d.lead.title } : null,
    vendor: named(d.vendor),
    member: named(d.teamMember),
    invoice: numbered(d.invoice),
    expense: numbered(d.expense),
    purchaseOrder: numbered(d.purchaseOrder),
  },
  createdBy: { id: d.createdBy.id, name: d.createdBy.name },
  createdAt: iso(d.createdAt),
  updatedAt: iso(d.updatedAt),
});

const LINK_KEYS = [
  'projectId',
  'clientId',
  'leadId',
  'vendorId',
  'teamMemberId',
  'invoiceId',
  'expenseId',
  'purchaseOrderId',
] as const;

/**
 * Document repository (ADR-0012). Files are stored privately (MongoDB GridFS) under random keys
 * and streamed only after a permission check; confidential documents need
 * `document:confidential`, HR documents also need `hr:read`, and finance-linked documents need
 * `finance:read`.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  /** Row-level visibility for the signed-in user (conditions to AND into every query). */
  private visibility(user: SessionUser): Record<string, unknown>[] {
    const p = user.permissions;
    return [
      p.includes('document:confidential') ? {} : { confidential: false },
      p.includes('hr:read') ? {} : { category: { $ne: 'HR' } },
      p.includes('finance:read')
        ? {}
        : { invoiceId: null, expenseId: null, category: { $nin: ['INVOICE', 'RECEIPT'] } },
    ];
  }

  async list(q: DocumentListQuery, user: SessionUser): Promise<DocumentView[]> {
    const { Document, DocumentVersion } = this.database.models;
    const links = Object.fromEntries(LINK_KEYS.filter((k) => q[k]).map((k) => [k, q[k]]));
    const search = q.q
      ? {
          $or: [
            { title: containsI(q.q) },
            { description: containsI(q.q) },
            {
              _id: {
                $in: await DocumentVersion.distinct('documentId', { fileName: containsI(q.q) }),
              },
            },
          ],
        }
      : {};
    // Every version is populated (newest first); the list shows only the latest.
    const rows = await Document.find({
      $and: [...this.visibility(user), links, q.category ? { category: q.category } : {}, search],
    })
      .sort({ updatedAt: -1 })
      .limit(200)
      .populate(documentPopulate)
      .lean<DocumentRow[]>();
    return rows.map(toView);
  }

  private async find(id: string, user: SessionUser) {
    // Hidden documents are reported as not found rather than forbidden: no existence leak.
    const d = await this.database.models.Document.findOne({
      $and: [{ _id: id }, ...this.visibility(user)],
    })
      .populate(documentPopulate)
      .lean<DocumentRow>();
    if (!d) throw notFound('Document');
    return d;
  }

  async get(id: string, user: SessionUser): Promise<DocumentDetail> {
    const d = await this.find(id, user);
    return { ...toView(d), versions: d.versions.map(toVersion) };
  }

  private async validateLinks(input: CreateDocument, user: SessionUser) {
    const m = this.database.models;
    const checks: [string | undefined, () => Promise<unknown>, string][] = [
      [input.projectId, () => m.Project.exists({ _id: input.projectId }), 'project'],
      [input.clientId, () => m.Client.exists({ _id: input.clientId }), 'client'],
      [input.leadId, () => m.Lead.exists({ _id: input.leadId }), 'lead'],
      [input.vendorId, () => m.Vendor.exists({ _id: input.vendorId }), 'vendor'],
      [input.teamMemberId, () => m.TeamMember.exists({ _id: input.teamMemberId }), 'team member'],
      [input.invoiceId, () => m.Invoice.exists({ _id: input.invoiceId }), 'invoice'],
      [input.expenseId, () => m.Expense.exists({ _id: input.expenseId }), 'expense'],
      [
        input.purchaseOrderId,
        () => m.PurchaseOrder.exists({ _id: input.purchaseOrderId }),
        'purchase order',
      ],
    ];
    for (const [id, load, label] of checks) {
      if (id && !(await load()))
        throw unprocessable('INVALID_LINK', `Choose an existing ${label}.`);
    }
    const p = user.permissions;
    if (input.confidential && !p.includes('document:confidential')) {
      throw unprocessable(
        'CANNOT_MARK_CONFIDENTIAL',
        'Your role cannot create confidential documents.',
      );
    }
    if (input.category === 'HR' && !p.includes('hr:read')) {
      throw unprocessable('HR_ONLY', 'Only HR can file HR documents.');
    }
    // Reject up front anything the uploader could not see afterwards (see visibility()).
    const financeDoc =
      input.category === 'INVOICE' ||
      input.category === 'RECEIPT' ||
      !!input.invoiceId ||
      !!input.expenseId;
    if (financeDoc && !p.includes('finance:read')) {
      throw unprocessable(
        'FINANCE_ONLY',
        'Invoices and receipts are filed by roles that can see finance.',
      );
    }
  }

  private checkFile(file: UploadedFile | undefined) {
    if (!file) throw unprocessable('FILE_REQUIRED', 'Choose a file to upload.');
    const mime = normaliseMime(file);
    const reason = rejectReason(file, mime);
    if (reason) throw unprocessable('FILE_REJECTED', reason);
    return mime;
  }

  /** Deletes a stored file whose record never committed; the original error is what matters. */
  private async discard(storageKey: string) {
    await removeObject(this.database.database, storageKey).catch(() => undefined);
  }

  async create(input: CreateDocument, file: UploadedFile | undefined, user: SessionUser) {
    const mime = this.checkFile(file);
    await this.validateLinks(input, user);
    const { Document, DocumentVersion } = this.database.models;
    // Stored before (and outside) the transaction, which MongoDB may retry.
    const stored = await putObject(this.database.database, file!.buffer, mime);
    let id: string;
    try {
      const { note, ...meta } = input;
      id = await this.activity.transaction(async (log) => {
        const d = (
          await Document.create({
            title: meta.title,
            category: meta.category,
            description: meta.description ?? null,
            ...Object.fromEntries(LINK_KEYS.map((k) => [k, meta[k] ?? null])),
            // HR documents are always confidential.
            confidential: meta.confidential || meta.category === 'HR',
            currentVersion: 1,
            createdById: user.id,
          })
        ).toObject<Document>();
        await DocumentVersion.create({
          documentId: d.id,
          version: 1,
          fileName: safeFileName(file!.originalname),
          mimeType: mime,
          note: note ?? null,
          uploadedById: user.id,
          ...stored,
        });
        await log({
          actorId: user.id,
          action: 'document.uploaded',
          entityType: 'document',
          entityId: d.id,
          projectId: d.projectId,
          summary: `${user.name} uploaded “${d.title}” (${d.category.toLowerCase()})${d.confidential ? ' — confidential' : ''}`,
        });
        return d.id;
      });
    } catch (error) {
      await this.discard(stored.storageKey); // no orphaned files on failure
      throw error;
    }
    return this.get(id, user);
  }

  async addVersion(
    id: string,
    note: string | undefined,
    file: UploadedFile | undefined,
    user: SessionUser,
  ) {
    const doc = await this.find(id, user);
    const mime = this.checkFile(file);
    const { Document, DocumentVersion } = this.database.models;
    const stored = await putObject(this.database.database, file!.buffer, mime);
    try {
      await this.activity.transaction(async (log) => {
        // Serialises concurrent uploads so version numbers stay unique and gapless.
        await this.database.lock('Document', id);
        const current = await Document.findById(id).lean<Document>();
        if (!current) throw new RecordNotFoundError('Document');
        const version = current.currentVersion + 1;
        await DocumentVersion.create({
          documentId: id,
          version,
          fileName: safeFileName(file!.originalname),
          mimeType: mime,
          note: note ?? null,
          uploadedById: user.id,
          ...stored,
        });
        await Document.updateOne({ _id: id }, { $set: { currentVersion: version } });
        await log({
          actorId: user.id,
          action: 'document.versioned',
          entityType: 'document',
          entityId: id,
          projectId: doc.projectId,
          summary: `${user.name} uploaded version ${version} of “${doc.title}”${note ? `: ${note}` : ''}`,
        });
      });
    } catch (error) {
      await this.discard(stored.storageKey);
      throw error;
    }
    return this.get(id, user);
  }

  /** Resolves a version to a readable stream after the same visibility check as reading it. */
  async open(id: string, version: number, user: SessionUser) {
    await this.find(id, user);
    const v = await this.database.models.DocumentVersion.findOne({
      documentId: id,
      version,
    }).lean<DocumentVersion>();
    if (!v) throw notFound('Document version');
    const stream = await openObject(this.database.database, v.storageKey);
    if (!stream) throw notFound('Stored file');
    return {
      stream,
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
    };
  }
}
