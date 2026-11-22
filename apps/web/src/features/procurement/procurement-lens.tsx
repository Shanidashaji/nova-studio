'use client';

import type { PurchaseOrderDetail, PurchaseRequestView } from '@nova/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { date, money, titleCase } from '@/lib/format';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutations';
import { usePurchaseOrders, usePurchaseRequests, useStock, useVendors } from '@/lib/queries';

const requestTone: Record<PurchaseRequestView['status'], Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'attention',
  APPROVED: 'info',
  REJECTED: 'critical',
  ORDERED: 'signal',
  CANCELLED: 'neutral',
};

/**
 * Purchase request → quotations → approval → purchase order → receipt into stock → vendor bill.
 * Approval decisions happen in the Approvals lens; this lens shows where each request stands.
 */
export function ProcurementLens() {
  const requests = usePurchaseRequests();
  const orders = usePurchaseOrders();
  const canRequest = useCan('procurement:request');
  const canOrder = useCan('procurement:order');
  const [raising, setRaising] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow="Requests"
        title="Purchase requests"
        action={
          canRequest ? (
            <Button size="sm" onClick={() => setRaising(true)}>
              <Plus /> Request
            </Button>
          ) : null
        }
        bodyClassName="px-0"
      >
        <PanelState
          query={requests}
          isEmpty={!requests.data?.length}
          empty={{ title: 'No purchase requests.' }}
        >
          <ul className="divide-y divide-line/60">
            {(requests.data ?? []).map((r) => (
              <RequestRow key={r.id} r={r} canOrder={canOrder} />
            ))}
          </ul>
        </PanelState>
      </Panel>

      <Panel eyebrow="Orders" title="Purchase orders" bodyClassName="px-0">
        <PanelState
          query={orders}
          isEmpty={!orders.data?.length}
          empty={{ title: 'No purchase orders yet.' }}
        >
          <ul className="divide-y divide-line/60">
            {(orders.data ?? []).map((o) => (
              <OrderRow
                key={o.id}
                id={o.id}
                number={o.number}
                vendor={o.vendor.name}
                status={o.status}
                total={o.total}
                issuedOn={o.issuedOn}
                canOrder={canOrder}
              />
            ))}
          </ul>
        </PanelState>
      </Panel>
      <NewRequestDialog open={raising} onOpenChange={setRaising} />
    </div>
  );
}

