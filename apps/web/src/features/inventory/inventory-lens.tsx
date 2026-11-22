'use client';

import type { StockItemView } from '@nova/shared';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { money, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useAssets, useStock } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';

const levelTone: Record<StockItemView['level'], Tone> = {
  OUT: 'critical',
  LOW: 'attention',
  OK: 'signal',
};

/** Consumable stock (with a movement ledger) and the equipment register. */
export function InventoryLens() {
  const stock = useStock();
  const assets = useAssets();
  const inspect = useWorkspace((s) => s.inspect);
  const canWrite = useCan('inventory:write');
  const low = (stock.data ?? []).filter((s) => s.level !== 'OK');

  return (
    <div className="flex flex-col gap-4">
      {low.length ? (
        <p className="rounded-[var(--radius-md)] border border-attention-line bg-attention-soft px-4 py-2 text-sm text-attention">
          {low.length} item{low.length === 1 ? '' : 's'} at or below reorder level:{' '}
          {low.map((s) => s.name).join(', ')}. Raise a purchase request from Procurement.
        </p>
      ) : null}
      <Panel eyebrow="Consumables" title="Stock" bodyClassName="px-0">
        <PanelState
          query={stock}
          isEmpty={!stock.data?.length}
          empty={{ title: 'No stock items.' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="text-left">
                  {['Item', 'Location', 'On hand', 'Reorder at', 'On order', 'Level', ''].map(
                    (h) => (
                      <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {(stock.data ?? []).map((s) => (
                  <StockRow key={s.id} s={s} canWrite={canWrite} />
                ))}
              </tbody>
            </table>
          </div>
        </PanelState>
      </Panel>

      <Panel eyebrow="Equipment" title="Equipment register" bodyClassName="px-0">
        <PanelState query={assets}>
          <ul className="grid divide-y divide-line/60 md:grid-cols-2 md:divide-y-0">
            {(assets.data ?? []).map((a) => (
              <li key={a.id} className="border-line/60 md:border-b">
                <button
                  type="button"
                  onClick={() => inspect({ type: 'asset', id: a.id })}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate font-mono text-[10px] text-text-3">
                      {a.serialTag} · {titleCase(a.homeLocation)} · {money(a.dailyRate)}/day
                    </span>
                  </span>
                  <Badge
                    tone={
                      a.status === 'AVAILABLE'
                        ? 'signal'
                        : a.status === 'MAINTENANCE'
                          ? 'attention'
                          : 'neutral'
                    }
                  >
                    {titleCase(a.status)}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </PanelState>
      </Panel>
    </div>
  );
}

function StockRow({ s, canWrite }: { s: StockItemView; canWrite: boolean }) {
  const [qty, setQty] = useState('');
  const move = useApiMutation<Record<string, unknown>, StockItemView>(
    'POST',
    `/stock/${s.id}/movements`,
    {
      success: (item) => `${item.name}: ${item.onHand} ${item.unit} on hand`,
      onSuccess: () => setQty(''),
    },
  );
  return (
    <tr className="border-t border-line/60">
      <th scope="row" className="px-4 py-2 text-left font-normal">
        <span className="block font-medium">{s.name}</span>
        <span className="block font-mono text-[10px] text-text-3">{s.sku}</span>
      </th>
      <td className="px-4 py-2 text-xs text-text-2">{titleCase(s.location)}</td>
      <td className="px-4 py-2 font-mono text-xs">
        {s.onHand} {s.unit}
      </td>
      <td className="px-4 py-2 font-mono text-xs">{s.reorderLevel}</td>
      <td className="px-4 py-2 font-mono text-xs">{s.onOrder || '—'}</td>
      <td className="px-4 py-2">
        <Badge tone={levelTone[s.level]}>{titleCase(s.level)}</Badge>
      </td>
      <td className="px-4 py-2">
        {canWrite ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              aria-label={`Quantity of ${s.name}`}
              type="number"
              min={1}
              className="w-16"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!qty || move.isPending}
              onClick={() => move.mutate({ type: 'ISSUED', quantity: Number(qty) })}
            >
              Issue
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!qty || move.isPending}
              onClick={() => move.mutate({ type: 'RETURNED', quantity: Number(qty) })}
            >
              Return
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}
