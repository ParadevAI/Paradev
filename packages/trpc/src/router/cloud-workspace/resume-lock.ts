import { dbWs } from "@superset/db/client";
import { sql } from "drizzle-orm";
import { type ResumeLock, SandboxBusyError } from "../../lib/sandbox";

/** How long a provision waits for another holder before it requeues itself. */
const PROVISION_LOCK_WAIT = "20s";

/**
 * One caller at a time resumes or creates a box on this key: the drive's name
 * when there is one, since a drive has one writer whatever the box is
 * called, else the box's. A transaction-scoped advisory lock, held while the
 * step runs. Another holder throws SandboxBusyError: a wake answers "still
 * starting" at once, and its retry sees the box as the first left it; a
 * provision waits a moment, then requeues itself rather than fail its row.
 */
export function sandboxResumeLock(
	key: string,
	{ wait = false }: { wait?: boolean } = {},
): ResumeLock {
	const lockKey = `sandbox-resume:${key}`;
	return (step) =>
		dbWs.transaction(async (tx) => {
			if (wait) {
				await tx.execute(
					sql`select set_config('lock_timeout', ${PROVISION_LOCK_WAIT}, true)`,
				);
				await tx
					.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`)
					.catch(() => {
						throw new SandboxBusyError(key);
					});
				return step();
			}
			const result = await tx.execute(
				sql`select pg_try_advisory_xact_lock(hashtext(${lockKey})) as locked`,
			);
			const [row] = result.rows as Array<{ locked: boolean }>;
			if (!row?.locked) throw new SandboxBusyError(key);
			return step();
		});
}
