import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import { CLIError } from "@superset/cli-framework";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { getHostId } from "@superset/shared/host-info";
import {
	createSandboxAccess,
	type SandboxGrant,
} from "@superset/shared/sandbox/access";
import { callWithWake } from "@superset/shared/sandbox/reach";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";
import type { ApiClient } from "../api-client";
import type {
	HostServiceClient,
	ResolvedHostTarget,
} from "./resolveHostTarget";

type HostWorkspaceRows = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>;

type Ticket = SandboxGrant;

/** A stopped sandbox behind a cached ticket should fail over to a wake, not hang. */
const REACH_TIMEOUT_MS = 8_000;

class NoAnswerError extends Error {
	constructor(workspaceId: string, cause: unknown) {
		super(
			`Cloud workspace ${workspaceId} did not answer: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause },
		);
	}
}

function ticketsPath(): string {
	return join(resolveAppHomeDir(), "cloud-workspace-tickets.json");
}

/**
 * host-service inside a cloud workspace's sandbox, reached through the gate
 * with a ticket. The box answers in tens of milliseconds; asking the API to
 * wake it costs seconds, so the ticket from the last call is tried first,
 * then a ticket for the sandbox's last known address (no provider call), and
 * only then a wake — for a stopped sandbox, or one whose address moved.
 */
export async function resolveCloudWorkspaceTarget(options: {
	api: ApiClient;
	organizationId: string;
	workspaceId: string;
}): Promise<{ target: ResolvedHostTarget; workspaces: HostWorkspaceRows }> {
	const key = `${options.organizationId}:${options.workspaceId}`;
	const access = createSandboxAccess<Ticket>((id, wake) =>
		askApi(options, () =>
			wake
				? options.api.cloudWorkspace.access.mutate({ id, wake: true })
				: options.api.cloudWorkspace.hostTicket.mutate({ id }),
		),
	);
	return callWithWake({
		access,
		workspaceId: options.workspaceId,
		cached: readTickets()[key] ?? null,
		call: async (ticket) => {
			const reached = await reach(options.workspaceId, ticket);
			saveTicket(key, ticket);
			return reached;
		},
		isUnanswered: (error) => error instanceof NoAnswerError,
	});
}

async function reach(
	workspaceId: string,
	ticket: Ticket,
): Promise<{
	target: ResolvedHostTarget;
	workspaces: HostWorkspaceRows;
}> {
	const target = targetFor(workspaceId, ticket);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const workspaces = await Promise.race([
			target.client.workspace.list.query(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("no answer")),
					REACH_TIMEOUT_MS,
				);
			}),
		]);
		return { target, workspaces };
	} catch (error) {
		throw new NoAnswerError(workspaceId, error);
	} finally {
		clearTimeout(timer);
	}
}

async function askApi(
	options: { workspaceId: string },
	request: () => Promise<{ url: string; token: string; expiresAt: Date }>,
): Promise<Ticket> {
	try {
		const access = await request();
		return {
			url: access.url,
			token: access.token,
			expiresAt: new Date(access.expiresAt).getTime(),
		};
	} catch (error) {
		if (!(error instanceof TRPCClientError)) throw error;
		const code = error.data?.code;
		if (code === "NOT_FOUND") {
			throw new CLIError(
				`No cloud workspace ${options.workspaceId} in this organization`,
				"Pass --local for a workspace on this machine, or --host <id> for another host",
			);
		}
		throw new CLIError(
			`Cloud workspace ${options.workspaceId}: ${error.message}`,
			code === "TIMEOUT"
				? "The sandbox is still starting; try again in a few seconds"
				: "Check it with: superset workspaces list",
		);
	}
}

function targetFor(workspaceId: string, ticket: Ticket): ResolvedHostTarget {
	return {
		kind: "cloud",
		hostId: `cloud:${workspaceId}`,
		client: createTRPCClient<HostServiceRouter>({
			links: [
				httpBatchLink({
					url: `${ticket.url}/trpc`,
					transformer: SuperJSON,
					headers: {
						Authorization: `Bearer ${ticket.token}`,
						"x-superset-client-machine-id": getHostId(),
					},
				}),
			],
		}),
		ws: {
			baseWsUrl: ticket.url.replace(/^http/, "ws"),
			token: ticket.token,
		},
	};
}

function readTickets(): Record<string, Ticket> {
	const path = ticketsPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return {};
	}
}

function saveTicket(key: string, ticket: Ticket): void {
	const now = Date.now();
	const kept = Object.fromEntries(
		Object.entries(readTickets()).filter(([, entry]) => entry.expiresAt > now),
	);
	kept[key] = {
		url: ticket.url,
		token: ticket.token,
		expiresAt: ticket.expiresAt,
	};
	const path = ticketsPath();
	try {
		writeFileSync(path, JSON.stringify(kept), { mode: 0o600 });
		chmodSync(path, 0o600);
	} catch {
		// A ticket that cannot be cached is minted again next call.
	}
}
