// The same small set of rules for every framework binding, so their tests
// read alike and only differ in how a request is made.
import { createRbac, createRouteAccess } from '../../src/index.js';

export const rbac = createRbac({
  roles: {
    viewer: { allow: { posts: ['read'] } },
    editor: { extends: ['viewer'], allow: { posts: ['write', { action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
  },
});

export const apiAccess = createRouteAccess({
  roles: {
    guest: { allow: [{ path: '/login', methods: ['GET', 'POST'] }] },
    viewer: { allow: [{ path: '/api/posts/*', methods: ['GET'] }] },
    editor: { extends: ['viewer'], allow: [{ path: '/api/posts/:id', methods: ['PUT'] }] },
  },
});
