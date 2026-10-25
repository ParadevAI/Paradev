import { env } from "@/lib/env";
import { pageSlugFromUrl } from "@/lib/page-links";
import { workspaceIdFromUrl } from "@/lib/workspace-links";

export function redirectSystemPath({
	path,
}: {
	path: string;
	initial: boolean;
}): string {
	const slug = pageSlugFromUrl(path, env.EXPO_PUBLIC_WEB_URL);
	if (slug !== null) return `/pages/${slug}`;
	const workspaceId = workspaceIdFromUrl(path, env.EXPO_PUBLIC_WEB_URL);
	if (workspaceId !== null)
		return `/workspace/${encodeURIComponent(workspaceId)}`;
	return path;
}
