'use client';

import {
  CREATIVE_KIND_LABELS,
  CREATIVE_KINDS,
  SCRIPT_STATUS_LABELS,
  type BreakdownResult,
  type CreativeKind,
  type ScriptDetail,
  type ScriptStatus,
} from '@nova/shared';
import { ArrowLeft, Check, FileUp, ListTree, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Tone } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import {
  Honesty,
  ReadinessList,
  Tabs,
  dayLabel,
  fieldErrors,
  minutes,
  useAttentionTarget,
} from '@/features/studio/ui';
import { api } from '@/lib/api';
import { ago, date } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useProject, useProjects, useReadiness, useScript, useScripts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { SceneDialog } from './scene-dialog';

export const scriptTone: Record<ScriptStatus, Tone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'attention',
  CHANGES_REQUESTED: 'critical',
  APPROVED: 'signal',
  REJECTED: 'critical',
};

/** Creative documents with versions and approvals, the scene breakdown, and pre-production readiness. */
export function ScriptsLens() {
  const [tab, setTab] = useState<'docs' | 'pre'>('docs');
  const [projectId, setProjectId] = useState('');
  const projects = useProjects({ status: 'ACTIVE' });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-2">
          Project
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-0.5 w-64 max-w-full"
          >
            <option value="">All active projects</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.title}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <Tabs
        label="Scripts sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'docs', label: 'Scripts & documents' },
          { value: 'pre', label: 'Pre-production readiness' },
        ]}
      />
      {tab === 'docs' ? (
        <Documents key={projectId} projectId={projectId} />
      ) : (
        <PreProduction projectId={projectId} setProjectId={setProjectId} />
      )}
    </div>
  );
}

