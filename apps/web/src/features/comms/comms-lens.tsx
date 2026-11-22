'use client';

import {
  AUTOMATION_MODE_LABELS,
  AUTOMATION_MODES,
  MESSAGE_STATUS_LABELS,
  MESSAGE_TRIGGER_LABELS,
  TEMPLATE_VARIABLES,
  type MessageStatus,
  type MessageTemplateView,
  type MessageView,
} from '@nova/shared';
import { Bot, Mail, MessageCircle, PenLine, Plus, Send, X } from 'lucide-react';
import { useState } from 'react';
import type { Tone } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { Honesty, Stat, StatRow, Tabs, fieldErrors } from '@/features/studio/ui';
import { api } from '@/lib/api';
import { ago, dateTime } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useClients, useCommunications, useProjects, useTemplates } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const messageTone: Record<MessageStatus, Tone> = {
  DRAFT: 'attention',
  QUEUED: 'info',
  SIMULATED: 'ai',
  SENT: 'signal',
  FAILED: 'critical',
  CANCELLED: 'neutral',
};

/** Client communication: automated drafts to review, the send queue, history and templates. */
export function CommsLens() {
  const [tab, setTab] = useState<'messages' | 'templates'>('messages');
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        label="Communication"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'messages', label: 'Messages' },
          { value: 'templates', label: 'Templates & automation' },
        ]}
      />
      {tab === 'messages' ? <Messages /> : <Templates />}
    </div>
  );
}

