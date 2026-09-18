/**
 * The name of the organisation seeded into the second test schema.
 *
 * Shared between the global setup that writes it and the proxy tests that
 * assert on it, so the two cannot drift apart and quietly turn a routing test
 * into a test that always passes.
 *
 * Deliberately not "Apex": this row stands in for *an* other organisation
 * while proving the routing layer, and Apex's own database is untouched in
 * this phase.
 */
export const SECOND_ORG_NAME = "Second Organisation (routing fixture)";
