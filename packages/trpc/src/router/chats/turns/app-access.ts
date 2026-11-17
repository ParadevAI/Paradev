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

export function turnApps(
	agent: Pick<AgentRow, "kind" | "ownerUserId" | "paradevAccess">,
	ownerName: string | null,
	webUrl: string,
): TurnApp[] {
	if (!mayUseParadev(agent)) return [];
	return [
		{
			name: PARADEV_APP,
			displayName: "Paradev",
			description: `your owner's Paradev: list projects and hosts, create workspaces, start coding agents and chat sessions in them, read their terminals, and manage tasks and automations. Everything you do there is done as your owner. Link a workspace in a reply as [its name](${webUrl.replace(/\/+$/, "")}/workspaces/<workspace id>).`,
			path: `apps/${PARADEV_APP}/mcp`,
			accounts: ownerName ? [ownerName] : [],
		},
	];
}

/**
 * The owner a box's request to Paradev's tools acts as. Refused for a
 * group's Dev, a Dev that left the chat, and a Dev whose owner did not
 * switch Paradev on.
 */
export async function paradevCaller(
	keys: BoxKeys,
	headers: Headers,
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
			"A group's Dev has no access to Paradev; ask a member's Dev that has it",
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
	if (!mayUseParadev(agent)) {
		throw new BoxRequestError(
			403,
			"not_selected",
			"Paradev isn't switched on for this Dev; its owner can switch it on in the Dev's settings",
		);
	}
	return {
		agentId: agent.id,
		organizationId: agent.organizationId,
		ownerUserId: agent.ownerUserId,
		askedByUserId: claims.userId,
		groupId: claims.groupId,
	};
}

export async function recordAppCall(
	caller: AppCaller,
	call: { tool: string; ok: boolean },
): Promise<void> {
	await db.insert(chatsAppCalls).values({
		organizationId: caller.organizationId,
		agentId: caller.agentId,
		ownerUserId: caller.ownerUserId,
		askedByUserId: caller.askedByUserId,
		groupId: caller.groupId,
		app: PARADEV_APP,
		tool: call.tool,
		ok: call.ok,
	});
}
