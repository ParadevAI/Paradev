import { getHostWorkerPool } from "../../workers/host-worker-pool";
import {
	claudeUsageFileTask,
	harnessSessionUsageTask,
	harnessTranscriptTask,
} from "../../workers/tasks/harness";
import type { HarnessTranscript } from "./transcript";
import type { HarnessSessionRef } from "./types";
import type { HarnessSessionUsage } from "./usage";

/** `readClaudeUsageFile` on a host worker; a failure answers null. */
export async function readClaudeUsageFileOffLoop(
	path: string,
): Promise<HarnessSessionUsage | null> {
	try {
		return await getHostWorkerPool().run(claudeUsageFileTask, { path });
	} catch (error) {
		console.warn(`[harness-sessions] reading usage of ${path} failed:`, error);
		return null;
	}
}

/** `readHarnessSessionUsage` on a host worker; a failure answers null. */
export async function readHarnessSessionUsageOffLoop(
	ref: HarnessSessionRef,
): Promise<HarnessSessionUsage | null> {
	try {
		return await getHostWorkerPool().run(harnessSessionUsageTask, { ref });
	} catch (error) {
		console.warn(
			`[harness-sessions] reading usage of ${ref.agentId} session ${ref.sessionId} failed:`,
			error,
		);
		return null;
	}
}

/**
 * `readHarnessTranscript` on a host worker. A failure answers null so the
 * handoff falls back to the terminal stream rather than failing the dialog.
 */
export async function readHarnessTranscriptOffLoop(
	ref: HarnessSessionRef,
	maxChars: number,
): Promise<HarnessTranscript | null> {
	try {
		return await getHostWorkerPool().run(harnessTranscriptTask, {
			ref,
			maxChars,
		});
	} catch (error) {
		console.warn(
			`[harness-sessions] reading ${ref.agentId} session ${ref.sessionId} failed:`,
			error,
		);
		return null;
	}
}
