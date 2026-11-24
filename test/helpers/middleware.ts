import type { NextLike, ResponseLike } from '../../src/express/index.js';

type Middleware<Req> = (req: Req, res: ResponseLike, next: NextLike) => void;

export interface MiddlewareResult {
  status?: number;
  body?: unknown;
  nextCalled: boolean;
}

/**
 * Runs a middleware against a fake response and tells what it did:
 * which status it sent, with what body, or whether it called next().
 * Saves us from pulling in Express and supertest just to test two functions.
 */
export function run<Req>(mw: Middleware<Req>, req: Req): MiddlewareResult {
  const out: MiddlewareResult = { nextCalled: false };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
  };
  mw(req, res, () => { out.nextCalled = true; });
  return out;
}
