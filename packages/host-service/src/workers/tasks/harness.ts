// harness/* worker tasks. A handoff reads the source agent's session file,
// which can run to hundreds of megabytes; the read and the JSON.parse of
// every line must stay off the host-service event loop.

import {
	type BundleManifest,
	teleportProviderFor,
	teleportProviderForAgent,
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

/** Puts a moved session's files where its agent looks, paths rewritten. */
export const harnessPlaceSessionTask = defineWorkerTask<
	({ harness: string } | { terminalAgent: string }) & {
		manifest: BundleManifest;
		worktreePath: string;
		env: HarnessEnv;
		stageDir: string;
	},
	void
>({
	type: "harness/placeSession",
	handler: async (input) => {
		const owner =
			"terminalAgent" in input ? input.terminalAgent : input.harness;
		const provider =
			"terminalAgent" in input
				? teleportProviderForAgent(input.terminalAgent)
				: teleportProviderFor(input.harness);
		if (!provider) throw new Error(`No teleport provider for ${owner}`);
		await provider.place({
			manifest: input.manifest,
			worktreePath: input.worktreePath,
			env: input.env,
			stageDir: input.stageDir,
		});
	},
});

export const harnessTasks = [
	harnessTranscriptTask,
	harnessSessionFileTask,
	harnessPlaceSessionTask,
];
