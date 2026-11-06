import type { PageShareRole, SelectPage } from "@superset/db/schema";
import type {
	PageToolAccount,
	PageToolServerReply,
} from "@superset/shared/page-tools";
import {
	AmbiguousPluginError,
	PluginNotInstalledError,
	type PluginTarget,
	PluginTargetError,
} from "../../plugins/proxy";
import {
	type AccountRef,
	accountLabel,
} from "../../plugins/proxy/account-argument";
import { isPageReadable } from "../access";

export interface CallPageToolInput {
	pageId: string;
	userId: string;
	organizationId: string;
	plugin: string;
	tool: string;
	args: Record<string, unknown>;
}

export interface CallPageToolDeps {
	findGrant(
		pageId: string,
		userId: string,
		plugin: string,
	): Promise<{ connectionId: string | null } | null>;
	resolveTarget(request: {
		userId: string;
		organizationId: string | null;
		plugin: string;
		connectionId?: string | null;
	}): Promise<PluginTarget>;
	callTool(
		target: PluginTarget,
		tool: string,
		args: Record<string, unknown>,
	): Promise<unknown>;
	pluginInfo(
		userId: string,
		plugin: string,
	): Promise<{ label: string; accountless: boolean } | null>;
	pinGrant(
		pageId: string,
		userId: string,
		plugin: string,
		connectionId: string,
	): Promise<boolean>;
}

export function pageToolAccess(
	page: SelectPage | undefined,
	userId: string,
	shareRole: PageShareRole | null = null,
): "ok" | "not_found" {
	if (!page || page.takenDownAt || !isPageReadable(page, userId, shareRole)) {
		return "not_found";
	}
	return "ok";
}

function singleAccount(target: PluginTarget): AccountRef | null {
	if (target.kind !== "first-party" && target.kind !== "remote") return null;
	return target.account ?? null;
}

export function pinForGrant(target: PluginTarget): string | null {
	return singleAccount(target)?.connectionId ?? null;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const TOOL_ERROR_MAX_LENGTH = 1000;

function isToolError(result: unknown): result is { content?: unknown } {
	return (
		typeof result === "object" &&
		result !== null &&
		(result as { isError?: unknown }).isError === true
	);
}

function toolErrorMessage({ content }: { content?: unknown }): string {
	const text = Array.isArray(content)
		? content
				.flatMap((part) =>
					part?.type === "text" && typeof part.text === "string"
						? [part.text]
						: [],
				)
				.join("\n")
				.trim()
		: "";
	return text.slice(0, TOOL_ERROR_MAX_LENGTH) || "The tool reported an error";
}

type Resolved = { target: PluginTarget } | { reply: PageToolServerReply };

async function resolveGranted(
	deps: CallPageToolDeps,
	input: CallPageToolInput,
	pluginLabel: string,
	connectionId: string | null,
): Promise<Resolved> {
	const resolve = (id: string | null) =>
		deps.resolveTarget({
			userId: input.userId,
			organizationId: input.organizationId,
			plugin: input.plugin,
			connectionId: id,
		});

	let target: PluginTarget;
	try {
		target = await resolve(connectionId);
		if (target.kind === "needs-auth" && connectionId) {
			const remaining = await resolve(null);
			const account = singleAccount(remaining);
			if (account) {
				return {
					reply: {
						status: "needs_account",
						pluginLabel,
						accounts: [
							{
								connectionId: account.connectionId,
								label: accountLabel(account),
							},
						],
					},
				};
			}
			target = remaining;
		}
	} catch (error) {
		if (error instanceof PluginNotInstalledError) {
			return { reply: { status: "needs_install", pluginLabel } };
		}
		if (error instanceof AmbiguousPluginError) {
			return {
				reply: { status: "error", code: "invalid", message: errorText(error) },
			};
		}
		if (error instanceof PluginTargetError) {
			return {
				reply: {
					status: "error",
					code: "unavailable",
					message: errorText(error),
				},
			};
		}
		throw error;
	}

	if (target.kind === "needs-auth") {
		return {
			reply: {
				status: "needs_connection",
				pluginLabel,
				connectUrl: target.connectUrl,
			},
		};
	}
	if (target.kind === "multi") {
		const accounts: PageToolAccount[] = target.accounts.map((account) => ({
			connectionId: account.connectionId,
			label: accountLabel(account),
		}));
		return { reply: { status: "needs_account", pluginLabel, accounts } };
	}
	return { target };
}

export async function callPageTool(
	deps: CallPageToolDeps,
	input: CallPageToolInput,
): Promise<PageToolServerReply> {
	const plugin = await deps.pluginInfo(input.userId, input.plugin);
	if (plugin === null) {
		return { status: "error", code: "invalid", message: "Unknown plugin" };
	}
	const pluginLabel = plugin.label;
	const needsGrant: PageToolServerReply = plugin.accountless
		? { status: "needs_grant", pluginLabel, accountless: true }
		: { status: "needs_grant", pluginLabel };
	const grant = await deps.findGrant(input.pageId, input.userId, input.plugin);
	if (!grant) return needsGrant;

	let resolved = await resolveGranted(
		deps,
		input,
		pluginLabel,
		grant.connectionId,
	);
	if ("reply" in resolved) return resolved.reply;

	const pin = grant.connectionId ? null : pinForGrant(resolved.target);
	if (
		pin &&
		!(await deps.pinGrant(input.pageId, input.userId, input.plugin, pin))
	) {
		const saved = await deps.findGrant(
			input.pageId,
			input.userId,
			input.plugin,
		);
		if (!saved) return needsGrant;
		if (saved.connectionId !== pin) {
			resolved = await resolveGranted(
				deps,
				input,
				pluginLabel,
				saved.connectionId,
			);
			if ("reply" in resolved) return resolved.reply;
		}
	}

	try {
		const result = await deps.callTool(resolved.target, input.tool, input.args);
		if (isToolError(result)) {
			return {
				status: "error",
				code: "tool_error",
				message: toolErrorMessage(result),
			};
		}
		return { status: "ok", result };
	} catch (error) {
		return {
			status: "error",
			code: error instanceof PluginTargetError ? "unavailable" : "tool_error",
			message: errorText(error),
		};
	}
}
