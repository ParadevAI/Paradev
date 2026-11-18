/**
 * Fresh credential rules for a running box. host-service asks on a timer with
 * the host secret it was booted with, which the API derives rather than
 * stores, so the box proves which workspace it is without holding anything the
 * API does not already know. The API also re-applies them itself when a
 * person's credential changes under boxes already running. The token itself
 * never leaves the API: the answer is a firewall policy update, not a value.
 */

import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sandboxHostSecretFor } from "./access";
import { buildSandboxClaim } from "./claim";
import { applySandboxPolicy } from "./vercel";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

export type RefreshSandboxCredentialsOutcome =
	| "applied"
	| "not-running"
	| "unauthorized"
	| "not-ready";

export async function reapplySandboxRules(
	row: CloudWorkspaceRow,
): Promise<"applied" | "not-running"> {
	const { claim } = await buildSandboxClaim({ row });
	return applySandboxPolicy({
		providerSandboxId: row.providerSandboxId,
		networkPolicy: claim.networkPolicy,
	});
}

export function awakeBoxesCreatedBy(
	userIds: string[],
): Promise<CloudWorkspaceRow[]> {
	return db
		.select()
		.from(cloudWorkspaces)
		.where(
			and(
				inArray(cloudWorkspaces.createdByUserId, userIds),
				eq(cloudWorkspaces.status, "awake"),
				isNull(cloudWorkspaces.deletedAt),
			),
		);
}

/** One box that cannot take the new rules keeps its old ones until its own refresh; the rest still get theirs. */
export async function reapplyRulesOfBoxesCreatedBy(
	userId: string,
): Promise<void> {
	const boxes = await awakeBoxesCreatedBy([userId]);
	await Promise.all(
		boxes.map((row) =>
			reapplySandboxRules(row).catch((error) => {
				Sentry.captureException(error, {
					tags: {
						"cloud_workspace.id": row.id,
						"organization.id": row.organizationId,
					},
				});
			}),
		),
	);
}

export async function refreshSandboxCredentials(args: {
	workspaceId: string;
	presentedSecret: string;
}): Promise<RefreshSandboxCredentialsOutcome> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, args.workspaceId),
	});
	if (!row?.providerSandboxId || row.status !== "awake") return "not-ready";
	return reapplySandboxRules(row);
}
