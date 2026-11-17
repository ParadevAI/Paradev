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
 * Starts a box's chat sync once the API says its owner has it, asking again
 * every hour while they do not and soon after a failed ask.
 */
export function syncWhenEnabled(args: {
	chatSync: Pick<ChatSync, "start">;
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
			const { enabled } = await args.api.chatHistory.syncEnabled.query();
			if (stopped) return;
			if (enabled) {
				stopSync = args.chatSync.start();
				return;
			}
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
