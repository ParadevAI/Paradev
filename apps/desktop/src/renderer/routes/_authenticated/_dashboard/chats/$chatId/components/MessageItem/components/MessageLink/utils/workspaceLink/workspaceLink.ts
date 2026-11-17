const WORKSPACE_LINK =
	/^(?:https?:\/\/[^/]+\/workspaces\/|superset:\/\/v2-workspace\/|paradev:\/\/v2-workspace\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#].*)?$/i;

/** The workspace a link points at, when it is a link to one. */
export function workspaceIdFromLink(href: string | undefined): string | null {
	return href ? (WORKSPACE_LINK.exec(href)?.[1] ?? null) : null;
}
