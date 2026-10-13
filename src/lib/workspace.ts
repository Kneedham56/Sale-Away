// The active business is kept in a cookie and sent to the database as the "x-workspace-id" header,
// where row-level security limits every query to that business (and only if the user belongs to it).
export const WORKSPACE_COOKIE = "sa_ws";
export const WORKSPACE_HEADER = "x-workspace-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validWorkspaceId(v: string | undefined | null): string | null {
  return v && UUID.test(v) ? v : null;
}
