/**
 * VERIFICATION PLUMBING — never application code, never bundled.
 *
 * Nothing under src/ may import this, and nothing that reaches a browser may
 * come near it. It is loaded with `--require` by a command-line verifier and
 * exists for exactly one reason.
 *
 * `src/lib/org-registry.ts` begins with `import "server-only"`. That marker is
 * doing real work: it makes a build fail if a client component ever pulls the
 * module in, and that module holds every tenant's connection string. It must
 * stay exactly where it is.
 *
 * A tsx verifier is neither a client nor a bundle — it is the server, run from
 * a terminal, with no bundler to interpret the marker. Without this shim the
 * import throws and the only way to test the routing would be to reimplement
 * it in the test, which would prove that the copy works and say nothing about
 * what the application does. So the marker resolves to an empty module here,
 * and the verifier exercises the real `clientFor`.
 *
 * If this file ever appears in a webpack/turbopack config, a next.config entry,
 * or an import from src/, that is a defect: the protection it stands down is
 * the one keeping connection strings out of the browser.
 */
const Module = require("node:module");

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./_server-only-empty.cjs");
  return resolve.call(this, request, ...rest);
};