function Messages() {
  const [status, setStatus] = useState<MessageStatus | ''>('');
  const [clientId, setClientId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const clients = useClients();
  const canWrite = useCan('client:write');
  const q = useCommunications({ status: status || undefined, clientId: clientId || undefined });
  const message = q.data?.messages.find((m) => m.id === selected) ?? null;
  return (
    <>
      {q.data ? (
        <>
          <StatRow>
            {(['DRAFT', 'QUEUED', 'SENT', 'SIMULATED', 'FAILED', 'CANCELLED'] as const).map((s) => (
              <Stat
                key={s}
                label={MESSAGE_STATUS_LABELS[s]}
                value={q.data!.counts[s]}
                tone={q.data!.counts[s] ? messageTone[s] : 'neutral'}
                onClick={() => setStatus(s)}
              />
            ))}
          </StatRow>
          <Honesty tone={q.data.delivery.email.ready ? 'info' : 'attention'}>
            <strong>Email:</strong> {q.data.delivery.email.note} <strong>WhatsApp:</strong>{' '}
            {q.data.delivery.whatsapp.note}
          </Honesty>
        </>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MessageStatus | '')}
          className="w-48"
        >
          <option value="">All statuses</option>
          {Object.entries(MESSAGE_STATUS_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-48"
        >
          <option value="">All clients</option>
          {(clients.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {canWrite ? (
          <Button variant="primary" className="ml-auto" onClick={() => setComposing(true)}>
            <Plus /> New message
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel bodyClassName="px-0 pb-1" className={cn(selected && 'hidden lg:flex')}>
          <PanelState
            query={q}
            isEmpty={!q.data?.messages.length}
            empty={{
              title: 'No messages.',
              body: 'Automation prepares messages as projects and shoots move.',
            }}
          >
            <ul className="divide-y divide-line/60">
              {(q.data?.messages ?? []).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-surface-2',
                      selected === m.id && 'bg-surface-2',
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        {m.channel === 'EMAIL' ? (
                          <Mail className="size-3.5 shrink-0 text-text-3" aria-label="Email" />
                        ) : (
                          <MessageCircle
                            className="size-3.5 shrink-0 text-text-3"
                            aria-label="WhatsApp"
                          />
                        )}
                        <span className="truncate">{m.subject}</span>
                      </span>
                      <Badge tone={messageTone[m.status]}>{MESSAGE_STATUS_LABELS[m.status]}</Badge>
                    </span>
                    <span className="truncate text-2xs text-text-3">
                      {MESSAGE_TRIGGER_LABELS[m.trigger]} · {m.client.name}
                      {m.project ? ` · ${m.project.title}` : ''} ·{' '}
                      {m.automated ? 'automation' : m.createdBy} · {ago(m.createdAt)}
                    </span>
                    {m.unfilled.length ? (
                      <span className="text-2xs text-attention">
                        Fill {m.unfilled.map((u) => `[${u}]`).join(', ')} before sending
                      </span>
                    ) : null}
                    {m.scheduledFor && m.status !== 'SENT' && m.status !== 'SIMULATED' ? (
                      <span className="text-2xs text-info">
                        Scheduled {dateTime(m.scheduledFor)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </PanelState>
        </Panel>
        <div className={cn(!selected && 'hidden lg:block')}>
          {message ? (
            <MessagePane
              key={`${message.id}:${message.updatedAt}`}
              m={message}
              canWrite={canWrite}
              onClose={() => setSelected(null)}
            />
          ) : (
            <Panel>
              <p className="py-10 text-center text-sm text-text-3">
                Choose a message to preview, edit and send.
              </p>
            </Panel>
          )}
        </div>
      </div>
      {composing ? (
        <ComposeDialog open={composing} onOpenChange={setComposing} onCreated={setSelected} />
      ) : null}
    </>
  );
}

function MessagePane({
  m,
  canWrite,
  onClose,
}: {
  m: MessageView;
  canWrite: boolean;
  onClose: () => void;
}) {
  const open = m.status === 'DRAFT' || m.status === 'QUEUED';
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({
    subject: m.subject,
    body: m.body,
    recipientName: m.recipientName,
    recipientAddress: m.recipientAddress ?? '',
    scheduledFor: m.scheduledFor?.slice(0, 16) ?? '',
  });
  const save = useApiMutation<typeof v>('PATCH', `/communications/${m.id}`, {
    transform: (b) => ({
      ...b,
      scheduledFor: b.scheduledFor ? new Date(b.scheduledFor).toISOString() : null,
    }),
    success: 'Draft saved',
    onSuccess: () => setEditing(false),
  });
  const send = useApiMutation<void, MessageView>('POST', `/communications/${m.id}/send`, {
    success: (r) =>
      r.status === 'SENT'
        ? 'Sent'
        : r.status === 'SIMULATED'
          ? 'Recorded as simulated — no provider configured, nothing was sent'
          : r.status === 'QUEUED'
            ? 'Queued for its send time'
            : r.status === 'FAILED'
              ? null
              : 'Done',
  });
  const cancel = useApiMutation<void>('POST', `/communications/${m.id}/cancel`, {
    success: 'Message cancelled',
  });
  return (
    <Panel
      eyebrow={`${MESSAGE_TRIGGER_LABELS[m.trigger]} · ${m.channel === 'EMAIL' ? 'Email' : 'WhatsApp'}`}
      title={m.subject}
      action={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close"
          className="lg:hidden"
          onClick={onClose}
        >
          <X />
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-2">
          <Badge tone={messageTone[m.status]}>{MESSAGE_STATUS_LABELS[m.status]}</Badge>
          <span>
            To {m.recipientName}
            {m.recipientAddress ? ` <${m.recipientAddress}>` : ' (no address on file)'}
          </span>
        </div>
        {m.statusNote ? (
          <p className={cn('text-xs', m.status === 'FAILED' ? 'text-critical' : 'text-text-3')}>
            {m.statusNote}
          </p>
        ) : null}
        {m.sentAt ? (
          <p className="text-2xs text-text-3">
            {m.status === 'SIMULATED' ? 'Simulated' : 'Sent'} {dateTime(m.sentAt)}
            {m.reviewedBy ? ` · approved by ${m.reviewedBy}` : ''}
          </p>
        ) : null}
        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                aria-label="Recipient name"
                value={v.recipientName}
                onChange={(e) => setV({ ...v, recipientName: e.target.value })}
              />
              <Input
                aria-label="Recipient address"
                placeholder={m.channel === 'EMAIL' ? 'email@client.com' : '+91…'}
                value={v.recipientAddress}
                onChange={(e) => setV({ ...v, recipientAddress: e.target.value })}
              />
            </div>
            <Input
              aria-label="Subject"
              value={v.subject}
              onChange={(e) => setV({ ...v, subject: e.target.value })}
            />
            <Textarea
              aria-label="Message"
              rows={12}
              value={v.body}
              onChange={(e) => setV({ ...v, body: e.target.value })}
            />
            <label className="text-xs text-text-2">
              Send at (leave empty to send when approved)
              <Input
                type="datetime-local"
                className="mt-1"
                value={v.scheduledFor}
                onChange={(e) => setV({ ...v, scheduledFor: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(v)}>
                Save draft
              </Button>
            </div>
          </div>
        ) : (
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 font-sans text-sm leading-6">
            {m.body}
          </pre>
        )}
        {m.unfilled.length ? (
          <Honesty tone="attention">
            This message still has placeholders: {m.unfilled.map((u) => `[${u}]`).join(', ')}. Edit
            it — it cannot be sent until they are filled.
          </Honesty>
        ) : null}
        {canWrite && open && !editing ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => cancel.mutate()}>
              <X /> Cancel message
            </Button>
            <Button onClick={() => setEditing(true)}>
              <PenLine /> Edit
            </Button>
            <Button
              variant="primary"
              disabled={m.unfilled.length > 0}
              loading={send.isPending}
              onClick={() => send.mutate()}
            >
              <Send />{' '}
              {m.scheduledFor && new Date(m.scheduledFor) > new Date()
                ? 'Approve & queue'
                : 'Approve & send'}
            </Button>
          </div>
        ) : null}
        {m.channel === 'WHATSAPP' && open ? (
          <p className="text-2xs text-text-3">
            WhatsApp is not integrated: copy this text into WhatsApp yourself; NOVA records it as
            simulated.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const clients = useClients();
  const projects = useProjects({ status: 'ALL' });
  const templates = useTemplates();
  const blank = {
    clientId: '',
    projectId: '',
    trigger: 'MANUAL',
    channel: 'EMAIL',
    recipientName: '',
    recipientAddress: '',
    subject: '',
    body: '',
    scheduledFor: '',
  };
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const create = useApiMutation<typeof v, MessageView>('POST', '/communications', {
    transform: (b) => ({
      ...b,
      scheduledFor: b.scheduledFor ? new Date(b.scheduledFor).toISOString() : '',
    }),
    success: 'Draft created — review it, then send',
    onSuccess: (m) => {
      onOpenChange(false);
      onCreated(m.id);
    },
    onError: (e) => {
      const f = fieldErrors(e);
      setErrors(f);
      return Object.keys(f).length > 0;
    },
  });
  /** Fills subject, body and recipient from a template and the chosen client/project. */
  const fromTemplate = async (trigger: string) => {
    setV((x) => ({ ...x, trigger }));
    if (trigger === 'MANUAL' || !v.clientId) return;
    setLoading(true);
    try {
      const p = await api<{
        subject: string;
        body: string;
        recipient: { name: string; address: string | null; channel: string } | null;
      }>('/communications/preview', {
        method: 'POST',
        body: { trigger, clientId: v.clientId, projectId: v.projectId || undefined },
      });
      setV((x) => ({
        ...x,
        trigger,
        subject: p.subject,
        body: p.body,
        recipientName: p.recipient?.name ?? x.recipientName,
        recipientAddress: p.recipient?.address ?? x.recipientAddress,
        channel: p.recipient?.channel ?? x.channel,
      }));
    } finally {
      setLoading(false);
    }
  };
  const clientProjects = (projects.data ?? []).filter((p) => p.client.id === v.clientId);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New client message"
      description="Saved as a draft. Nothing is sent until you approve it."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate(v)}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Client" error={errors.clientId}>
          {(p) => (
            <Select
              {...p}
              value={v.clientId}
              onChange={(e) => {
                const c = clients.data?.find((x) => x.id === e.target.value);
                setV({
                  ...v,
                  clientId: e.target.value,
                  projectId: '',
                  recipientName: c?.name ?? '',
                });
              }}
            >
              <option value="">Choose…</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Project (optional)" error={errors.projectId}>
          {(p) => (
            <Select
              {...p}
              value={v.projectId}
              disabled={!v.clientId}
              onChange={(e) => setV({ ...v, projectId: e.target.value })}
            >
              <option value="">None</option>
              {clientProjects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Start from template"
          hint={loading ? 'Filling…' : 'Fills the text from the client and project'}
        >
          {(p) => (
            <Select
              {...p}
              value={v.trigger}
              disabled={!v.clientId}
              onChange={(e) => void fromTemplate(e.target.value)}
            >
              <option value="MANUAL">Blank message</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.trigger}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Channel">
          {(p) => (
            <Select
              {...p}
              value={v.channel}
              onChange={(e) => setV({ ...v, channel: e.target.value })}
            >
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp (simulated)</option>
            </Select>
          )}
        </Field>
        <Field label="Recipient name" error={errors.recipientName}>
          {(p) => (
            <Input
              {...p}
              value={v.recipientName}
              onChange={(e) => setV({ ...v, recipientName: e.target.value })}
            />
          )}
        </Field>
        <Field
          label={v.channel === 'EMAIL' ? 'Email address' : 'WhatsApp number'}
          error={errors.recipientAddress}
        >
          {(p) => (
            <Input
              {...p}
              value={v.recipientAddress}
              onChange={(e) => setV({ ...v, recipientAddress: e.target.value })}
            />
          )}
        </Field>
        <Field label="Subject" error={errors.subject} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              value={v.subject}
              onChange={(e) => setV({ ...v, subject: e.target.value })}
            />
          )}
        </Field>
        <Field label="Message" error={errors.body} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              rows={10}
              value={v.body}
              onChange={(e) => setV({ ...v, body: e.target.value })}
            />
          )}
        </Field>
        <Field label="Send at (optional)" className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={v.scheduledFor}
              onChange={(e) => setV({ ...v, scheduledFor: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function Templates() {
  const q = useTemplates();
  const canWrite = useCan('client:write');
  const [editing, setEditing] = useState<MessageTemplateView | null>(null);
  return (
    <>
      <Honesty>
        Automations watch NOVA’s own records (project created, shoot confirmed or moved, stage
        changes, approvals, delivery). “Prepare a draft” waits for a person; “Queue and send
        automatically” sends on its own — through the configured provider, or as a simulated send
        when none is configured. A message with an unfilled placeholder is always held as a draft.
      </Honesty>
      <Panel bodyClassName="px-0">
        <PanelState query={q}>
          <ul className="divide-y divide-line/60">
            {(q.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Bot className="size-4 shrink-0 text-ai" aria-hidden />
                <span className="min-w-48 flex-1">
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block text-2xs text-text-3">
                    When: {t.event}
                    {t.timeBased
                      ? ` · ${Math.abs(t.offsetHours)} h ${t.offsetHours < 0 ? 'before' : 'after'}`
                      : ''}{' '}
                    · {t.channel === 'EMAIL' ? 'Email' : 'WhatsApp'}
                  </span>
                </span>
                <Badge tone={t.mode === 'OFF' ? 'neutral' : t.mode === 'AUTO' ? 'ai' : 'info'}>
                  {AUTOMATION_MODE_LABELS[t.mode]}
                </Badge>
                {canWrite ? (
                  <Button size="sm" onClick={() => setEditing(t)}>
                    <PenLine /> Edit
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </PanelState>
      </Panel>
      {editing ? (
        <TemplateDialog key={editing.id} t={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function TemplateDialog({ t, onClose }: { t: MessageTemplateView | null; onClose: () => void }) {
  const [v, setV] = useState(() => ({
    name: t?.name ?? '',
    subject: t?.subject ?? '',
    body: t?.body ?? '',
    mode: (t?.mode ?? 'DRAFT') as string,
    channel: (t?.channel ?? 'EMAIL') as string,
    offsetHours: String(t?.offsetHours ?? 0),
  }));
  const [preview, setPreview] = useState<{
    subject: string;
    body: string;
    missing: string[];
  } | null>(null);
  const projects = useProjects({ status: 'ACTIVE' });
  const [projectId, setProjectId] = useState('');
  const save = useApiMutation<typeof v>('PATCH', `/communications/templates/${t?.id}`, {
    transform: (b) => ({ ...b, offsetHours: Number(b.offsetHours) }),
    success: 'Template saved',
    onSuccess: onClose,
  });
  const runPreview = async () => {
    if (!t) return;
    const p = await api<{ subject: string; body: string; missing: string[] }>(
      '/communications/preview',
      {
        method: 'POST',
        body: {
          trigger: t.trigger,
          projectId: projectId || undefined,
          subject: v.subject,
          body: v.body,
        },
      },
    );
    setPreview(p);
  };
  return (
    <Dialog
      open={!!t}
      onOpenChange={(o) => !o && onClose()}
      title={t ? `Template · ${t.name}` : 'Template'}
      description={t?.event}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(v)}>
            Save template
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-text-2">
              Automation
              <Select
                className="mt-1"
                value={v.mode}
                onChange={(e) => setV({ ...v, mode: e.target.value })}
              >
                {AUTOMATION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {AUTOMATION_MODE_LABELS[m]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-text-2">
              Channel
              <Select
                className="mt-1"
                value={v.channel}
                onChange={(e) => setV({ ...v, channel: e.target.value })}
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp (simulated)</option>
              </Select>
            </label>
            {t?.timeBased ? (
              <label className="text-xs text-text-2">
                Offset (hours, − = before)
                <Input
                  className="mt-1"
                  type="number"
                  min={-720}
                  max={720}
                  value={v.offsetHours}
                  onChange={(e) => setV({ ...v, offsetHours: e.target.value })}
                />
              </label>
            ) : null}
          </div>
          <label className="text-xs text-text-2">
            Name
            <Input
              className="mt-1"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </label>
          <label className="text-xs text-text-2">
            Subject
            <Input
              className="mt-1"
              value={v.subject}
              onChange={(e) => setV({ ...v, subject: e.target.value })}
            />
          </label>
          <label className="text-xs text-text-2">
            Body
            <Textarea
              className="mt-1 font-mono text-xs"
              rows={10}
              value={v.body}
              onChange={(e) => setV({ ...v, body: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Preview with project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-56"
            >
              <option value="">Preview without a project</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.title}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => void runPreview()}>
              Preview
            </Button>
          </div>
          {preview ? (
            <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 text-sm">
              <p className="font-medium">{preview.subject}</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-5">
                {preview.body}
              </pre>
              {preview.missing.length ? (
                <p className="mt-1 text-2xs text-attention">
                  Not filled for this preview: {preview.missing.join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <p className="eyebrow mb-1">Placeholders</p>
          <ul className="flex flex-col gap-1 text-2xs">
            {TEMPLATE_VARIABLES.map(([k, label]) => (
              <li key={k}>
                <code className="rounded bg-surface-3 px-1">{`{{${k}}}`}</code>{' '}
                <span className="text-text-3">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
