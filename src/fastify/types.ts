import { rolesOfUser } from '../shared/adapter.js';
import type { Roles } from '../shared/roles.js';

/**
 * The bits of Fastify's request and reply we use, so rolegate doesn't depend
 * on Fastify. A real FastifyRequest and FastifyReply fit these.
 */
export interface FastifyRequestLike {
  method: string;
  url: string;
  user?: unknown;
}

export interface FastifyReplyLike {
  code(statusCode: number): FastifyReplyLike;
  send(payload?: unknown): FastifyReplyLike;
}

/** @fastify/jwt and most auth plugins put the user on request.user. */
export function defaultGetRoles(req: FastifyRequestLike): Roles {
  return rolesOfUser(req.user);
}
