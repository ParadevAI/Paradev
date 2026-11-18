/**
 * The scheduled renewal of every ChatGPT sign-in. A box renews the session
 * only as a side effect of asking for its rules, so without this a session
 * nobody uses lapses, and a renewal one box triggers leaves the person's other
 * boxes on the old token until their next keepalive.
 */

import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { agentCredentials } from "@superset/db/schema";
import { CHATGPT_PROVIDER } from "@superset/shared/agent-credentials";
import { and, eq, gt } from "drizzle-orm";
import { renewChatgptSignIns } from "../../router/agent-credential";
import {
	awakeBoxesCreatedBy,
	reapplySandboxRules,
} from "./refresh-credentials";

/**
 * Boxes of a sign-in saved this recently get its rules again. Read from the
 * rows rather than from this run's renewals, so a run that stops early, a
 * renewal a keepalive made, and a renewal whose save failed all come out
 * right on the next run.
 */
const RECENT_RENEWAL_MS = 3 * 60 * 60 * 1000;

export async function renewChatgptSignInsAndBoxes(args: {
	renewUntil: number;
	updateBoxesUntil: number;
}): Promise<{ checked: number; boxesUpdated: number; boxesLeft: number }> {
	const { checked } = await renewChatgptSignIns({ deadline: args.renewUntil });
	const recent = await db
		.select({ userId: agentCredentials.userId })
		.from(agentCredentials)
		.where(
			and(
				eq(agentCredentials.agent, "codex"),
				eq(agentCredentials.provider, CHATGPT_PROVIDER),
				gt(
					agentCredentials.lastValidatedAt,
					new Date(Date.now() - RECENT_RENEWAL_MS),
				),
			),
		);
	if (recent.length === 0) return { checked, boxesUpdated: 0, boxesLeft: 0 };
	const boxes = await awakeBoxesCreatedBy(recent.map((row) => row.userId));
	let boxesUpdated = 0;
	let done = 0;
	for (const row of boxes) {
		if (Date.now() > args.updateBoxesUntil) break;
		done++;
		try {
			if ((await reapplySandboxRules(row)) === "applied") boxesUpdated++;
		} catch (error) {
			Sentry.captureException(error, {
				tags: {
					"cloud_workspace.id": row.id,
					"organization.id": row.organizationId,
				},
			});
		}
	}
	return { checked, boxesUpdated, boxesLeft: boxes.length - done };
}
