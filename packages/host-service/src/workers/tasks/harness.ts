// harness/* worker tasks. A handoff reads the source agent's session file,
// which can run to hundreds of megabytes; the read and the JSON.parse of
// every line must stay off the host-service event loop.

import {
	type BundleManifest,
	teleportProviderFor,
} from "../../teleport/providers/index.ts";
import {
	type HarnessTranscript,
	locateHarnessSessionFile,
	readHarnessTranscript,
} from "../../terminal-agents/harness-sessions/transcript.ts";
import type {
	HarnessEnv,
	HarnessSessionRef,
} from "../../terminal-agents/harness-sessions/types.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const harnessTranscriptTask = defineWorkerTask<
	{ ref: HarnessSessionRef; maxChars: number },
	HarnessTranscript | null
>({
	type: "harness/readTranscript",
	handler: async ({ ref, maxChars }) => readHarnessTranscript(ref, maxChars),
});

export const harnessSessionFileTask = defineWorkerTask<
	{ ref: HarnessSessionRef },
	string | null
>({
	type: "harness/locateSessionFile",
	handler: async ({ ref }) => locateHarnessSessionFile(ref),
});

/** Puts a moved chat's session files where its agent looks, paths rewritten. */
export const harnessPlaceSessionTask = defineWorkerTask<
	{
		harness: string;
		manifest: BundleManifest;
		worktreePath: string;
		env: HarnessEnv;
		stageDir: string;
	},
	void
>({
	type: "harness/placeSession",
	handler: async ({ harness, ...input }) => {
		const provider = teleportProviderFor(harness);
		if (!provider) throw new Error(`No teleport provider for ${harness}`);
		await provider.place(input);
	},
});

export const harnessTasks = [
	harnessTranscriptTask,
	harnessSessionFileTask,
	harnessPlaceSessionTask,
];
