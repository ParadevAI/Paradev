import { mintUserJwt } from "@superset/auth/server";
import {
	buildHostRoutingKey,
	SUPERSET_USER_ID_HEADER,
} from "@superset/shared/host-routing";
import { env } from "../../../../env";
import {
	SandboxUnavailableError,
	sandboxHostSecretFor,
} from "../../../../lib/sandbox";
import {
	hostServiceMutation,
	RelayDispatchError,
	relayMutation,
} from "../../../automation/relay-client";
import { wakeCloudWorkspace } from "../../../cloud-workspace/wake";
import { CardUnavailable } from "../types";
import type { WorkspaceRecord } from "./supersetWorkspace";

/** The tRPC error code when host-service itself answered; null when the relay or the network did. */
function hostErrorCode(body: string): string | null {
	try {
		const parsed = JSON.parse(body) as {
			error?: { json?: { data?: { code?: unknown } } };
		};
		const code = parsed.error?.json?.data?.code;
		return typeof code === "string" ? code : null;
	} catch {
		return null;
	}
}

interface AgentRun {
	kind: "terminal";
	sessionId: string;
	label: string;
}

/**
 * One call to the host-service the workspace lives on, as the reader: the
 * cloud box through its own host-service, a machine through the relay. The
 * same procedures the desktop calls for that workspace, so the card sees
 * and does what the workspace's own panes do.
 */
export async function callWorkspaceHost<TInput, TOutput>(args: {
	record: WorkspaceRecord;
	userId: string;
	procedure: string;
	input: TInput;
	query?: boolean;
}): Promise<TOutput> {
	try {
		if (args.record.location === "cloud") {
			const row = args.record.row;
			if (row.status !== "ready")
				throw new CardUnavailable(
					"error",
					"That cloud workspace is not running",
				);
			return await hostServiceMutation<TInput, TOutput>(
				{
					baseUrl: (await wakeCloudWorkspace(row)).hostTarget,
					headers: {
						authorization: `Bearer ${await sandboxHostSecretFor(row.id)}`,
						[SUPERSET_USER_ID_HEADER]: args.userId,
					},
					query: args.query,
				},
				args.procedure,
				args.input,
			);
		}
		const row = args.record.row;
		return await relayMutation<TInput, TOutput>(
			{
				relayUrl: env.RELAY_URL,
				hostId: buildHostRoutingKey(row.organizationId, row.hostId),
				jwt: await mintUserJwt({
					userId: args.userId,
					organizationIds: [row.organizationId],
					scope: "inbox-card",
					ttlSeconds: 300,
				}),
				query: args.query,
			},
			args.procedure,
			args.input,
		);
	} catch (error) {
		if (error instanceof CardUnavailable) throw error;
		if (error instanceof SandboxUnavailableError)
			throw new CardUnavailable(
				"error",
				"That cloud workspace could not be woken",
			);
		if (error instanceof RelayDispatchError) {
			const cloud = args.record.location === "cloud";
			const hostCode = hostErrorCode(error.body);
			if (!hostCode)
				throw new CardUnavailable(
					"error",
					cloud
						? "That cloud workspace is not answering"
						: "The machine this workspace is on is offline",
				);
			console.error(
				`[inbox] workspace ${args.record.row.id} refused ${args.procedure}`,
				error,
			);
			if (args.procedure === "agents.run" && hostCode === "NOT_FOUND")
				throw new CardUnavailable(
					"error",
					"That agent is not set up in this workspace",
				);
			throw new CardUnavailable(
				"error",
				cloud
					? "That cloud workspace refused that request"
					: "The workspace's machine refused that request",
			);
		}
		if (error instanceof Error && error.name === "AbortError")
			throw new CardUnavailable(
				"error",
				"The workspace's machine did not answer",
			);
		console.error(
			`[inbox] could not reach workspace ${args.record.row.id} for ${args.procedure}`,
			error,
		);
		throw new CardUnavailable(
			"error",
			args.record.location === "cloud"
				? "That cloud workspace could not be reached"
				: "The machine this workspace is on could not be reached",
		);
	}
}

/**
 * A prompt to the agent in a workspace. Naming `continueTerminalId` delivers
 * into that running session when it is still the same agent; otherwise the
 * host starts a new one.
 */
export function sendToWorkspaceAgent(args: {
	record: WorkspaceRecord;
	userId: string;
	agent: string;
	prompt: string;
	continueTerminalId?: string;
}): Promise<AgentRun> {
	return callWorkspaceHost({
		record: args.record,
		userId: args.userId,
		procedure: "agents.run",
		input: {
			workspaceId: args.record.row.id,
			agent: args.agent,
			prompt: args.prompt,
			...(args.continueTerminalId
				? { continueTerminalId: args.continueTerminalId }
				: {}),
		},
	});
}
