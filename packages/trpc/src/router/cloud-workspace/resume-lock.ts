import { dbWs } from "@superset/db/client";
import { sql } from "drizzle-orm";
import { type ResumeLock, SandboxNotReadyError } from "../../lib/sandbox";

/**
 * One caller at a time resumes a box: a transaction-scoped advisory lock,
 * held while the step runs. A second caller does not queue behind it; it
 * answers "still starting", and its retry sees the box as the first left it.
 */
export function sandboxResumeLock(providerSandboxId: string): ResumeLock {
	return (step) =>
		dbWs.transaction(async (tx) => {
			const result = await tx.execute(
				sql`select pg_try_advisory_xact_lock(hashtext(${`sandbox-resume:${providerSandboxId}`})) as locked`,
			);
			const [row] = result.rows as Array<{ locked: boolean }>;
			if (!row?.locked) throw new SandboxNotReadyError(providerSandboxId);
			return step();
		});
}
