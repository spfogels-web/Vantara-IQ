/**
 * The request header that carries the organisation from middleware to the
 * server components, route handlers and server actions below it.
 *
 * Its own module, with no imports, because middleware runs on the edge runtime
 * and `org-context` reaches for `node:async_hooks`. Both sides need the name
 * and neither should have to hardcode it.
 *
 * Middleware sets this from the signed session and deletes any copy that
 * arrived with the request. It is never something a client may assert.
 */
export const ORG_HEADER = "x-vq-org";
