// harness/* worker tasks. A handoff reads the source agent's session file,
// which can run to hundreds of megabytes; the read and the JSON.parse of
// every line must stay off the host-service event loop.

import {
	type HarnessTranscript,
	readHarnessTranscript,
} from "../../terminal-agents/harness-sessions/transcript.ts";
import type { HarnessSessionRef } from "../../terminal-agents/harness-sessions/types.ts";
import {
	type HarnessSessionUsage,
	readClaudeUsageFile,
	readHarnessSessionUsage,
} from "../../terminal-agents/harness-sessions/usage.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const harnessTranscriptTask = defineWorkerTask<
	{ ref: HarnessSessionRef; maxChars: number },
	HarnessTranscript | null
>({
	type: "harness/readTranscript",
	handler: async ({ ref, maxChars }) => readHarnessTranscript(ref, maxChars),
});

export const harnessSessionUsageTask = defineWorkerTask<
	{ ref: HarnessSessionRef },
	HarnessSessionUsage | null
>({
	type: "harness/readSessionUsage",
	handler: async ({ ref }) => readHarnessSessionUsage(ref),
});

export const claudeUsageFileTask = defineWorkerTask<
	{ path: string },
	HarnessSessionUsage | null
>({
	type: "harness/readClaudeUsageFile",
	handler: async ({ path }) => readClaudeUsageFile(path),
});

export const harnessTasks = [
	harnessTranscriptTask,
	harnessSessionUsageTask,
	claudeUsageFileTask,
];
