import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import type { ActiveAgentStatus } from "@superset/shared/agent-status";
import { and, eq, ne } from "drizzle-orm";
import { nudge } from "../realtime";
import { sandboxHostSecretFor } from "./access";
import { extendSandbox } from "./vercel";

/** A turn `working` for longer than this is taken as hung and stops keeping its box alive. */
export const WORKING_KEEPALIVE_CAP_MS = 4 * 60 * 60 * 1000;

export type ReportSandboxAgentStatusOutcome = "ok" | "unauthorized" | "unknown";

export async function reportSandboxAgentStatus(
	args: {
		workspaceId: string;
		presentedSecret: string;
		status: ActiveAgentStatus | null;
		at: number;
	},
	deps: {
		extend: (providerSandboxId: string) => Promise<Date | null>;
		now: () => number;
	} = { extend: extendSandbox, now: Date.now },
): Promise<ReportSandboxAgentStatusOutcome> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	const live = and(
		eq(cloudWorkspaces.id, args.workspaceId),
		ne(cloudWorkspaces.status, "deleted"),
	);
	const row = await db.query.cloudWorkspaces.findFirst({
		where: live,
		columns: {
			organizationId: true,
			status: true,
			providerSandboxId: true,
			agentStatus: true,
			agentStatusAt: true,
			sessionEndsAt: true,
		},
	});
	if (!row) return "unknown";
	// The box repeats `working` as a keepalive; the timestamp is when it started.
	if (row.agentStatus !== args.status) {
		await db
			.update(cloudWorkspaces)
			.set({ agentStatus: args.status, agentStatusAt: new Date(args.at) })
			.where(live);
		nudge(row.organizationId, "cloud_workspaces", {
			kind: "cloud_workspaces",
			workspaceId: args.workspaceId,
			agentStatus: args.status,
			agentStatusAt: args.at,
		});
	}
	const workingSince =
		row.agentStatus === "working" ? row.agentStatusAt?.getTime() : undefined;
	const hung =
		workingSince !== undefined &&
		deps.now() - workingSince > WORKING_KEEPALIVE_CAP_MS;
	if (args.status === "working" && row.status === "ready" && !hung) {
		const sessionEndsAt = await deps
			.extend(row.providerSandboxId)
			.catch((error: unknown) => {
				console.warn(
					`[sandbox-agent-status] extend failed for ${args.workspaceId}`,
					error,
				);
				return null;
			});
		if (
			sessionEndsAt &&
			sessionEndsAt.getTime() !== row.sessionEndsAt?.getTime()
		) {
			await db.update(cloudWorkspaces).set({ sessionEndsAt }).where(live);
		}
	}
	return "ok";
}