function Documents({ projectId }: { projectId: string }) {
  const canWrite = useCan('project:write') || false;
  const canDoc = useCan('document:write');
  const [status, setStatus] = useState<ScriptStatus | ''>('');
  const [kind, setKind] = useState<CreativeKind | ''>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useScripts({
    projectId: projectId || undefined,
    status: status || undefined,
    kind: kind || undefined,
  });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className={cn('flex flex-col gap-2', selected && 'hidden lg:flex')}>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as CreativeKind | '')}
            className="w-36"
          >
            <option value="">All types</option>
            {CREATIVE_KINDS.map((k) => (
              <option key={k} value={k}>
                {CREATIVE_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ScriptStatus | '')}
            className="w-40"
          >
            <option value="">Any status</option>
            {Object.entries(SCRIPT_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          {canWrite || canDoc ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New
            </Button>
          ) : null}
        </div>
        <Panel bodyClassName="px-0 pb-1">
          <PanelState
            query={list}
            isEmpty={!list.data?.length}
            empty={{ title: 'No documents yet.', body: 'Write or upload a brief or script.' }}
          >
            <ul className="divide-y divide-line/60">
              {(list.data ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-surface-2',
                      selected === s.id && 'bg-surface-2',
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">{s.title}</span>
                      <Badge tone={scriptTone[s.status]}>{SCRIPT_STATUS_LABELS[s.status]}</Badge>
                    </span>
                    <span className="truncate text-2xs text-text-3">
                      {CREATIVE_KIND_LABELS[s.kind]} · v{s.currentVersion} · {s.project.code}{' '}
                      {s.project.title}
                      {s.sceneCount ? ` · ${s.sceneCount} scenes` : ''}
                    </span>
                    {s.waitingDays !== null ? (
                      <span
                        className={cn(
                          'text-2xs',
                          s.waitingDays > 2 ? 'text-attention' : 'text-text-3',
                        )}
                      >
                        Waiting {s.waitingDays} day(s) for review
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </PanelState>
        </Panel>
      </div>
      <div className={cn(!selected && 'hidden lg:block')}>
        {selected ? (
          <ScriptPane
            id={selected}
            onBack={() => setSelected(null)}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <Panel>
            <p className="py-10 text-center text-sm text-text-3">
              Choose a document to read, edit, review or break down.
            </p>
          </Panel>
        )}
      </div>
      {creating ? (
        <NewScriptDialog
          open={creating}
          onOpenChange={setCreating}
          projectId={projectId}
          onCreated={setSelected}
        />
      ) : null}
    </div>
  );
}

/** Reads a text file chosen by the user (scripts are plain text: .txt, .fountain, .md). */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 1_000_000) return reject(new Error('Use a text file under 1 MB.'));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsText(file);
  });
}

function NewScriptDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onCreated: (id: string) => void;
}) {
  const projects = useProjects({ status: 'ACTIVE' });
  const [v, setV] = useState({
    projectId,
    kind: 'SCRIPT',
    title: '',
    body: '',
    fileName: '',
    clientInstructions: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState('');
  const create = useApiMutation<typeof v, ScriptDetail>('POST', '/scripts', {
    success: (s) => `“${s.title}” created`,
    onSuccess: (s) => {
      onOpenChange(false);
      onCreated(s.id);
    },
    onError: (e) => {
      const f = fieldErrors(e);
      setErrors(f);
      return Object.keys(f).length > 0;
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New creative document"
      description="Write it here or upload a text file (.txt, .fountain, .md)."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate(v)}>
            Create
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Project" error={errors.projectId}>
          {(p) => (
            <Select
              {...p}
              value={v.projectId}
              onChange={(e) => setV({ ...v, projectId: e.target.value })}
            >
              <option value="">Choose…</option>
              {(projects.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Type" error={errors.kind}>
          {(p) => (
            <Select {...p} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
              {CREATIVE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CREATIVE_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Title" error={errors.title} className="sm:col-span-2">
          {(p) => (
            <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          )}
        </Field>
        <div className="sm:col-span-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-2">
            <FileUp className="size-4" /> Upload text file
            <input
              type="file"
              accept=".txt,.fountain,.md,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const text = await readTextFile(f);
                  setV((x) => ({
                    ...x,
                    body: text,
                    fileName: f.name,
                    title: x.title || f.name.replace(/\.[^.]+$/, ''),
                  }));
                  setFileError('');
                } catch (err) {
                  setFileError(err instanceof Error ? err.message : 'Could not read the file.');
                }
              }}
            />
          </label>
          {v.fileName ? <span className="ml-2 text-xs text-text-3">{v.fileName}</span> : null}
          {fileError ? <p className="text-xs text-critical">{fileError}</p> : null}
          <p className="text-2xs text-text-3">
            PDF and Word files go to Documents; paste their text here to break them down.
          </p>
        </div>
        <Field label="Text" error={errors.body} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              rows={10}
              className="font-mono text-xs"
              value={v.body}
              onChange={(e) => setV({ ...v, body: e.target.value })}
              placeholder={'1. INT. KITCHEN - NIGHT\nMEERA (30) pours tea.\n\nMEERA\nAnother day.'}
            />
          )}
        </Field>
        <Field
          label="Client instructions"
          error={errors.clientInstructions}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={v.clientInstructions}
              onChange={(e) => setV({ ...v, clientInstructions: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

type PaneTab = 'text' | 'versions' | 'breakdown' | 'notes';

function ScriptPane({
  id,
  onBack,
  onDeleted,
}: {
  id: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const q = useScript(id);
  return (
    <PanelState query={q} skeleton="block">
      {q.data ? <ScriptBody s={q.data} onBack={onBack} onDeleted={onDeleted} /> : null}
    </PanelState>
  );
}

function ScriptBody({
  s,
  onBack,
  onDeleted,
}: {
  s: ScriptDetail;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const canPM = useCan('project:write');
  const canDoc = useCan('document:write');
  const canWrite = canPM || canDoc;
  const canDecide = useCan('approval:decide');
  const inspect = useWorkspace((st) => st.inspect);
  const [tab, setTab] = useState<PaneTab>('text');
  const [deciding, setDeciding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submit = useApiMutation<Record<string, never>>('POST', `/scripts/${s.id}/submit`, {
    success: 'Sent for review — a client message was prepared',
  });
  const remove = useApiMutation<void>('DELETE', `/scripts/${s.id}`, {
    success: 'Draft deleted',
    onSuccess: onDeleted,
  });

  return (
    <Panel>
      <div className="flex flex-col gap-2 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text lg:hidden"
        >
          <ArrowLeft className="size-3" /> All documents
        </button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              className="font-mono text-[10px] text-text-3 hover:text-text"
              onClick={() => inspect({ type: 'project', id: s.project.id })}
            >
              {s.project.code} · {s.project.title} · {s.project.clientName}
            </button>
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="text-xs text-text-3">
              {CREATIVE_KIND_LABELS[s.kind]} · v{s.currentVersion} · by {s.createdBy} · updated{' '}
              {ago(s.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={scriptTone[s.status]}>{SCRIPT_STATUS_LABELS[s.status]}</Badge>
            {canWrite &&
            (s.status === 'DRAFT' ||
              s.status === 'CHANGES_REQUESTED' ||
              s.status === 'REJECTED') ? (
              <Button
                size="sm"
                variant="primary"
                loading={submit.isPending}
                onClick={() => submit.mutate({})}
              >
                <Send /> Send for review
              </Button>
            ) : null}
            {canDecide && s.status === 'IN_REVIEW' ? (
              <Button size="sm" variant="primary" onClick={() => setDeciding(true)}>
                <Check /> Record decision
              </Button>
            ) : null}
            {canWrite && s.status !== 'APPROVED' && s.status !== 'IN_REVIEW' ? (
              confirmDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => remove.mutate()}
                  onBlur={() => setConfirmDelete(false)}
                >
                  <Trash2 /> Delete permanently
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Delete draft"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                </Button>
              )
            ) : null}
          </div>
        </div>
        {s.decisionNote || s.decidedBy ? (
          <p
            className={cn(
              'rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs',
              s.status === 'APPROVED'
                ? 'border-signal-line bg-signal-soft text-signal'
                : 'border-critical-line bg-critical-soft text-critical',
            )}
          >
            {SCRIPT_STATUS_LABELS[s.status]} by {s.decidedBy}
            {s.decidedAt ? ` on ${date(s.decidedAt)}` : ''}
            {s.decisionNote ? ` — “${s.decisionNote}”` : ''}
          </p>
        ) : null}
        {s.clientInstructions ? (
          <p className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-1.5 text-xs">
            <span className="font-medium">Client instructions: </span>
            {s.clientInstructions}
          </p>
        ) : null}
        <Tabs<PaneTab>
          label="Document sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'text', label: 'Text' },
            { value: 'versions', label: 'Versions', badge: s.versions.length },
            { value: 'breakdown', label: 'Scene breakdown', badge: s.scenes.length },
            { value: 'notes', label: 'Notes' },
          ]}
        />
        {tab === 'text' ? <TextTab key={s.currentVersion} s={s} canWrite={canWrite} /> : null}
        {tab === 'versions' ? <VersionsTab s={s} /> : null}
        {tab === 'breakdown' ? <BreakdownTab s={s} canWrite={canWrite} /> : null}
        {tab === 'notes' ? <NotesTab s={s} canWrite={canWrite} /> : null}
      </div>
      <DecisionDialog s={s} open={deciding} onOpenChange={setDeciding} />
    </Panel>
  );
}

function TextTab({ s, canWrite }: { s: ScriptDetail; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(s.body);
  const [note, setNote] = useState('');
  const [fileName, setFileName] = useState('');
  const save = useApiMutation<{ body: string; changeNote: string; fileName: string }>(
    'POST',
    `/scripts/${s.id}/versions`,
    {
      success: 'New version saved',
      onSuccess: () => {
        setEditing(false);
        setNote('');
        setFileName('');
      },
    },
  );
  if (!editing)
    return (
      <div>
        {canWrite && s.status !== 'IN_REVIEW' ? (
          <div className="mb-2 flex justify-end">
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit (new version)
            </Button>
          </div>
        ) : s.status === 'IN_REVIEW' ? (
          <p className="mb-2 text-xs text-text-3">
            With the client for review — record their decision before editing.
          </p>
        ) : null}
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 font-mono text-xs leading-5">
          {s.body}
        </pre>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {s.status === 'APPROVED' ? (
        <Honesty tone="attention">
          Saving a new version reopens this document: the approval covered v{s.currentVersion} only.
        </Honesty>
      ) : null}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-2">
        <FileUp className="size-4" /> Replace with uploaded text
        <input
          type="file"
          accept=".txt,.fountain,.md,text/plain"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBody(await readTextFile(f));
            setFileName(f.name);
          }}
        />
      </label>
      <Textarea
        aria-label="Script text"
        rows={16}
        className="font-mono text-xs"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Input
        aria-label="What changed"
        placeholder="What changed in this version?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setBody(s.body);
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!body.trim() || body === s.body}
          loading={save.isPending}
          onClick={() => save.mutate({ body, changeNote: note, fileName })}
        >
          Save v{s.currentVersion + 1}
        </Button>
      </div>
    </div>
  );
}

function VersionsTab({ s }: { s: ScriptDetail }) {
  const [open, setOpen] = useState<number | null>(null);
  const version = useQuery({
    queryKey: ['script-version', s.id, open],
    queryFn: () => api<{ body: string }>(`/scripts/${s.id}/versions/${open}`),
    enabled: open !== null,
  });
  const text = version.data?.body ?? '';
  const error = version.error instanceof Error ? version.error.message : '';
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-line/60">
        {s.versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="w-10 font-mono">v{v.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block">
                {v.changeNote ?? 'No note'}
                {v.number === s.currentVersion ? (
                  <Badge className="ml-2" tone="info">
                    Current
                  </Badge>
                ) : null}
              </span>
              <span className="block text-2xs text-text-3">
                {v.author} · {date(v.createdAt)} · {v.words} words
                {v.fileName ? ` · ${v.fileName}` : ''}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(open === v.number ? null : v.number)}
            >
              {open === v.number ? 'Hide' : 'Read'}
            </Button>
          </li>
        ))}
      </ul>
      {open !== null ? (
        error ? (
          <p className="text-sm text-critical">{error}</p>
        ) : (
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 font-mono text-xs">
            {text || 'Loading…'}
          </pre>
        )
      ) : null}
    </div>
  );
}

function BreakdownTab({ s, canWrite }: { s: ScriptDetail; canWrite: boolean }) {
  const project = useProject(s.project.id);
  const [preview, setPreview] = useState<BreakdownResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [replace, setReplace] = useState(false);
  const [editing, setEditing] = useState<string | null | 'new'>(null);
  const run = useApiMutation<void, BreakdownResult>('POST', `/scripts/${s.id}/breakdown`, {
    onSuccess: (r) => {
      setPreview(r);
      setPicked(new Set(r.scenes.map((_, i) => i)));
    },
  });
  const apply = useApiMutation<{ scenes: BreakdownResult['scenes']; replace: boolean }>(
    'POST',
    `/scripts/${s.id}/breakdown/apply`,
    {
      success: (_r, b) => `${b.scenes.length} scene(s) added`,
      onSuccess: () => setPreview(null),
    },
  );
  const removeScene = useApiMutation<{ id: string }>('DELETE', ({ id }) => `/scenes/${id}`, {
    success: 'Scene removed',
  });
  const shoots = project.data?.shoots ?? [];
  const scene = editing && editing !== 'new' ? s.scenes.find((x) => x.id === editing) : null;

  return (
    <div className="flex flex-col gap-3">
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button loading={run.isPending} onClick={() => run.mutate()}>
            <ListTree /> Run rule-based breakdown
          </Button>
          <Button variant="ghost" onClick={() => setEditing('new')}>
            <Plus /> Add scene by hand
          </Button>
        </div>
      ) : null}
      {preview ? (
        <div className="rounded-[var(--radius-md)] border border-info-line p-3">
          <Honesty>{preview.limitations}</Honesty>
          {preview.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-attention">
              {w}
            </p>
          ))}
          <ul className="mt-2 flex flex-col gap-1">
            {preview.scenes.map((sc, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={`Include scene ${sc.number}`}
                  checked={picked.has(i)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(i);
                    else n.delete(i);
                    setPicked(n);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs">{sc.number}</span> {sc.heading}
                  <span className="block text-2xs text-text-3">
                    {sc.characters.join(', ') || 'no characters'} · props:{' '}
                    {sc.props.join(', ') || '—'} · {sc.equipment.join(', ') || 'no special kit'} ·{' '}
                    {minutes(sc.estimatedMinutes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-text-2">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />{' '}
              Replace earlier rule-based scenes that are not scheduled
            </label>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setPreview(null)}>
              <X /> Discard
            </Button>
            <Button
              variant="primary"
              disabled={!picked.size}
              loading={apply.isPending}
              onClick={() =>
                apply.mutate({ scenes: preview.scenes.filter((_, i) => picked.has(i)), replace })
              }
            >
              Add {picked.size} scene(s)
            </Button>
          </div>
        </div>
      ) : null}
      {s.scenes.length === 0 ? (
        <p className="text-sm text-text-3">
          No scenes yet. Run the breakdown or add scenes by hand.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left">
                {['#', 'Scene', 'Cast', 'Props / kit', 'Time', 'Scheduled', ''].map((h) => (
                  <th key={h} scope="col" className="eyebrow px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.scenes.map((sc) => (
                <tr key={sc.id} className="border-t border-line/60 align-top">
                  <td className="px-2 py-2 font-mono text-xs">{sc.number}</td>
                  <td className="px-2 py-2">
                    <span className="block">{sc.heading}</span>
                    <span className="block text-2xs text-text-3">
                      {sc.location ?? 'No location'}
                      {sc.requirements ? ` · ${sc.requirements}` : ''}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs">{sc.characters.join(', ') || '—'}</td>
                  <td className="px-2 py-2 text-xs text-text-2">
                    {[...sc.props, ...sc.equipment].slice(0, 5).join(', ') || '—'}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{minutes(sc.estimatedMinutes)}</td>
                  <td className="px-2 py-2 text-xs">
                    {sc.shoot ? (
                      <>
                        <span className="block">{sc.shoot.title}</span>
                        <span className="text-2xs text-text-3">
                          {sc.shootDate ? dayLabel(sc.shootDate.slice(0, 10)) : ''}
                          {sc.plannedStart ? ` ${sc.plannedStart}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-attention">Not scheduled</span>
                    )}
                    <Badge
                      className="ml-1"
                      tone={
                        sc.status === 'SHOT'
                          ? 'signal'
                          : sc.status === 'DROPPED'
                            ? 'neutral'
                            : sc.status === 'SCHEDULED'
                              ? 'info'
                              : 'attention'
                      }
                    >
                      {sc.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {canWrite ? (
                      <span className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Edit scene ${sc.number}`}
                          onClick={() => setEditing(sc.id)}
                        >
                          <Pencil />
                        </Button>
                        {sc.status !== 'SHOT' ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove scene ${sc.number}`}
                            onClick={() => removeScene.mutate({ id: sc.id })}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SceneDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        projectId={s.project.id}
        scriptId={s.id}
        scene={scene}
        shoots={shoots}
      />
    </div>
  );
}

function NotesTab({ s, canWrite }: { s: ScriptDetail; canWrite: boolean }) {
  const [instructions, setInstructions] = useState(s.clientInstructions ?? '');
  const [notes, setNotes] = useState(s.notes ?? '');
  const save = useApiMutation<{ clientInstructions: string; notes: string }>(
    'PATCH',
    `/scripts/${s.id}`,
    { success: 'Notes saved' },
  );
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-text-2">
        Client instructions
        <Textarea
          className="mt-1"
          disabled={!canWrite}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="text-xs text-text-2">
        Internal notes
        <Textarea
          className="mt-1"
          disabled={!canWrite}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {canWrite ? (
        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate({ clientInstructions: instructions, notes })}
          >
            Save notes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DecisionDialog({
  s,
  open,
  onOpenChange,
}: {
  s: ScriptDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [status, setStatus] = useState<'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'>('APPROVED');
  const [note, setNote] = useState('');
  const [by, setBy] = useState('');
  const decide = useApiMutation<{ status: string; note: string; decidedBy: string }>(
    'POST',
    `/scripts/${s.id}/decision`,
    {
      success: (_r, b) =>
        b.status === 'APPROVED'
          ? 'Script approved'
          : b.status === 'REJECTED'
            ? 'Script rejected'
            : 'Changes requested',
      onSuccess: () => {
        onOpenChange(false);
        setNote('');
      },
    },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Decision on v${s.currentVersion}`}
      description="Record the client’s (or creative lead’s) decision on this version."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={decide.isPending}
            disabled={status !== 'APPROVED' && !note.trim()}
            onClick={() => decide.mutate({ status, note, decidedBy: by })}
          >
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          aria-label="Decision"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="APPROVED">Approved</option>
          <option value="CHANGES_REQUESTED">Changes requested</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <label className="text-xs text-text-2">
          Decided by (leave empty for yourself)
          <Input
            className="mt-1"
            value={by}
            onChange={(e) => setBy(e.target.value)}
            placeholder="e.g. client contact name"
          />
        </label>
        <label className="text-xs text-text-2">
          {status === 'APPROVED' ? 'Note (optional)' : 'What needs to change (required)'}
          <Textarea className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

function PreProduction({
  projectId,
  setProjectId,
}: {
  projectId: string;
  setProjectId: (id: string) => void;
}) {
  const projects = useProjects({ status: 'ACTIVE' });
  const first = (projects.data ?? []).find(
    (p) => p.stage && ['BRIEF', 'PRE_PRODUCTION', 'SHOOT'].includes(p.stage.key),
  );
  const id = projectId || first?.id || null;
  const q = useReadiness(id);
  const go = useAttentionTarget();
  const openShootDay = useWorkspace((s) => s.openShootDay);
  return (
    <PanelState query={q} skeleton="block" isEmpty={!id} empty={{ title: 'Choose a project.' }}>
      {q.data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Panel
            eyebrow={`${q.data.project.code} · ${q.data.project.clientName}`}
            title={`${q.data.project.title} — ${q.data.score}% ready`}
          >
            {!projectId ? (
              <p className="mb-2 text-xs text-text-3">
                Showing the first project in pre-production.{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setProjectId(q.data!.project.id)}
                >
                  Pin it
                </button>{' '}
                or choose another above.
              </p>
            ) : null}
            <ReadinessList
              items={q.data.items}
              onItem={(k) => go(q.data!.items.find((i) => i.key === k)?.target ?? null)}
            />
          </Panel>
          <Panel title="Shoots" eyebrow="Readiness per shoot">
            {q.data.shoots.length === 0 ? (
              <p className="text-sm text-text-2">No shoot scheduled yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {q.data.shoots.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-left hover:border-line-strong"
                      onClick={() => openShootDay(s.id)}
                    >
                      <span className="flex justify-between gap-2 text-sm">
                        <span className="truncate">{s.title}</span>
                        <span
                          className={cn(
                            'font-mono text-xs',
                            s.readinessScore >= 90
                              ? 'text-signal'
                              : s.readinessScore >= 60
                                ? 'text-attention'
                                : 'text-critical',
                          )}
                        >
                          {s.readinessScore}%
                        </span>
                      </span>
                      <span className="block text-2xs text-text-3">
                        {date(s.startsAt)} · {s.status.toLowerCase()} ·{' '}
                        {s.canConfirm ? 'can be confirmed' : 'blocked from confirmation'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </PanelState>
  );
}
