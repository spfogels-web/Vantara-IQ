import "server-only";

import type { PrismaClient } from "@prisma/client";

import { resolveOrg } from "@/lib/org-context";
import { clientFor } from "@/lib/org-registry";

/**
 * `prisma`, but pointed at whichever organisation the current request belongs
 * to.
 *
 * Every organisation is a separate database. Which one a query lands on is
 * therefore not a filter on a column — it is which connection the statement is
 * sent down, and it has to be decided per request, after the request exists.
 * Resolving it needs `headers()`, which is async. A module-level `const prisma`
 * cannot express that, and forty-nine files already import one.
 *
 * So `prisma` is a proxy. Property access is still synchronous — `prisma.project`
 * hands back a delegate immediately — but the delegate does not hold a client.
 * It resolves the organisation when the query is awaited, and sends the
 * statement down that organisation's connection.
 *
 * ## Why the delegates are lazy
 *
 * A Prisma query does not run when you call it; it runs when you await it.
 * `prisma.user.create({…})` with no `await` writes nothing. That is not an
 * incidental detail of Prisma's implementation, it is the behaviour this
 * codebase is written against, and a proxy that started work on the call would
 * change what unawaited code does. So the delegates return a promise that has
 * not started: the work begins on the first `then`.
 *
 * Keeping that property buys something else. `$transaction([...])` — the array
 * form — cannot work through an async proxy, because the statements would have
 * to exist before the organisation is known. A spike measured what happens if
 * they do: Prisma rejects the array *and the rows are already written*, because
 * eager promises run the moment they are constructed. A failure that has
 * already applied its side effects is the worst shape this could take, and it
 * would have hit nine write paths including assigning crews to projects and
 * creating an account from an invitation.
 *
 * Because the delegates are lazy, this proxy can refuse the array form before
 * any statement has run, and say why. Nothing is half-applied. The nine paths
 * were converted to the callback form in the preceding commit; this is the
 * guard that stops the tenth from being written.
 *
 * ## What is not solved here
 *
 * Nothing sets the organisation header yet, so every request resolves to the
 * incumbent and Fortitude is served exactly as before. Putting the
 * organisation on the session, and refusing a request that arrives without
 * one, is the next step. Until then `INCUMBENT_ORG` is the single named place
 * that fallback lives.
 */

/** Re-exported so call sites keep importing one thing. See db-schema.ts. */
export { DB_SCHEMA, table } from "@/lib/db-schema";

/**
 * The client for this request's organisation, resolved *now*.
 *
 * "Now" is the whole point, and it was worth a bug to learn. The organisation
 * lives in an AsyncLocalStorage frame (off the request path) or in the request
 * itself (on it). Both are properties of the context the call is *made* in. A
 * lazy query that waited until it was awaited to ask which organisation it
 * belonged to would ask from wherever the `await` happened — and
 *
 *     const rows = runWithOrg("apex", () => prisma.project.findMany());
 *     await rows;                       // ← frame has already exited
 *
 * resolved to the incumbent and quietly read the wrong company's projects. A
 * test caught it; nothing about the shape of that code looks wrong.
 *
 * So the organisation is bound when the method is called, synchronously, in
 * the caller's own context. Only the statement is deferred.
 */
function current(): Promise<PrismaClient> {
  // `resolveOrg()` reads the AsyncLocalStorage store before its first await,
  // so calling it here runs that read inside the caller's frame.
  const pending = resolveOrg().then(clientFor);
  // The failure is reported when the query is awaited. Without this, a query
  // that is built and never awaited would raise an unhandled rejection.
  pending.catch(() => {});
  return pending;
}

type AnyFn = (...args: unknown[]) => unknown;
type Indexable = Record<string, unknown>;

/**
 * A promise that has not started yet, matching how Prisma's own queries behave.
 *
 * `then`, `catch` and `finally` all start it, so it works anywhere a promise
 * works — `await`, `Promise.all`, a bare `.catch()`. Started at most once, so
 * awaiting the same value twice does not run the query twice.
 */
