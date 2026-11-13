// accounts/* worker tasks. Sharing a profile's session state the first time
// renames every transcript in project dirs both homes have, which takes
// seconds on a heavy profile and must not block the host-service event loop.

import {
	shareClaudeSessionState,
	shareCodexSessionState,
} from "../../trpc/router/usage/session-share.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const shareSessionStateTask = defineWorkerTask<
	{ agent: "claude" | "codex"; profileDir: string; mainHome: string },
	void
>({
	type: "accounts/shareSessionState",
	handler: async ({ agent, profileDir, mainHome }) => {
		if (agent === "claude") shareClaudeSessionState(profileDir, mainHome);
		else shareCodexSessionState(profileDir, mainHome);
	},
});

export const accountTasks = [shareSessionStateTask];
