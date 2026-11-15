import { env } from "@/lib/env";

export function workspaceShareUrl(workspaceId: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/workspaces/${workspaceId}`;
}

export function pageUrlForSlug(slug: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${slug}`;
}
