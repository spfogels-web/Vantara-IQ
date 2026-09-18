/**
 * Stands in for the `server-only` package under Vitest.
 *
 * `server-only` exists to break the build if a server module is pulled into a
 * client bundle. Outside a bundler it has no condition to resolve against and
 * throws on import, which would make every server module untestable. The
 * protection it provides is a build-time one and is unaffected by this stub.
 */
export {};
