/**
 * VERIFICATION PLUMBING — never application code, never bundled.
 *
 * What `server-only` resolves to inside a command-line verifier, and nowhere
 * else. See _server-only-shim.cjs for why that is safe there and would not be
 * anywhere near a bundle.
 *
 * Deliberately empty. The real `server-only` package exports nothing either —
 * its whole job is to exist and to make a client build fail.
 */
module.exports = {};
