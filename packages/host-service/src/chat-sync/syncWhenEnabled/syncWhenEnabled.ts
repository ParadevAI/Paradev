import type { ApiClient } from "../../types";
import type { ChatSync } from "../chatSync";

const RECHECK_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

type Schedule = (run: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (run, ms) => {
	const timer = setTimeout(run, ms);
	timer.unref?.();
	return () => clearTimeout(timer);
};

/**
 * Starts a box's chat sync once the API says its owner has it. Asks again
 * every hour, soon after a failed ask, so a new checkpoint gap from the API
 * reaches a box without a release.
 */
export function syncWhenEnabled(args: {
	chatSync: Pick<ChatSync, "start" | "setCheckpointGap">;
	api: Pick<ApiClient, "chatHistory">;
	schedule?: Schedule;
}): () => void {
	const schedule = args.schedule ?? defaultSchedule;
	let stopped = false;
	let stopSync: (() => void) | null = null;
	let cancel: (() => void) | null = null;

	const check = async () => {
		cancel = null;
		let next = RECHECK_MS;
		try {
			const { enabled, checkpointGapMs } =
				await args.api.chatHistory.syncEnabled.query();
			if (stopped) return;
			args.chatSync.setCheckpointGap(checkpointGapMs ?? null);
			if (enabled && !stopSync) stopSync = args.chatSync.start();
		} catch (error) {
			if (stopped) return;
			next = RETRY_MS;
			console.warn(
				"[chat-sync] could not ask whether to sync:",
				error instanceof Error ? error.message : error,
			);
		}
		cancel = schedule(() => void check(), next);
	};
	void check();

	return () => {
		stopped = true;
		cancel?.();
		stopSync?.();
	};
}
