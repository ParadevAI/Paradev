import { db } from "@superset/db/client";
import { cloudWorkspaces, members } from "@superset/db/schema";
import {
	SANDBOX_API_CREDENTIAL_HEADER,
	sandboxApiCredential,
} from "@superset/shared/sandbox-gate";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { env } from "../../env";
import {
	SandboxUnavailableError,
	sandboxHostSecretFor,
} from "../../lib/sandbox";
import { canOpenWorkspace } from "../cloud-workspace/access";
import {
	markSandboxUnavailable,
	wakeCloudWorkspace,
} from "../cloud-workspace/wake";

export interface TurnHost {
	url: string;
	bearer: string;
	workspaceId: string;
}

export interface TurnHostAccess {
	host: TurnHost;
	modelHeaders: Record<string, string>;
}

const noAccess = () =>
	new TRPCError({
		code: "FORBIDDEN",
		message: "Agent may not use this workspace.",
	});

/**
 * The box a turn's tools run on, woken. The agent needs its own grant, and a
 * person acting through it must still be able to open the box themselves.
 */
export async function resolveTurnHost(turn: {
	agentId: string;
	organizationId: string;
	actingUserId: string | null;
	cloudWorkspaceId: string;
}): Promise<TurnHostAccess> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, turn.cloudWorkspaceId),
	});
	if (!row || row.organizationId !== turn.organizationId) throw noAccess();

	const { rows } = await db.execute<{ allowed: number }>(
		sql`select authz.check_permission('agent', ${turn.agentId}, 'can_operate', 'cloud_workspace', ${row.id}) as allowed`,
	);
	if (rows[0]?.allowed !== 1) throw noAccess();

	if (turn.actingUserId) {
		const membership = await db.query.members.findFirst({
			where: and(
				eq(members.userId, turn.actingUserId),
				eq(members.organizationId, row.organizationId),
			),
		});
		if (!membership || !(await canOpenWorkspace(row, turn.actingUserId))) {
			throw noAccess();
		}
	}

	if (row.status === "deleted" || row.status === "failed") {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace is gone." });
	}
	if (row.status === "provisioning") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Workspace is still provisioning.",
		});
	}

	let hostTarget: string;
	try {
		({ hostTarget } = await wakeCloudWorkspace(row));
	} catch (error) {
		if (!(error instanceof SandboxUnavailableError)) throw error;
		await markSandboxUnavailable(row, error);
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace is gone." });
	}

	return {
		host: {
			url: hostTarget,
			bearer: await sandboxHostSecretFor(row.id),
			workspaceId: row.id,
		},
		modelHeaders: {
			[SANDBOX_API_CREDENTIAL_HEADER]: `${row.id}.${await sandboxApiCredential(env.SANDBOX_GATE_SECRET, row.id)}`,
		},
	};
}
