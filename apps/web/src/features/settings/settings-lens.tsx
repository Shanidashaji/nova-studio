'use client';

import {
  APPROVAL_SUBJECT_LABELS,
  PERMISSION_GROUPS,
  type Permission,
  type RoleView,
  type UserView,
} from '@nova/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan, useUser } from '@/features/shell/user-context';
import { ago, money } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import {
  useAdminRoles,
  useAdminUsers,
  useApprovalRules,
  useMySessions,
  usePreferences,
} from '@/lib/queries';

type Tab = 'account' | 'users' | 'roles' | 'rules';

/**
 * Administration inside the workspace. Every control here is also enforced by the API
 * (ADR-0009); tabs a role cannot use are not shown.
 */
export function SettingsLens() {
  const canUsers = useCan('user:manage');
  const canRoles = useCan('role:manage');
  const tabs: { value: Tab; label: string }[] = [
    { value: 'account', label: 'My account' },
    ...(canUsers ? [{ value: 'users' as const, label: 'Users' }] : []),
    ...(canUsers || canRoles ? [{ value: 'roles' as const, label: 'Roles & permissions' }] : []),
    ...(canRoles ? [{ value: 'rules' as const, label: 'Approval rules' }] : []),
  ];
  const [tab, setTab] = useState<Tab>('account');

  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 ? (
        <Segmented label="Settings section" value={tab} onChange={setTab} options={tabs} />
      ) : null}
      {tab === 'account' ? <AccountSettings /> : null}
      {tab === 'users' && canUsers ? <UsersSettings /> : null}
      {tab === 'roles' ? <RolesSettings editable={canRoles} /> : null}
      {tab === 'rules' && canRoles ? <RulesSettings /> : null}
    </div>
  );
}

// ── My account ────────────────────────────────────────────────────────────────

function AccountSettings() {
  const user = useUser();
  const sessions = useMySessions();
  const prefs = usePreferences();
  const revoke = useApiMutation<{ id: string }, void>('DELETE', (b) => `/me/sessions/${b.id}`, {
    success: 'Session signed out',
  });
  const savePrefs = useApiMutation<{ preferences: { kind: string; inApp: boolean }[] }, unknown>(
    'PUT',
    '/me/notification-preferences',
    { success: 'Notification preferences saved' },
  );
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useApiMutation<{ currentPassword: string; newPassword: string }, void>(
    'POST',
    '/me/password',
    {
      success: 'Password changed. Other sessions were signed out.',
      onSuccess: () => {
        setCurrent('');
        setNext('');
      },
    },
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel eyebrow="Profile" title={user.name}>
        <p className="text-sm text-text-2">{user.email}</p>
        <p className="mt-1 text-xs text-text-3">
          Role: {user.role.name} · {user.permissions.length} permissions
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate({ currentPassword: current, newPassword: next });
          }}
        >
          <Field label="Current password">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>
          <Field label="New password" hint="At least 12 characters">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              loading={change.isPending}
              disabled={!current || next.length < 12}
            >
              Change password
            </Button>
          </div>
        </form>
      </Panel>

      <Panel eyebrow="Security" title="Signed-in sessions" bodyClassName="px-0">
        <PanelState query={sessions}>
          <ul className="divide-y divide-line/60">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{s.userAgent ?? 'Unknown device'}</p>
                  <p className="text-xs text-text-3">
                    {s.ip ?? 'unknown IP'} · last active {ago(s.lastSeenAt)}
                  </p>
                </div>
                {s.current ? (
                  <Badge tone="signal">This session</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate({ id: s.id })}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </PanelState>
      </Panel>

      <Panel eyebrow="Notifications" title="What NOVA tells me about" className="xl:col-span-2">
        <PanelState query={prefs}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(prefs.data ?? []).map((p) => (
              <li key={p.kind}>
                <Checkbox
                  label={p.label}
                  checked={p.inApp}
                  onChange={(e) =>
                    savePrefs.mutate({ preferences: [{ kind: p.kind, inApp: e.target.checked }] })
                  }
                />
              </li>
            ))}
          </ul>
        </PanelState>
      </Panel>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

function UsersSettings() {
  const users = useAdminUsers();
  const roles = useAdminRoles();
  const me = useUser();
  const [adding, setAdding] = useState(false);
  return (
    <Panel
      eyebrow="Access"
      title="Users"
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> User
        </Button>
      }
      bodyClassName="px-0"
    >
      <PanelState query={users}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left">
                {['Name', 'Role', 'Last sign-in', 'Sessions', 'Status', ''].map((h) => (
                  <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <UserRow key={u.id} u={u} roles={roles.data ?? []} isMe={u.id === me.id} />
              ))}
            </tbody>
          </table>
        </div>
      </PanelState>
      <NewUserDialog open={adding} onOpenChange={setAdding} roles={roles.data ?? []} />
    </Panel>
  );
}

