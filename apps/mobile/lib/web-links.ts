import { env } from "@/lib/env";

export function workspaceShareUrl(workspaceId: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/workspaces/${workspaceId}`;
}

export function pageUrlForSlug(slug: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${slug}`;
}

/**
 * Where a plan is actually changed. The mobile app never sells a plan — the
 * organization's owner does it on the web. The web session has its own active
 * organization, so the link names the one this app is showing.
 */
export function billingSettingsUrl(organizationId?: string | null): string {
	const url = new URL("/settings/billing", env.EXPO_PUBLIC_WEB_URL);
	if (organizationId) url.searchParams.set("organization", organizationId);
	return url.toString();
}
