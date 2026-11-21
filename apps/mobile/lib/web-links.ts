import { env } from "@/lib/env";

export function workspaceShareUrl(workspaceId: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/workspaces/${workspaceId}`;
}

export function pageUrlForSlug(slug: string): string {
	return `${env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${slug}`;
}

export function webHost(): string {
	return new URL(env.EXPO_PUBLIC_WEB_URL).host;
}

/** Only `useUpgrade` may open this: the billing page sells plans and seats. */
export function billingSettingsUrl(organizationId: string | null): string {
	const url = new URL("/settings/billing", env.EXPO_PUBLIC_WEB_URL);
	if (organizationId) url.searchParams.set("organization", organizationId);
	return url.toString();
}
