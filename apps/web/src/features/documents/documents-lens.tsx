'use client';

import { DOCUMENT_CATEGORIES, DOCUMENT_MAX_BYTES, type DocumentView } from '@nova/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Lock, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { ago, titleCase } from '@/lib/format';
import { useDocuments, useProjects } from '@/lib/queries';

const size = (b: number) =>
  b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

/**
 * Document repository (ADR-0012). Files never come from a public path: each download streams
 * through the API after a permission check. Confidential documents are invisible without access.
 */
export function DocumentsLens() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const docs = useDocuments({ q: q || undefined, category: category || undefined });
  const canWrite = useCan('document:write');
  const [uploading, setUploading] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" className="w-64">
          {(p) => (
            <Input
              {...p}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title or file name"
            />
          )}
        </Field>
        <Field label="Category" className="w-48">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canWrite ? (
          <Button className="ml-auto" onClick={() => setUploading(true)}>
            <Upload /> Upload
          </Button>
        ) : null}
      </div>

      <Panel eyebrow="Repository" title="Documents" bodyClassName="px-0">
        <PanelState
          query={docs}
          isEmpty={!docs.data?.length}
          empty={{ title: 'No documents match.' }}
        >
          <ul className="divide-y divide-line/60">
            {(docs.data ?? []).map((d) => (
              <DocumentRow key={d.id} d={d} />
            ))}
          </ul>
        </PanelState>
      </Panel>
      <UploadDialog open={uploading} onOpenChange={setUploading} />
    </div>
  );
}

function DocumentRow({ d }: { d: DocumentView }) {
  const link =
    d.links.project?.code ??
    d.links.client?.name ??
    d.links.vendor?.name ??
    d.links.member?.name ??
    d.links.purchaseOrder?.number ??
    null;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {d.confidential ? (
            <Lock className="size-3.5 text-attention" aria-label="Confidential" />
          ) : null}
          {d.title}
        </p>
        <p className="truncate text-xs text-text-3">
          {d.latest
            ? `${d.latest.fileName} · ${size(d.latest.sizeBytes)} · v${d.currentVersion}`
            : 'No file'}
          {link ? ` · ${link}` : ''} · {d.createdBy.name} · {ago(d.updatedAt)}
        </p>
      </div>
      <Badge>{titleCase(d.category)}</Badge>
      {d.latest ? (
        <Button asChild size="sm" variant="ghost">
          <a href={`/api/v1/documents/${d.id}/versions/${d.currentVersion}/file`} download>
            <Download /> Download
          </a>
        </Button>
      ) : null}
    </li>
  );
}

function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const projects = useProjects({ status: 'ALL' });
  const canConfidential = useCan('document:confidential');
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('BRIEF');
  const [projectId, setProjectId] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Choose a file to upload.');
    if (file.size > DOCUMENT_MAX_BYTES) return toast.error('Files can be at most 20 MB.');
    const form = new FormData();
    form.set('title', title);
    form.set('category', category);
    if (projectId) form.set('projectId', projectId);
    form.set('confidential', String(confidential));
    form.set('file', file);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/documents', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? `Upload failed (${res.status}).`);
      toast.success(`“${title}” uploaded`);
      await qc.invalidateQueries({ queryKey: ['documents'] });
      setTitle('');
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a document"
      description="PDF, images, text, CSV or Office files up to 20 MB. Stored privately; the file type is checked against its contents."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!title} onClick={() => void submit()}>
            Upload
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Category">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Project (optional)">
          {(p) => (
            <Select {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {(projects.data ?? []).map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.code} · {pr.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="File" className="sm:col-span-2">
          {(p) => <input {...p} ref={fileRef} type="file" className="text-sm" />}
        </Field>
        {canConfidential ? (
          <div className="sm:col-span-2">
            <Checkbox
              label="Confidential — only roles with confidential access can see it"
              checked={confidential}
              onChange={(e) => setConfidential(e.target.checked)}
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