function lazy<T>(run: () => Promise<T>): Promise<T> {
  let started: Promise<T> | undefined;
  const start = () => (started ??= run());
  const thenable = {
    then: (onOk?: never, onErr?: never) => start().then(onOk, onErr),
    catch: (onErr?: never) => start().catch(onErr),
    finally: (onEnd?: never) => start().finally(onEnd),
    [Symbol.toStringTag]: "LazyPrismaPromise",
  };
  // Typed as a Promise because that is how it behaves and how every call site
  // uses it. It is not a real one — deliberately, see the note above.
  return thenable as unknown as Promise<T>;
}

/** One delegate object per model name. The client is still resolved per call. */
const delegates = new Map<string, unknown>();

function delegateFor(model: string): unknown {
  const cached = delegates.get(model);
  if (cached) return cached;

  const delegate = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== "string") return undefined;
        // `await prisma.project` should not be a thing anyone does, and a
        // `then` here would make the delegate itself thenable.
        if (method === "then") return undefined;
        return (...args: unknown[]) => {
          const bound = current();
          return lazy(async () => {
            const client = (await bound) as unknown as Indexable;
            const target = client[model] as Indexable | undefined;
            if (!target) throw new Error(`No such Prisma model: "${model}".`);
            const fn = target[method] as AnyFn | undefined;
            if (typeof fn !== "function") {
              throw new Error(`No such method: prisma.${model}.${method}().`);
            }
            return (await fn.apply(target, args)) as never;
          });
        };
      },
    },
  );

  delegates.set(model, delegate);
  return delegate;
}

/** `$queryRaw` and friends. Lazy for the same reason the model delegates are. */
const RAW = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]);

/** Connection management. Genuinely eager — there is no statement to defer. */
const EAGER = new Set(["$connect", "$disconnect"]);

function transaction(...args: unknown[]): unknown {
  if (Array.isArray(args[0])) {
    throw new Error(
      "prisma.$transaction([...]) cannot be used: the statements in the array would be " +
        "built before this request's organisation is known, so they would run outside " +
        "the transaction and outside any tenant routing — and a spike confirmed the rows " +
        "are written before Prisma rejects the array. Use the callback form instead: " +
        "prisma.$transaction(async (tx) => { … }), where `tx` is a real client already " +
        "bound to the right organisation.",
    );
  }
  // Eager, like Prisma's own callback form. `tx` inside the callback is a real
  // transaction client on the resolved organisation's connection, so
  // everything written against it behaves exactly as it always has.
  return (async () => {
    const client = (await current()) as unknown as Indexable;
    return (client.$transaction as AnyFn).apply(client, args);
  })();
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Symbols are how the runtime asks "are you a promise?", "what are you?".
    // Answering nothing keeps the proxy an ordinary object.
    if (typeof prop !== "string") return undefined;
    // Without this, `await prisma` would see a `then` and hang on a delegate.
    if (prop === "then") return undefined;

    if (prop === "$transaction") return transaction;

    if (RAW.has(prop)) {
      return (...args: unknown[]) => {
        const bound = current();
        return lazy(async () => {
          const client = (await bound) as unknown as Indexable;
          return (client[prop] as AnyFn).apply(client, args) as never;
        });
      };
    }

    if (EAGER.has(prop)) {
      return async (...args: unknown[]) => {
        const client = (await current()) as unknown as Indexable;
        return (client[prop] as AnyFn).apply(client, args);
      };
    }

    if (prop.startsWith("$")) {
      // Extensions, middleware, metrics. Not supported through the proxy
      // because each would need its own thought about which organisation it
      // applies to. Fails when called, loudly, rather than being undefined.
      return () => {
        throw new Error(
          `prisma.${prop}() is not available through the organisation proxy. ` +
            `If it is needed, decide first which organisation it applies to.`,
        );
      };
    }

    return delegateFor(prop);
  },

  // A proxy that claims to have properties it will not enumerate confuses
  // anything that inspects it. `in` still works via `get`.
  has(_target, prop) {
    return typeof prop === "string" && prop !== "then";
  },
});
