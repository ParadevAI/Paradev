import { db } from "@superset/db/client";
import {
	chatsAgents,
	chatsAppCalls,
	chatsGroupAgents,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { BoxRequestError, boxTurn } from "./box-auth";
import type { BoxKeys } from "./box-tokens";

/** The app a Dev reaches Paradev's own tools through. */
export const PARADEV_APP = "paradev";

/** Whose access a Dev's call uses, and who asked for the turn it is part of. */
export interface AppCaller {
	agentId: string;
	organizationId: string;
	ownerUserId: string;
	askedByUserId: string | null;
	groupId: string;
	/** `paradev`, or the name of one of the owner's plugins. */
	app: string;
}

/** What a turn tells the box about an app the Dev may use. */
export interface TurnApp {
	name: string;
	displayName: string;
	description: string;
	/** Where the app's tools are served, under the API's routes for boxes. */
	path: string;
	accounts: string[];
}

type AgentRow = typeof chatsAgents.$inferSelect;

/** A Dev acts in Paradev only as its owner, and only when the owner switched that on. A group's Dev has no owner. */
export const mayUseParadev = (
	agent: Pick<AgentRow, "kind" | "ownerUserId" | "paradevAccess">,
): agent is typeof agent & { ownerUserId: string } =>
	agent.kind !== "group" &&
	agent.kind !== "added" &&
	agent.ownerUserId !== null &&
	agent.paradevAccess;

/** The owner's plugins a Dev may use. A group's Dev has none. */
export const devPlugins = (
	agent: Pick<AgentRow, "kind" | "ownerUserId" | "plugins">,
): string[] =>
	agent.kind === "group" || agent.kind === "added" || !agent.ownerUserId
		? []
		: agent.plugins;

/** MCP server names take letters, digits, `_` and `-`. */
const pluginAppName = (plugin: string) =>
	`plugin-${plugin.replace(/[^A-Za-z0-9_-]/g, "-")}`;

const titled = (plugin: string) =>
	plugin
		.split(/[-_]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");

export function turnApps(
	agent: Pick<AgentRow, "kind" | "ownerUserId" | "paradevAccess" | "plugins">,
	ownerName: string | null,
	webUrl: string,
): TurnApp[] {
	const accounts = ownerName ? [ownerName] : [];
	const plugins: TurnApp[] = devPlugins(agent).map((plugin) => ({
		name: pluginAppName(plugin),
		displayName: titled(plugin),
		description: `your owner's ${titled(plugin)}, through their Paradev plugin. Everything you do there is done as your owner.`,
		path: `apps/plugins/${encodeURIComponent(plugin)}/mcp`,
		accounts,
	}));
	if (!mayUseParadev(agent)) return plugins;
	return [
		...plugins,
		{
			name: PARADEV_APP,
			displayName: "Paradev",
			description: `your owner's Paradev: list projects and hosts, create workspaces, start a chat session with a coding agent in one (\`sessions_create\`, which people can read and reply to from this chat) or a terminal agent (\`agents_create\`), read and message those sessions, and manage tasks and automations. Everything you do there is done as your owner. Link a workspace in a reply as [its name](${webUrl.replace(/\/+$/, "")}/workspaces/<workspace id>).`,
			path: `apps/${PARADEV_APP}/mcp`,
			accounts,
		},
	];
}

/**
 * The owner a box's request to an app's tools acts as: Paradev itself, or
 * one of the owner's plugins. Refused for a group's Dev, a Dev that left
 * the chat, and a Dev whose owner did not switch that app on.
 */
export async function appCaller(
	keys: BoxKeys,
	headers: Headers,
	app: string = PARADEV_APP,
): Promise<AppCaller> {
	const claims = await boxTurn(keys, headers);
	const [agent] = await db
		.select()
		.from(chatsAgents)
		.where(eq(chatsAgents.id, claims.agentId));
	if (!agent || agent.kind === "group" || agent.kind === "added") {
		throw new BoxRequestError(
			403,
			"no_apps",
			"A group's Dev has no connected apps; ask a member's Dev that has this one",
		);
	}
	const [link] = await db
		.select({ agentId: chatsGroupAgents.agentId })
		.from(chatsGroupAgents)
		.where(
			and(
				eq(chatsGroupAgents.groupId, claims.groupId),
				eq(chatsGroupAgents.agentId, agent.id),
			),
		);
	if (!link) {
		throw new BoxRequestError(
			403,
			"forbidden",
			"This Dev is no longer in the chat",
		);
	}
	const allowed =
		app === PARADEV_APP
			? mayUseParadev(agent)
			: devPlugins(agent).includes(app);
	if (!allowed || !agent.ownerUserId) {
		throw new BoxRequestError(
			403,
			"not_selected",
			`${app === PARADEV_APP ? "Paradev" : titled(app)} isn't switched on for this Dev; its owner can switch it on in the Dev's settings`,
		);
	}
	return {
		agentId: agent.id,
		organizationId: agent.organizationId,
		ownerUserId: agent.ownerUserId,
		askedByUserId: claims.userId,
		groupId: claims.groupId,
		app,
	};
}

/** `appCaller` for Paradev's own tools. */
export const paradevCaller = (keys: BoxKeys, headers: Headers) =>
	appCaller(keys, headers);

/** A host answers `{ workspace: { id } }`; the cloud answers the workspace's own row. */
export function createdWorkspaceId(result: unknown): string | null {
	if (!result || typeof result !== "object") return null;
	const { workspace, id } = result as {
		workspace?: { id?: unknown };
		id?: unknown;
	};
	const found = workspace?.id ?? id;
	return typeof found === "string" ? found : null;
}

export async function recordAppCall(
	caller: AppCaller,
	call: { tool: string; ok: boolean; result?: unknown },
): Promise<void> {
	await db.insert(chatsAppCalls).values({
		organizationId: caller.organizationId,
		agentId: caller.agentId,
		ownerUserId: caller.ownerUserId,
		askedByUserId: caller.askedByUserId,
		groupId: caller.groupId,
		app: caller.app,
		tool: call.tool,
		ok: call.ok,
		workspaceId:
			call.ok && caller.app === PARADEV_APP && call.tool === "workspaces_create"
				? createdWorkspaceId(call.result)
				: null,
	});
}
