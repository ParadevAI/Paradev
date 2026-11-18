import { randomBytes } from "node:crypto";

/**
 * A later box for the same row. Vercel refuses a deleted sandbox's name
 * with `image_not_ready` for a few minutes after the delete.
 */
export function nextSandboxNameFor(cloudWorkspaceId: string): string {
	const prefix = cloudWorkspaceId.replaceAll("-", "").slice(0, 16);
	return `ws-${prefix}${randomBytes(4).toString("hex")}`;
}
