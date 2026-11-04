/**
 * The scheduled renewal of every ChatGPT sign-in. A box renews the session
 * only as a side effect of asking for its rules, so without this a session
 * nobody uses lapses, and a renewal one box triggers leaves the person's other
 * boxes on the old token until their next keepalive.
 */
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { renewChatgptSignIns } from "../../router/agent-credential";
import { buildSandboxClaim } from "./claim";
import { applySandboxPolicy } from "./vercel";

export async function renewChatgptSignInsAndBoxes(args: {
	deadline: number;
}): Promise<{ checked: number; renewed: number; boxesUpdated: number }> {
	const { checked, renewedUserIds } = await renewChatgptSignIns(args);
	if (renewedUserIds.length === 0) {
		return { checked, renewed: 0, boxesUpdated: 0 };
	}
	const boxes = await db
		.select()
		.from(cloudWorkspaces)
		.where(
			and(
				inArray(cloudWorkspaces.createdByUserId, renewedUserIds),
				eq(cloudWorkspaces.status, "ready"),
				isNull(cloudWorkspaces.deletedAt),
			),
		);
	let boxesUpdated = 0;
	for (const row of boxes) {
		try {
			const { claim } = await buildSandboxClaim({ row });
			const outcome = await applySandboxPolicy({
				providerSandboxId: row.providerSandboxId,
				networkPolicy: claim.networkPolicy,
			});
			if (outcome === "applied") boxesUpdated++;
		} catch (error) {
			Sentry.captureException(error, { extra: { workspaceId: row.id } });
		}
	}
	return { checked, renewed: renewedUserIds.length, boxesUpdated };
}
