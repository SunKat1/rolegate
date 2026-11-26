import type { RouteAccess } from '../routes/types.js';
import { normalizePath } from '../routes/matching/path.js';
import { hasNoRoles, read, upperSet } from '../shared/adapter.js';
import type { Source } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

/** What we need from a request. NextRequest has it, and so does a plain Fetch API Request. */
export interface FetchRequestLike {
  method: string;
  url: string;
  nextUrl?: { pathname: string };
}

export interface GuardRequestOptions<Req extends FetchRequestLike = FetchRequestLike> {
  /**
   * Where the user's roles come from. Next has no `req.user`, so this one is up
   * to you: read a session cookie, decode a JWT, call your auth library.
   */
  getRoles: (req: Req) => Roles | Promise<Roles>;
  /** Which path to check. Default: `req.nextUrl.pathname`, or the path of `req.url`. */
  getPath?: (req: Req) => string;
  /** Methods to let through without a check, e.g. `['OPTIONS']`. */
  skipMethods?: readonly string[];
  /** Send signed-out users here (e.g. '/login') instead of answering 401. */
  loginUrl?: string;
  /** Send users without access here (e.g. '/forbidden') instead of answering 403. */
  forbiddenUrl?: string;
}

/**
 * For Next.js middleware (or `proxy.ts` in Next 16), or anything else built on
 * the Fetch API:
 *
 *   const guard = guardRequest(pages, { getRoles: readRolesFromCookie, loginUrl: '/login' });
 *   export async function middleware(req: NextRequest) {
 *     return (await guard(req)) ?? NextResponse.next();
 *   }
 *
 * Resolves to a Response (401/403 or a redirect) when the request has to stop,
 * and to undefined when it may go on.
 */
export function guardRequest<Req extends FetchRequestLike = FetchRequestLike>(
  access: Source<RouteAccess>,
  options: GuardRequestOptions<Req>,
) {
  const getPath = options.getPath ?? defaultGetPath;
  const skip = upperSet(options.skipMethods);

  return async (req: Req): Promise<Response | undefined> => {
    if (skip.has(req.method.toUpperCase())) return undefined;

    const path = getPath(req);
    const roles = await options.getRoles(req);

    if (hasNoRoles(roles)) return stop(req, path, options.loginUrl, 401, { error: 'Unauthorized' });
    if (!read(access).can(roles, path, req.method)) {
      return stop(req, path, options.forbiddenUrl, 403, { error: 'Forbidden', path, method: req.method });
    }
    return undefined;
  };
}

function defaultGetPath(req: FetchRequestLike): string {
  return req.nextUrl?.pathname ?? new URL(req.url).pathname;
}

function stop(req: FetchRequestLike, path: string, redirectTo: string | undefined, status: number, body: object): Response {
  if (redirectTo) {
    const target = new URL(redirectTo, req.url);
    // already on the login page and still not allowed there: a redirect would loop forever
    if (normalizePath(target.pathname) !== normalizePath(path)) return Response.redirect(target, 307);
  }
  return Response.json(body, { status });
}
