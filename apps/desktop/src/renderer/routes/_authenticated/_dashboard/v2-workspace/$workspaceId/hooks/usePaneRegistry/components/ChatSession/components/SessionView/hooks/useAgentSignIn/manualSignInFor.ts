import { isManualSignIn } from "@superset/shared/agent-credentials";

/**
 * A box runs on its creator's sign-ins, and only the creator's own settings
 * can be read here, so the answer is false in anyone else's box.
 */
export function manualSignInFor(args: {
	presetId: string | undefined;
	creatorUserId: string | null | undefined;
	userId: string | undefined;
	credentials: ReadonlyArray<{ agent: string; provider: string | null }>;
}): boolean {
	if (!args.presetId || !args.userId) return false;
	if (args.creatorUserId !== args.userId) return false;
	return args.credentials.some(
		(row) => row.agent === args.presetId && isManualSignIn(row),
	);
}
