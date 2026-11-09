import { rawErrorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { WorkspaceMoveToast } from "../../components/WorkspaceMoveToast";
import {
	useWorkspaceMoveProgressStore,
	type WorkspaceMoveProgressStage,
} from "../../stores/workspaceMoveProgressStore";

const POLL_MS = 2_000;
/** Longer than a stuck move takes to fail on its own. */
const GIVE_UP_MS = 15 * 60 * 1000;
const MAX_MISSED_READS = 5;
const SUCCESS_LINGER_MS = 5_000;

export interface WorkspaceMoveProgressHandle {
	/** Aborts when the person cancels the move from the toast. */
	signal: AbortSignal;
	setStage: (stage: "saving" | "creating") => void;
	/** Follows the move's chats into this workspace until the move ends. */
	follow: (toWorkspaceId: string) => void;
	fail: (message: string) => void;
}

/** Shows a move's progress in a toast at the bottom until it ends. */
export function startWorkspaceMoveProgress(args: {
	name: string;
	destination: string;
	retry?: () => void;
}): WorkspaceMoveProgressHandle {
	const id = `workspace-move-${crypto.randomUUID()}`;
	const controller = new AbortController();
	const current = () => useWorkspaceMoveProgressStore.getState().moves[id];
	const update = useWorkspaceMoveProgressStore.getState().update;
	const dismiss = () => {
		toast.dismiss(id);
		useWorkspaceMoveProgressStore.getState().remove(id);
	};
	const { retry } = args;
	useWorkspaceMoveProgressStore.getState().start({
		id,
		name: args.name,
		destination: args.destination,
		stage: "saving",
		chats: null,
		error: null,
		failedDuring: null,
		retry: retry
			? () => {
					dismiss();
					retry();
				}
			: null,
		cancel: () => {
			controller.abort();
			update(id, { stage: "cancelled", cancel: null });
		},
	});
	toast.custom(() => <WorkspaceMoveToast moveId={id} />, {
		id,
		duration: Number.POSITIVE_INFINITY,
	});

	const finish = (stage: WorkspaceMoveProgressStage) => {
		if (stage !== "ready") return;
		setTimeout(dismiss, SUCCESS_LINGER_MS);
	};

	return {
		signal: controller.signal,
		setStage: (stage) => {
			if (current()?.stage === "cancelled") return;
			update(id, { stage });
		},
		fail: (message) => {
			const move = current();
			if (!move || move.stage === "cancelled") return;
			update(id, {
				stage: "failed",
				error: message,
				failedDuring: move.stage,
				cancel: null,
			});
		},
		follow: (toWorkspaceId) => {
			update(id, { stage: "moving-chats", cancel: null });
			const startedAt = Date.now();
			let missed = 0;
			const poll = async () => {
				if (!current()) return;
				const latest = await cloudTrpcClient.workspaceMove.latest
					.query({ workspaceId: toWorkspaceId })
					.catch((error: unknown) => {
						console.warn(
							"[workspace-move] could not read the move's progress",
							rawErrorMessage(error),
						);
						return undefined;
					});
				if (latest && latest.toWorkspaceId === toWorkspaceId) {
					missed = 0;
					const ended = endedStage(latest.status);
					update(id, {
						chats: latest.chats,
						...(ended
							? {
									stage: ended,
									error: latest.error ?? null,
									failedDuring: "moving-chats",
								}
							: {}),
					});
					if (ended) {
						finish(ended);
						return;
					}
				} else {
					missed += 1;
				}
				if (missed >= MAX_MISSED_READS || Date.now() - startedAt > GIVE_UP_MS) {
					if (current()) update(id, { stage: "unverified" });
					return;
				}
				setTimeout(() => void poll(), POLL_MS);
			};
			void poll();
		},
	};
}

function endedStage(status: string): WorkspaceMoveProgressStage | null {
	return status === "ready" || status === "partial" || status === "failed"
		? status
		: null;
}
