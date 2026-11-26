# NestJS

`rolegate/nest` gives you a guard and a `@Permission()` decorator that go together. `@nestjs/common` isn't a dependency: the guard is a plain class with `canActivate()`, and the decorator doesn't need `reflect-metadata`. Works with Nest on Express and on Fastify, and from CommonJS, which is what most Nest projects compile to.

```ts
// permissions.ts
import { UnauthorizedException } from '@nestjs/common';
import { createRbac } from 'rolegate';
import { createNestGuard } from 'rolegate/nest';

export const rbac = createRbac({
  roles: {
    user: { allow: { posts: ['read', { action: 'delete', when: { authorId: { ref: 'userId' } } }] } },
    admin: { allow: { posts: ['read', 'delete'], users: ['manage'] } },
  },
});

export const { RolegateGuard, Permission } = createNestGuard({
  rbac,
  // Nest turns `false` into a 403. Give it a real 401 for users who aren't signed in.
  errors: { unauthorized: () => new UnauthorizedException() },
});
```

## Using it

Globally:

```ts
// main.ts
app.useGlobalGuards(new RolegateGuard());
```

Or per controller with `@UseGuards(RolegateGuard)`. Make sure your authentication guard runs first, so `req.user` is set.

Then mark handlers:

```ts
@Controller('posts')
export class PostsController {
  @Get()
  @Permission('posts', 'read')
  list() {}

  @Delete(':id')
  @Permission('posts', 'delete', {
    // can be async, so it can load the post
    getContext: async (req) => {
      const post = await db.post.findUnique({ where: { id: req.params.id } });
      return { userId: req.user?.id, authorId: post?.authorId };
    },
  })
  remove(@Param('id') id: string) {}
}

@Controller('admin/users')
@Permission('users', 'manage') // on a class: every handler in it
export class AdminUsersController {}
```

`@Permission()` checks the names against your rbac, so `@Permission('post', 'read')` is a type error.

Handlers without `@Permission()` pass. A method's decorator wins over the class's.

`getContext` inside a decorator can't use `this` or injected services, since decorators run before the controller exists. When the check needs a service, call `rbac.assert()` inside the handler instead:

```ts
@Delete(':id')
async remove(@Param('id') id: string, @Req() req) {
  const post = await this.posts.find(id);
  rbac.assert(req.user?.roles, 'posts', 'delete', { userId: req.user?.id, authorId: post.authorId });
  // ...
}
```

`assert()` throws `ForbiddenError`. Map it to a 403 with an exception filter, or throw `ForbiddenException` yourself after `rbac.can()`.

## Route rules for everything

If you'd rather describe access by path, pass route rules too. Then every request has to fit them, decorated or not:

```ts
export const { RolegateGuard, Permission } = createNestGuard({ rbac, access: apiAccess });
```

The guard checks `req.originalUrl` (Express) or `req.url` (Fastify), with the global prefix included.

## Options

| Option | What it does |
| --- | --- |
| `rbac` | the checker for `@Permission()` |
| `access` | route rules every request has to fit |
| `getRoles` | where the roles are. Default: `req.user.roles`, then `req.user.role` (what Passport sets). May be async |
| `errors` | `{ unauthorized, forbidden }`: functions that return what to throw instead of returning `false` |

The guard handles HTTP requests. For GraphQL or websockets, call `rbac.can()` in your resolvers and gateways.
