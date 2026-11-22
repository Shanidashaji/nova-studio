import fs from 'node:fs';
import { Injectable } from '@nestjs/common';
import { putObject, removeObject, resolveStorageDir, storagePath, type Prisma } from '@nova/db';
import type {
  CreateDocument,
  DocumentDetail,
  DocumentListQuery,
  DocumentView,
  SessionUser,
} from '@nova/shared';
import { notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';
import { normaliseMime, rejectReason, safeFileName, type UploadedFile } from './file-type';

const versionInclude = { uploadedBy: { select: { id: true, name: true } } } as const;

const documentInclude = {
  project: { select: { id: true, code: true, title: true } },
  client: { select: { id: true, name: true } },
  lead: { select: { id: true, title: true } },
  vendor: { select: { id: true, name: true } },
  teamMember: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true } },
  expense: { select: { id: true, number: true } },
  purchaseOrder: { select: { id: true, number: true } },
  createdBy: { select: { id: true, name: true } },
  versions: { orderBy: { version: 'desc' }, include: versionInclude },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

const toVersion = (v: DocumentRow['versions'][number]) => ({
  version: v.version,
  fileName: v.fileName,
  mimeType: v.mimeType,
  sizeBytes: v.sizeBytes,
  sha256: v.sha256,
  note: v.note,
  uploadedBy: v.uploadedBy,
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
    project: d.project,
    client: d.client,
    lead: d.lead,
    vendor: d.vendor,
    member: d.teamMember,
    invoice: d.invoice,
    expense: d.expense,
    purchaseOrder: d.purchaseOrder,
  },
  createdBy: d.createdBy,
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
 * Document repository (ADR-0012). Files are stored privately under random keys and streamed only
 * after a permission check; confidential documents need `document:confidential`, HR documents
 * also need `hr:read`, and finance-linked documents need `finance:read`.
 */
@Injectable()
export class DocumentsService {
  private readonly dir = resolveStorageDir();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Row-level visibility for the signed-in user. */
  private visibility(user: SessionUser): Prisma.DocumentWhereInput {
    const p = user.permissions;
    return {
      AND: [
        p.includes('document:confidential') ? {} : { confidential: false },
        p.includes('hr:read') ? {} : { category: { not: 'HR' } },
        p.includes('finance:read')
          ? {}
          : { invoiceId: null, expenseId: null, category: { notIn: ['INVOICE', 'RECEIPT'] } },
      ],
    };
  }

  async list(q: DocumentListQuery, user: SessionUser): Promise<DocumentView[]> {
    const links = Object.fromEntries(LINK_KEYS.filter((k) => q[k]).map((k) => [k, q[k]]));
    const rows = await this.prisma.db.document.findMany({
      where: {
        AND: [
          this.visibility(user),
          links,
          q.category ? { category: q.category } : {},
          q.q
            ? {
                OR: [
                  { title: { contains: q.q, mode: 'insensitive' } },
                  { description: { contains: q.q, mode: 'insensitive' } },
                  { versions: { some: { fileName: { contains: q.q, mode: 'insensitive' } } } },
                ],
              }
            : {},
        ],
      },
      include: { ...documentInclude, versions: { ...documentInclude.versions, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map(toView);
  }

  private async find(id: string, user: SessionUser) {
    // Hidden documents are reported as not found rather than forbidden: no existence leak.
    const d = await this.prisma.db.document.findFirst({
      where: { AND: [{ id }, this.visibility(user)] },
      include: documentInclude,
    });
    if (!d) throw notFound('Document');
    return d;
  }

  async get(id: string, user: SessionUser): Promise<DocumentDetail> {
    const d = await this.find(id, user);
    return { ...toView(d), versions: d.versions.map(toVersion) };
  }

  private async validateLinks(input: CreateDocument, user: SessionUser) {
    const checks: [string | undefined, () => Promise<unknown>, string][] = [
      [
        input.projectId,
        () => this.prisma.db.project.findUnique({ where: { id: input.projectId } }),
        'project',
      ],
      [
        input.clientId,
        () => this.prisma.db.client.findUnique({ where: { id: input.clientId } }),
        'client',
      ],
      [input.leadId, () => this.prisma.db.lead.findUnique({ where: { id: input.leadId } }), 'lead'],
      [
        input.vendorId,
        () => this.prisma.db.vendor.findUnique({ where: { id: input.vendorId } }),
        'vendor',
      ],
      [
        input.teamMemberId,
        () => this.prisma.db.teamMember.findUnique({ where: { id: input.teamMemberId } }),
        'team member',
      ],
      [
        input.invoiceId,
        () => this.prisma.db.invoice.findUnique({ where: { id: input.invoiceId } }),
        'invoice',
      ],
      [
        input.expenseId,
        () => this.prisma.db.expense.findUnique({ where: { id: input.expenseId } }),
        'expense',
      ],
      [
        input.purchaseOrderId,
        () => this.prisma.db.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } }),
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

  async create(input: CreateDocument, file: UploadedFile | undefined, user: SessionUser) {
    const mime = this.checkFile(file);
    await this.validateLinks(input, user);
    const stored = await putObject(this.dir, file!.buffer);
    try {
      const { note, ...meta } = input;
      const id = await this.activity.transaction(async (tx, log) => {
        const d = await tx.document.create({
          data: {
            ...meta,
            // HR documents are always confidential.
            confidential: meta.confidential || meta.category === 'HR',
            currentVersion: 1,
            createdById: user.id,
            versions: {
              create: {
                version: 1,
                fileName: safeFileName(file!.originalname),
                mimeType: mime,
                note,
                uploadedById: user.id,
                ...stored,
              },
            },
          },
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
      return this.get(id, user);
    } catch (error) {
      await removeObject(this.dir, stored.storageKey); // no orphaned files on failure
      throw error;
    }
  }

  async addVersion(
    id: string,
    note: string | undefined,
    file: UploadedFile | undefined,
    user: SessionUser,
  ) {
    const doc = await this.find(id, user);
    const mime = this.checkFile(file);
    const stored = await putObject(this.dir, file!.buffer);
    try {
      await this.activity.transaction(async (tx, log) => {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`;
        const current = await tx.document.findUniqueOrThrow({ where: { id } });
        const version = current.currentVersion + 1;
        await tx.documentVersion.create({
          data: {
            documentId: id,
            version,
            fileName: safeFileName(file!.originalname),
            mimeType: mime,
            note,
            uploadedById: user.id,
            ...stored,
          },
        });
        await tx.document.update({ where: { id }, data: { currentVersion: version } });
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
      await removeObject(this.dir, stored.storageKey);
      throw error;
    }
    return this.get(id, user);
  }

  /** Resolves a version to a readable stream after the same visibility check as reading it. */
  async open(id: string, version: number, user: SessionUser) {
    await this.find(id, user);
    const v = await this.prisma.db.documentVersion.findUnique({
      where: { documentId_version: { documentId: id, version } },
    });
    if (!v) throw notFound('Document version');
    const file = storagePath(this.dir, v.storageKey);
    if (!fs.existsSync(file)) throw notFound('Stored file');
    return {
      stream: fs.createReadStream(file),
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
    };
  }
}
