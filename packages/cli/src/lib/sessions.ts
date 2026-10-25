import { boolean, CLIError, string } from "@superset/cli-framework";
import type { CliContext } from "./command";
import type { HostServiceClient, ResolvedHostTarget } from "./host-target";
import {
	type HostWorkspaceRow,
	resolveWorkspaceTarget,
} from "./host-workspaces";

type SessionsClient = Pick<
	HostServiceClient["sessions"],
	"create" | "list" | "get" | "read" | "send" | "close" | "resume"
>;
export type SessionPageResult = Awaited<
	ReturnType<SessionsClient["read"]["query"]>
>;
export type SessionDurableEnvelope = Extract<
	SessionPageResult,
	{ ok: true }
>["envelopes"][number];

export const sessionWorkspaceOptions = {
	workspace: string().required().desc("Workspace ID"),
	host: string().desc(
		"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
	),
	local: boolean().desc("The workspace is on this machine"),
};

export async function callSessions<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		if (
			error instanceof Error &&
			/No procedure found on path "?sessions\./.test(error.message)
		) {
			throw new CLIError(
				"This host is too old for `superset sessions` — update host-service",
				"Update host-service or the Superset desktop app on that host",
			);
		}
		throw error;
	}
}

function sessionsClient(client: HostServiceClient): SessionsClient {
	const raw = client.sessions;
	return {
		create: { mutate: (input) => callSessions(() => raw.create.mutate(input)) },
		list: { query: (input) => callSessions(() => raw.list.query(input)) },
		get: { query: (input) => callSessions(() => raw.get.query(input)) },
		read: { query: (input) => callSessions(() => raw.read.query(input)) },
		send: { mutate: (input) => callSessions(() => raw.send.mutate(input)) },
		close: { mutate: (input) => callSessions(() => raw.close.mutate(input)) },
		resume: { mutate: (input) => callSessions(() => raw.resume.mutate(input)) },
	};
}

export async function resolveSessionWorkspace(
	ctx: CliContext,
	options: { workspace: string; host?: string | null; local?: boolean | null },
): Promise<{
	workspace: HostWorkspaceRow;
	target: ResolvedHostTarget;
	sessions: SessionsClient;
}> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId)
		throw new CLIError("No active organization", "Run: superset auth login");
	const { workspace, target } = await resolveWorkspaceTarget(
		{
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		},
		options.workspace,
	);
	return { workspace, target, sessions: sessionsClient(target.client) };
}
