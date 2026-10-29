import { isOwnOriginTwin } from "@superset/shared/own-domains";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";

export type SupersetAppLink =
	| { kind: "page"; slug: string }
	| { kind: "task"; taskId: string }
	| { kind: "automation"; automationId: string }
	| { kind: "plugin"; pluginName: string }
	| { kind: "environment"; environmentId: string }
	| { kind: "workspace"; workspaceId: string }
	| { kind: "chat"; workspaceId: string; sessionId: string };

const ROUTES: [RegExp, (id: string) => SupersetAppLink][] = [
	[/^\/tasks\/([^/]+)\/?$/, (taskId) => ({ kind: "task", taskId })],
	[
		/^\/automations\/([^/]+)\/?$/,
		(automationId) => ({ kind: "automation", automationId }),
	],
	[/^\/plugins\/([^/]+)\/?$/, (pluginName) => ({ kind: "plugin", pluginName })],
	[
		/^\/environments\/([^/]+)\/?$/,
		(environmentId) => ({ kind: "environment", environmentId }),
	],
	[
		/^\/workspaces\/([^/]+)\/?$/,
		(workspaceId) => ({ kind: "workspace", workspaceId }),
	],
];

const PLAIN_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Chat ids reach the agent inside a shell command, so nothing else passes. */
export function isPlainId(value: string): boolean {
	return PLAIN_ID.test(value);
}

function decode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

export function parseSupersetAppLink(
	href: string,
	webUrl: string,
): SupersetAppLink | null {
	let url: URL;
	let web: URL;
	try {
		url = new URL(href);
		web = new URL(webUrl);
	} catch {
		return null;
	}
	if (!isOwnOriginTwin(url.origin, web.origin)) return null;
	const slug = parseSupersetPageUrl(href, webUrl);
	if (slug) return { kind: "page", slug };
	for (const [pattern, build] of ROUTES) {
		const segment = url.pathname.match(pattern)?.[1];
		if (!segment) continue;
		const link = build(decode(segment));
		const sessionId = url.searchParams.get("sessionId");
		return link.kind === "workspace" &&
			sessionId &&
			isPlainId(link.workspaceId) &&
			isPlainId(sessionId)
			? { kind: "chat", workspaceId: link.workspaceId, sessionId }
			: link;
	}
	return null;
}

/** The shareable link to one chat: its workspace, opened on that session. */
export function chatReferenceUrl(
	workspaceId: string,
	sessionId: string,
	webUrl: string,
): string {
	const url = new URL(`/workspaces/${encodeURIComponent(workspaceId)}`, webUrl);
	url.searchParams.set("sessionId", sessionId);
	return url.toString();
}
