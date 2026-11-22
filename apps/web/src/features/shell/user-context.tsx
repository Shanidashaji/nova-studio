'use client';

import { canSeeProjectMoney, type Permission, type SessionUser } from '@nova/shared';
import { createContext, useContext } from 'react';

const UserContext = createContext<SessionUser | null>(null);

export function UserProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser must be used inside the workspace.');
  return user;
}

/** UI-side permission check. The API enforces the same rules; this only hides unusable controls. */
export function useCan(permission: Permission): boolean {
  return useUser().permissions.includes(permission);
}

/** Whether this user is sent what productions cost (the API applies the same shared rule). */
export function useCanSeeProjectMoney(): boolean {
  return canSeeProjectMoney(useUser().permissions);
}