function RequestRow({ r, canOrder }: { r: PurchaseRequestView; canOrder: boolean }) {
  const selected = r.quotes.find((q) => q.isSelected);
  const vendors = useVendors();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const addQuote = useApiMutation<{ vendorId: string; amount: number }, PurchaseRequestView>(
    'POST',
    `/purchase-requests/${r.id}/quotes`,
    { success: 'Quotation recorded', onSuccess: () => setAmount('') },
  );
  const select = useApiMutation<{ quoteId: string }, PurchaseRequestView>(
    'POST',
    (b) => `/purchase-requests/${r.id}/quotes/${b.quoteId}/select`,
    { success: 'Quotation selected', transform: () => ({}) },
  );
  const quotable = ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(r.status);
  const order = useApiMutation<{ requestId: string }, PurchaseOrderDetail>(
    'POST',
    '/purchase-orders',
    {
      success: (o) => `${o.number} issued to ${o.vendor.name}`,
    },
  );
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {r.number} · {r.title}
          </p>
          <p className="truncate text-xs text-text-3">
            {r.requestedBy.name}
            {r.project ? ` · ${r.project.code}` : ''}
            {r.neededBy ? ` · needed by ${date(r.neededBy)}` : ''}
          </p>
        </div>
        <span className="font-mono text-xs">{money(r.estimatedTotal, { exact: true })}</span>
        <Badge tone={requestTone[r.status]}>{titleCase(r.status)}</Badge>
      </div>
      <p className="text-xs text-text-2">
        {r.items.map((i) => `${i.quantity} × ${i.description}`).join(' · ')}
      </p>
      {r.quotes.length ? (
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {r.quotes.map((q) => (
            <li
              key={q.id}
              className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5"
            >
              {q.vendor.name} · {money(q.amount)}
              {q.isSelected ? (
                <span className="text-signal">· selected</span>
              ) : canOrder && quotable ? (
                <button
                  type="button"
                  className="text-text-3 underline hover:text-text pointer-coarse:min-h-9 pointer-coarse:px-2"
                  onClick={() => select.mutate({ quoteId: q.id })}
                >
                  select
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canOrder && quotable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Quoting vendor"
            className="w-56"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">Add a quotation from…</option>
            {(vendors.data ?? [])
              .filter((v) => v.isActive)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </Select>
          <Input
            aria-label="Quoted amount"
            type="number"
            min={1}
            className="w-28"
            placeholder="₹ amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!vendorId || !amount}
            loading={addQuote.isPending}
            onClick={() => addQuote.mutate({ vendorId, amount: Number(amount) })}
          >
            Add quote
          </Button>
        </div>
      ) : null}
      {r.approval && r.status === 'SUBMITTED' ? (
        <p className="text-xs text-attention">
          Awaiting step {r.approval.currentStep} of {r.approval.steps.length}:{' '}
          {r.approval.steps.find((s) => s.order === r.approval!.currentStep)?.label}
        </p>
      ) : null}
      {canOrder && r.status === 'APPROVED' ? (
        <div>
          <Button
            size="sm"
            variant="primary"
            disabled={!selected}
            loading={order.isPending}
            onClick={() => order.mutate({ requestId: r.id })}
          >
            {selected ? `Issue order to ${selected.vendor.name}` : 'Select a quotation to order'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function OrderRow(props: {
  id: string;
  number: string;
  vendor: string;
  status: string;
  total: number;
  issuedOn: string;
  canOrder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const receive = useApiMutation<
    { lines: { lineId: string; quantity: number }[]; createBill: boolean },
    PurchaseOrderDetail
  >('POST', `/purchase-orders/${props.id}/receive`, {
    success: (o) =>
      o.status === 'RECEIVED'
        ? `${o.number} received in full${o.bill ? ' — vendor bill raised for approval' : ''}`
        : 'Receipt recorded',
    onSuccess: (o) => {
      setDetail(o);
      setQty({});
    },
  });
  const load = async () => {
    setOpen(true);
    try {
      setDetail(await api<PurchaseOrderDetail>(`/purchase-orders/${props.id}`));
    } catch (error) {
      setOpen(false);
      toast.error(
        error instanceof Error ? error.message : 'The purchase order could not be loaded.',
      );
    }
  };
  const closed = props.status === 'RECEIVED' || props.status === 'CANCELLED';
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs">{props.number}</span>
        <span className="min-w-0 flex-1 truncate">
          {props.vendor} · {date(props.issuedOn)}
        </span>
        <span className="font-mono text-xs">{money(props.total, { exact: true })}</span>
        <Badge
          tone={
            props.status === 'RECEIVED'
              ? 'signal'
              : props.status === 'CANCELLED'
                ? 'neutral'
                : 'info'
          }
        >
          {titleCase(props.status)}
        </Badge>
        {props.canOrder && !closed ? (
          <Button size="sm" variant="ghost" onClick={() => (open ? setOpen(false) : void load())}>
            {open ? 'Close' : 'Receive goods'}
          </Button>
        ) : null}
      </div>
      {open && detail ? (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3">
          {detail.lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{l.description}</span>
              <span className="text-xs text-text-3">
                {l.receivedQty}/{l.quantity} received
              </span>
              <Input
                aria-label={`Quantity received for ${l.description}`}
                type="number"
                min={0}
                max={l.quantity - l.receivedQty}
                className="w-20"
                value={qty[l.id] ?? ''}
                onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="primary"
              loading={receive.isPending}
              onClick={() =>
                receive.mutate({
                  lines: detail.lines.map((l) => ({
                    lineId: l.id,
                    quantity: Number(qty[l.id] || 0),
                  })),
                  createBill: true,
                })
              }
            >
              Record receipt
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function NewRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const stock = useStock();
  const vendors = useVendors();
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('');
  const [stockItemId, setStockItemId] = useState('');
  const create = useApiMutation<Record<string, unknown>, PurchaseRequestView>(
    'POST',
    '/purchase-requests',
    {
      success: (r) => `${r.number} submitted for approval`,
      onSuccess: () => {
        setTitle('');
        setDescription('');
        setCost('');
        onOpenChange(false);
      },
    },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Raise a purchase request"
      description={`It goes to approval for its estimated total. ${vendors.data?.length ?? 0} vendors on file can quote.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!title || !description || !cost}
            onClick={() =>
              create.mutate({
                title,
                justification: justification || undefined,
                items: [
                  {
                    description,
                    quantity: Number(quantity),
                    estimatedUnitCost: Number(cost),
                    stockItemId: stockItemId || undefined,
                  },
                ],
                submit: true,
              })
            }
          >
            Submit
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Why is it needed?" className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
            />
          )}
        </Field>
        <Field label="Restock an inventory item (optional)" className="sm:col-span-2">
          {(p) => (
            <Select
              {...p}
              value={stockItemId}
              onChange={(e) => {
                setStockItemId(e.target.value);
                const item = stock.data?.find((s) => s.id === e.target.value);
                if (item) {
                  setDescription(item.name);
                  setCost(String(item.unitCost));
                }
              }}
            >
              <option value="">Not a stock item</option>
              {(stock.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sku} · {s.name} ({s.onHand} on hand)
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Item" className="sm:col-span-2">
          {(p) => (
            <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} />
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
        <Field label="Estimated unit cost (₹)">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
