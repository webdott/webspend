import { createContext, useContext } from 'react';
import type { User } from '@webspend/shared';

export const UserContext = createContext<User | null>(null);

/** The signed-in user. Only valid inside the Shell. */
export function useUser(): User {
  const u = useContext(UserContext);
  if (!u) throw new Error('useUser used outside the signed-in shell');
  return u;
}

export function showsUsd(user: User): boolean {
  return user.defaultCurrency !== 'USD' && user.showUsdEquivalent;
}
