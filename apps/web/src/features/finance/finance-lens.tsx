'use client';

import { AGEING_LABELS, AGEING_BUCKETS, type ExpenseView, type InvoiceSummary } from '@nova/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { date, money, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { InvoiceActions } from './invoice-actions';
import {
  useClients,
  useExpenses,
  useFinanceOverview,
  useInvoices,
  useProjects,
} from '@/lib/queries';

const invoiceTone: Record<InvoiceSummary['status'], Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PARTIALLY_PAID: 'attention',
  PAID: 'signal',
  VOID: 'neutral',
};
const expenseTone: Record<ExpenseView['status'], Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'attention',
  APPROVED: 'info',
  REJECTED: 'critical',
  PAID: 'signal',
};

/** Finance workspace: receivables, invoices, expenses and vendors (demonstration figures). */
export function FinanceLens() {
  // The lens is open to anyone who can submit an expense; the ledger figures and invoices
  // need `finance:read`. Without it those requests are not made and their panels are not shown.
  const canRead = useCan('finance:read');
  const overview = useFinanceOverview(canRead);
  const invoices = useInvoices({}, canRead);
  const expenses = useExpenses();
  const canInvoice = useCan('invoice:write');
  const canPay = useCan('finance:write');
  const canSubmit = useCan('expense:submit');
  const [newInvoice, setNewInvoice] = useState(false);
  const [newExpense, setNewExpense] = useState(false);

  const o = overview.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-3">
        Demonstration data. Totals are computed by the API; tax is a plain percentage, not a
        compliance calculation.
      </p>
      {canRead ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Outstanding" value={o ? money(o.receivables.outstanding) : '—'} />
            <Kpi
              label="Overdue"
              value={o ? money(o.receivables.overdue) : '—'}
              tone={o && o.receivables.overdue > 0 ? 'critical' : 'neutral'}
            />
            <Kpi
              label="Expenses awaiting approval"
              value={
                o
                  ? `${o.expenses.awaitingApprovalCount} · ${money(o.expenses.awaitingApproval)}`
                  : '—'
              }
              tone="attention"
            />
            <Kpi label="Collected this month" value={o ? money(o.collectedThisMonth) : '—'} />
          </div>

          <Panel eyebrow="Receivables" title="Ageing of open invoices">
            {o ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {AGEING_BUCKETS.map((b) => (
                  <div
                    key={b}
                    className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-3"
                  >
                    <p className="eyebrow">{AGEING_LABELS[b]}</p>
                    <p className="mt-1 font-mono text-sm">{money(o.receivables.ageing[b])}</p>
                  </div>
                ))}
              </div>
            ) : (
              <PanelState query={overview} skeleton="block">
                {null}
              </PanelState>
            )}
          </Panel>

          <Panel
            eyebrow="Billing"
            title="Invoices"
            action={
              canInvoice ? (
                <Button size="sm" onClick={() => setNewInvoice(true)}>
                  <Plus /> Invoice
                </Button>
              ) : null
            }
            bodyClassName="px-0"
          >
            <PanelState
              query={invoices}
              isEmpty={!invoices.data?.length}
              empty={{ title: 'No invoices yet.' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="text-left">
                      {['Invoice', 'Client', 'Due', 'Total', 'Balance', 'Status', 'Actions'].map(
                        (h) => (
                          <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices.data ?? []).map((i) => (
                      <tr key={i.id} className="border-t border-line/60 hover:bg-surface-2">
                        <td className="px-4 py-2">
                          <span className="font-mono text-xs">{i.number}</span>
                        </td>
                        <td className="px-4 py-2 text-text-2">{i.client.name}</td>
                        <td className="px-4 py-2 text-xs">
                          {date(i.dueDate)}
                          {i.overdue ? (
                            <span className="ml-2 text-critical">{i.daysOverdue}d late</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {money(i.total, { exact: true })}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {money(i.balance, { exact: true })}
                        </td>
                        <td className="px-4 py-2">
                          <Badge tone={invoiceTone[i.status]}>{titleCase(i.status)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <InvoiceActions invoice={i} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelState>
          </Panel>
        </>
      ) : (
        <p className="text-sm text-text-2">
          Your role can submit and track its own expenses. Invoices, receivables and the ledger are
          visible to roles with finance access.
        </p>
      )}

      <Panel
        eyebrow="Spend"
        title="Expenses"
        action={
          canSubmit ? (
            <Button size="sm" onClick={() => setNewExpense(true)}>
              <Plus /> Expense
            </Button>
          ) : null
        }
        bodyClassName="px-0"
      >
        <PanelState
          query={expenses}
          isEmpty={!expenses.data?.length}
          empty={{ title: 'No expenses yet.' }}
        >
          <ul className="divide-y divide-line/60">
            {(expenses.data ?? []).map((e) => (
              <ExpenseRow key={e.id} e={e} canPay={canPay} />
            ))}
          </ul>
        </PanelState>
      </Panel>

      <NewInvoiceDialog open={newInvoice} onOpenChange={setNewInvoice} />
      <NewExpenseDialog open={newExpense} onOpenChange={setNewExpense} />
    </div>
  );
}

function Kpi({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface-1 p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-1 font-mono text-lg ${tone === 'critical' ? 'text-critical' : tone === 'attention' ? 'text-attention' : 'text-text'}`}
      >
        {value}
      </p>
    </div>
  );
}

function ExpenseRow({ e, canPay }: { e: ExpenseView; canPay: boolean }) {
  const pay = useApiMutation<void, unknown>('POST', `/expenses/${e.id}/pay`, {
    success: 'Marked as paid and posted to the ledger',
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium">{e.title}</span>
        <span className="block truncate text-xs text-text-3">
          {e.number} · {e.submittedBy.name} · {date(e.incurredOn)}
          {e.project ? ` · ${e.project.code}` : ''}
        </span>
      </div>
      <span className="font-mono text-xs">{money(e.amount, { exact: true })}</span>
      <Badge tone={expenseTone[e.status]}>{titleCase(e.status)}</Badge>
      {canPay && e.status === 'APPROVED' ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pay.isPending}
          onClick={() => pay.mutate(undefined)}
        >
          Mark paid
        </Button>
      ) : null}
    </li>
  );
}

function NewInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const clients = useClients();
  const projects = useProjects({ status: 'ALL' });
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [taxPercent, setTaxPercent] = useState('18');
  const [dueDays, setDueDays] = useState('15');
  const create = useApiMutation<Record<string, unknown>, { number: string }>('POST', '/invoices', {
    success: (inv) => `Invoice ${inv.number} drafted`,
    onSuccess: () => onOpenChange(false),
  });
  const submit = () => {
    const now = new Date();
    create.mutate({
      clientId,
      projectId: projectId || undefined,
      issueDate: now.toISOString(),
      dueDate: new Date(now.getTime() + Number(dueDays) * 86_400_000).toISOString(),
      taxPercent: Number(taxPercent),
      lines: [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }],
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New invoice"
      description="Saved as a draft. Totals are calculated by the server when you save."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!clientId || !description || !unitPrice}
            onClick={submit}
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Client">
          {(p) => (
            <Select {...p} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose a client</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
        <Field label="Line description" className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Final payment — Woven Light"
            />
          )}
        </Field>
        <Field label="Quantity">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          )}
        </Field>
        <Field label="Unit price (₹)">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          )}
        </Field>
        <Field label="Tax (%)">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={40}
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
            />
          )}
        </Field>
        <Field label="Payment terms (days)">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function NewExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const projects = useProjects({ status: 'ALL' });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('CREW');
  const [amount, setAmount] = useState('');
  const [projectId, setProjectId] = useState('');
  const [notes, setNotes] = useState('');
  const create = useApiMutation<Record<string, unknown>, unknown>('POST', '/expenses', {
    success: 'Expense submitted for approval',
    onSuccess: () => {
      setTitle('');
      setAmount('');
      setNotes('');
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Submit an expense"
      description="It goes to the approval chain for its amount. Nothing is paid until approved."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!title || !amount}
            onClick={() =>
              create.mutate({
                title,
                category,
                amount: Number(amount),
                incurredOn: new Date().toISOString(),
                projectId: projectId || undefined,
                notes: notes || undefined,
                submit: true,
              })
            }
          >
            Submit
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="What was it for?" className="sm:col-span-2">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Category">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              {[
                'CREW',
                'EQUIPMENT_RENTAL',
                'LOCATION',
                'TRAVEL',
                'SOFTWARE',
                'POST_PRODUCTION',
                'OVERHEAD',
                'MARKETING',
                'CONSUMABLES',
                'MAINTENANCE',
              ].map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Amount (₹)">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Project (optional)" className="sm:col-span-2">
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
        <Field label="Notes" className="sm:col-span-2">
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
