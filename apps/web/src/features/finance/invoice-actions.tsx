'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  RecordPayment,
  VoidInvoice,
  type InvoiceSummary,
} from '@nova/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useCan } from '@/features/shell/user-context';
import { money } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * What can be done with an invoice from the list, by its state and the user's permissions:
 * a draft is sent, an open invoice takes payments, and an invoice nobody has paid can be voided.
 * The API enforces the same rules; controls that would be refused are not offered.
 */
export function InvoiceActions({ invoice }: { invoice: InvoiceSummary }) {
  const canInvoice = useCan('invoice:write');
  const canPay = useCan('finance:write');
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const send = useApiMutation<void>('POST', `/invoices/${invoice.id}/send`, {
    success: `${invoice.number} sent to ${invoice.client.name}`,
  });

  const open = invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID';
  const voidable = invoice.paid === 0 && (invoice.status === 'DRAFT' || invoice.status === 'SENT');
  const actions = [
    canInvoice && invoice.status === 'DRAFT' ? (
      <Button key="send" size="sm" loading={send.isPending} onClick={() => send.mutate()}>
        Send
      </Button>
    ) : null,
    canPay && open ? (
      <Button key="pay" size="sm" onClick={() => setPaying(true)}>
        Record payment
      </Button>
    ) : null,
    canInvoice && voidable ? (
      <Button key="void" size="sm" variant="ghost" onClick={() => setVoiding(true)}>
        Void
      </Button>
    ) : null,
  ].filter(Boolean);

  if (actions.length === 0) return <span className="text-xs text-text-3">—</span>;
  return (
    <div className="flex justify-end gap-1.5">
      {actions}
      {paying ? <PaymentDialog invoice={invoice} onClose={() => setPaying(false)} /> : null}
      {voiding ? <VoidDialog invoice={invoice} onClose={() => setVoiding(false)} /> : null}
    </div>
  );
}

function PaymentDialog({ invoice, onClose }: { invoice: InvoiceSummary; onClose: () => void }) {
  type In = z.input<typeof RecordPayment>;
  type Out = z.output<typeof RecordPayment>;
  const { register, handleSubmit, formState, setError } = useForm<In, unknown, Out>({
    resolver: zodResolver(RecordPayment),
    defaultValues: {
      amount: invoice.balance,
      receivedOn: today(),
      method: 'BANK_TRANSFER',
      reference: '',
    },
  });
  const record = useApiMutation<Out>('POST', `/invoices/${invoice.id}/payments`, {
    success: (_, v) =>
      v.amount >= invoice.balance
        ? `${invoice.number} paid in full`
        : `${money(v.amount, { exact: true })} recorded on ${invoice.number}`,
    onSuccess: onClose,
  });
  const e = formState.errors;
  const submit = handleSubmit((v) => {
    if (v.amount > invoice.balance) {
      setError('amount', {
        message: `The balance is ${money(invoice.balance, { exact: true })}.`,
      });
      return;
    }
    record.mutate(v);
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Record payment · ${invoice.number}`}
      description={`${invoice.client.name} · balance ${money(invoice.balance, { exact: true })} of ${money(invoice.total, { exact: true })}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={record.isPending} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Amount received (₹)" error={e.amount?.message}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={invoice.balance}
              {...register('amount')}
              autoFocus
            />
          )}
        </Field>
        <Field label="Received on" error={e.receivedOn?.message}>
          {(p) => <Input {...p} type="date" max={today()} {...register('receivedOn')} />}
        </Field>
        <Field label="Method" error={e.method?.message}>
          {(p) => (
            <Select {...p} {...register('method')}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reference" error={e.reference?.message} hint="UTR, cheque no. — optional">
          {(p) => <Input {...p} {...register('reference')} />}
        </Field>
      </form>
    </Dialog>
  );
}

function VoidDialog({ invoice, onClose }: { invoice: InvoiceSummary; onClose: () => void }) {
  type In = z.input<typeof VoidInvoice>;
  type Out = z.output<typeof VoidInvoice>;
  const { register, handleSubmit, formState } = useForm<In, unknown, Out>({
    resolver: zodResolver(VoidInvoice),
  });
  const run = useApiMutation<Out>('POST', `/invoices/${invoice.id}/void`, {
    success: `${invoice.number} voided`,
    onSuccess: onClose,
  });
  const submit = handleSubmit((v) => run.mutate(v));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Void ${invoice.number}?`}
      description={`${invoice.client.name} · ${money(invoice.total, { exact: true })}. A void invoice stays on record with its reason and can no longer be sent or paid.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep invoice
          </Button>
          <Button variant="danger" loading={run.isPending} onClick={submit}>
            Void invoice
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Field label="Reason" error={formState.errors.reason?.message}>
          {(p) => (
            <Textarea
              {...p}
              {...register('reason')}
              placeholder="Why is this invoice being voided?"
              autoFocus
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
