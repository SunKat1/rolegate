import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { RouteAccess } from '../routes/types.js';
import type { Roles } from '../shared/roles.js';

interface RouteState {
  access: RouteAccess;
  roles: Roles;
}

const RouteAccessContext = createContext<RouteState | null>(null);

export interface RouteAccessProviderProps {
  access: RouteAccess;
  /** The current user's role(s). For guests, pass something like 'guest'. */
  roles: Roles;
  children?: ReactNode;
}

/**
 * Makes `useCanVisit` and `<CanVisit>` work for everything inside.
 *
 * If you load page permissions from the server, just pass a new `access`
 * object when they change. Everything below re-renders with the new rules.
 */
export function RouteAccessProvider({ access, roles, children }: RouteAccessProviderProps) {
  const value = useMemo(() => ({ access, roles }), [access, roles]);
  return <RouteAccessContext.Provider value={value}>{children}</RouteAccessContext.Provider>;
}

/** Gives you `canVisit(path)` for the current user. Handy for filtering menus. */
export function useCanVisit() {
  const state = useContext(RouteAccessContext);
  if (!state) throw new Error('rolegate: useCanVisit must be used inside <RouteAccessProvider>');
  return useCallback((path: string) => state.access.can(state.roles, path), [state]);
}

export interface CanVisitProps {
  path: string;
  /** What to show when the user can't open this page. Nothing by default. */
  fallback?: ReactNode;
  children?: ReactNode;
}

/** Shows its children only if the current user can open `path`. Good for links and menu items. */
export function CanVisit({ path, fallback = null, children }: CanVisitProps) {
  const canVisit = useCanVisit();
  return <>{canVisit(path) ? children : fallback}</>;
}
