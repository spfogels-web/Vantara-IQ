/**
 * Where an organisation's files live in the blob store.
 *
 * One Vercel Blob store serves every organisation, and every object in it is
 * public-read. Nothing leaks by listing — you need the URL — but without an
 * organisation in the path, two contractors' files sit in one flat namespace
 * distinguished only by the ids inside their own databases. Those ids are
 * unique per database, not across them: two organisations can hold a project
 * with the same id, and `project-photos/<id>/…` would then be the same folder
 * for both.
 *
 * So the path carries the organisation, and the upload token checks it against
 * the organisation on the request. Neither half is sufficient alone: the
 * prefix without the check is a convention, and the check without the prefix
 * has nothing to check.
 *
 * No `server-only` here: the browser builds the path it uploads to, so this
 * has to be importable from both sides. It is a string function and knows
 * nothing.
 */

/** The folder every one of an organisation's files sits under. */
export function orgBlobPrefix(orgId: string): string {
  return `org/${orgId}/`;
}

/**
 * Split a stored pathname into its organisation and the rest.
 *
 * Returns null for a path with no organisation on it — which is every file
 * uploaded before this existed. Those keep working: they are read by absolute
 * URL from a row in one organisation's own database, so the database they came
 * from is already the only one that can find them.
 */
export function splitOrgBlobPath(pathname: string): { orgId: string; rest: string } | null {
  if (!pathname.startsWith("org/")) return null;
  const rest = pathname.slice("org/".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { orgId: rest.slice(0, slash), rest: rest.slice(slash + 1) };
}