function UserRow({ u, roles, isMe }: { u: UserView; roles: RoleView[]; isMe: boolean }) {
  const update = useApiMutation<{ roleId?: string; isActive?: boolean }, UserView>(
    'PATCH',
    `/admin/users/${u.id}`,
    {
      success: 'User updated',
    },
  );
  const revoke = useApiMutation<void, void>('DELETE', `/admin/users/${u.id}/sessions`, {
    success: 'Signed out everywhere',
  });
  return (
    <tr className="border-t border-line/60">
      <th scope="row" className="px-4 py-2 text-left font-normal">
        <span className="block font-medium">
          {u.name}
          {isMe ? ' (you)' : ''}
        </span>
        <span className="block text-xs text-text-3">{u.email}</span>
      </th>
      <td className="px-4 py-2">
        <Select
          aria-label={`Role for ${u.name}`}
          value={u.role.id}
          disabled={isMe || update.isPending}
          onChange={(e) => update.mutate({ roleId: e.target.value })}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-4 py-2 text-xs text-text-2">
        {u.lastLoginAt ? ago(u.lastLoginAt) : 'never'}
      </td>
      <td className="px-4 py-2 font-mono text-xs">{u.activeSessions}</td>
      <td className="px-4 py-2">
        <Badge tone={u.isActive ? 'signal' : 'neutral'}>
          {u.isActive ? 'Active' : 'Deactivated'}
        </Badge>
      </td>
      <td className="px-4 py-2 text-right">
        {!isMe ? (
          <div className="flex justify-end gap-1">
            {u.activeSessions > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(undefined)}>
                Sign out
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={u.isActive ? 'ghost' : 'secondary'}
              onClick={() => update.mutate({ isActive: !u.isActive })}
            >
              {u.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function NewUserDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: RoleView[];
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const create = useApiMutation<Record<string, string>, UserView>('POST', '/admin/users', {
    success: (u) => `${u.name} can now sign in`,
    onSuccess: () => {
      setName('');
      setEmail('');
      setPassword('');
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a user"
      description="Share the initial password privately; they can change it under My account."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name || !email || !roleId || password.length < 12}
            onClick={() => create.mutate({ name, email, roleId, password })}
          >
            Add user
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Email">
          {(p) => (
            <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Role">
          {(p) => (
            <Select {...p} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Choose a role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Initial password" hint="At least 12 characters">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

// ── Roles ─────────────────────────────────────────────────────────────────────

function RolesSettings({ editable }: { editable: boolean }) {
  const roles = useAdminRoles();
  const [selected, setSelected] = useState<string | null>(null);
  const role = roles.data?.find((r) => r.id === selected) ?? roles.data?.[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Panel eyebrow="Roles" title="Who can do what" bodyClassName="px-2">
        <PanelState query={roles}>
          <ul className="flex flex-col gap-0.5">
            {(roles.data ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  aria-current={role?.id === r.id}
                  className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${role?.id === r.id ? 'bg-surface-2 font-medium' : ''}`}
                >
                  <span className="truncate">{r.name}</span>
                  <span className="font-mono text-[10px] text-text-3">{r.userCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </PanelState>
      </Panel>
      {role ? <RoleMatrix key={role.id} role={role} editable={editable && !role.locked} /> : null}
    </div>
  );
}

function RoleMatrix({ role, editable }: { role: RoleView; editable: boolean }) {
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role.permissions));
  const dirty =
    perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));
  const save = useApiMutation<{ permissions: Permission[] }, RoleView>(
    'PATCH',
    `/admin/roles/${role.id}`,
    {
      success: (r) => `${r.name} updated — applies on each user’s next request`,
    },
  );
  const toggle = (p: Permission) =>
    setPerms((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  return (
    <Panel
      eyebrow={role.key}
      title={role.name}
      action={
        editable ? (
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => save.mutate({ permissions: [...perms] })}
          >
            Save changes
          </Button>
        ) : (
          <Badge>{role.locked ? 'Locked system role' : 'Read only'}</Badge>
        )
      }
    >
      {role.description ? <p className="mb-3 text-sm text-text-2">{role.description}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.group} className="rounded-[var(--radius-md)] border border-line p-3">
            <legend className="eyebrow px-1">{g.group}</legend>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((item) => (
                <li key={item.key}>
                  <Checkbox
                    label={item.label}
                    checked={perms.has(item.key)}
                    disabled={!editable}
                    onChange={() => toggle(item.key)}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </Panel>
  );
}

// ── Approval rules ────────────────────────────────────────────────────────────

function RulesSettings() {
  const rules = useApprovalRules();
  const update = useApiMutation<{ id: string; body: Record<string, unknown> }, unknown>(
    'PUT',
    (b) => `/admin/approval-rules/${b.id}`,
    { success: 'Rule updated', transform: (b) => b.body },
  );
  return (
    <Panel eyebrow="ADR-0010" title="Approval rules" bodyClassName="px-0">
      <p className="px-4 pb-3 text-sm text-text-2">
        A request needs every active step whose threshold its amount meets. With no matching rule,
        one default approval is still required — nothing is approved automatically.
      </p>
      <PanelState query={rules}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left">
                {['Applies to', 'Step', 'From amount', 'Approver needs', 'Active'].map((h) => (
                  <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rules.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="px-4 py-2">{APPROVAL_SUBJECT_LABELS[r.subject]}</td>
                  <td className="px-4 py-2">
                    {r.stepOrder}. {r.name}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {r.minAmount ? money(r.minAmount, { exact: true }) : 'any'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.permission}</td>
                  <td className="px-4 py-2">
                    <Checkbox
                      label={r.isActive ? 'On' : 'Off'}
                      checked={r.isActive}
                      onChange={(e) =>
                        update.mutate({
                          id: r.id,
                          body: {
                            subject: r.subject,
                            name: r.name,
                            minAmount: r.minAmount,
                            stepOrder: r.stepOrder,
                            permission: r.permission,
                            isActive: e.target.checked,
                          },
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelState>
    </Panel>
  );
}
