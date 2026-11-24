import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Context, Rbac } from '../core/types.js';
import type { Roles } from '../shared/roles.js';

interface RbacState {
  rbac: Rbac<any>;
  roles: Roles;
}

const RbacContext = createContext<RbacState | null>(null);

export interface RbacProviderProps<C extends Context = Context> {
  rbac: Rbac<C>;
  /** The current user's role(s), usually straight from your auth state. */
  roles: Roles;
  children?: ReactNode;
}

/** Makes `useCan` and `<Can>` work for everything inside. */
export function RbacProvider<C extends Context = Context>({ rbac, roles, children }: RbacProviderProps<C>) {
  const value = useMemo(() => ({ rbac, roles }), [rbac, roles]);
  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

/** Gives you `can(resource, action, ctx?)` for the current user. */
export function useCan() {
  const state = useContext(RbacContext);
  if (!state) throw new Error('rolegate: useCan must be used inside <RbacProvider>');
  return useCallback(
    (resource: string, action: string, ctx?: Context) => state.rbac.can(state.roles, resource, action, ctx),
    [state],
  );
}

export interface CanProps {
  resource: string;
  action: string;
  ctx?: Context;
  /** What to show when the answer is no. Nothing by default. */
  fallback?: ReactNode;
  children?: ReactNode;
}

/** Shows its children only if the current user can do the action. */
export function Can({ resource, action, ctx, fallback = null, children }: CanProps) {
  const can = useCan();
  return <>{can(resource, action, ctx) ? children : fallback}</>;
}
