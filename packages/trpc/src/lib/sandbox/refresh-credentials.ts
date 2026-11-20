/**
 * What host-service from before event-driven rules still calls every 30
 * minutes. Boxes awake when that change shipped have no scheduled refresh
 * yet; this reapply schedules one. Removed with the host-service poll.
 */

import { timingSafeEqual } from "node:crypto";
import { sandboxHostSecretFor } from "./access";
import { reapplyRulesFor } from "./reapply-rules";

export type RefreshSandboxCredentialsOutcome =
	| "applied"
	| "not-running"
	| "unauthorized";

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
	const { applied, failed } = await reapplyRulesFor(
		{ cloudWorkspaceId: args.workspaceId },
		{ deadline: Date.now() + 30_000 },
	);
	if (failed)
		throw new Error(`re-applying the claim on ${args.workspaceId} failed`);
	return applied ? "applied" : "not-running";
}
