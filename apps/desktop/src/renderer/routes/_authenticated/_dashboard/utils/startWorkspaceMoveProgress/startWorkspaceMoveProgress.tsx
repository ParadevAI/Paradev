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
const SUCCESS_LINGER_MS = 5_000;

export interface WorkspaceMoveProgressHandle {
	setStage: (stage: "saving" | "creating") => void;
	/** Follows the move's chats into this workspace until the move ends. */
	follow: (toWorkspaceId: string) => void;
	fail: (message: string) => void;
}

/** Shows a move's progress in a toast at the bottom until it ends. */
export function startWorkspaceMoveProgress(args: {
	name: string;
	destination: string;
}): WorkspaceMoveProgressHandle {
	const id = `workspace-move-${crypto.randomUUID()}`;
	const store = useWorkspaceMoveProgressStore.getState();
	store.start({ id, ...args, stage: "saving", chats: null, error: null });
	toast.custom(() => <WorkspaceMoveToast moveId={id} />, {
		id,
		duration: Number.POSITIVE_INFINITY,
	});
	const update = useWorkspaceMoveProgressStore.getState().update;

	const finish = (stage: WorkspaceMoveProgressStage) => {
		if (stage !== "ready") return;
		setTimeout(() => {
			toast.dismiss(id);
			useWorkspaceMoveProgressStore.getState().remove(id);
		}, SUCCESS_LINGER_MS);
	};

	return {
		setStage: (stage) => update(id, { stage }),
		fail: (message) => update(id, { stage: "failed", error: message }),
		follow: (toWorkspaceId) => {
			update(id, { stage: "moving-chats" });
			const startedAt = Date.now();
			const poll = async () => {
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
					const ended = endedStage(latest.status);
					update(id, {
						chats: latest.chats,
						...(ended ? { stage: ended, error: latest.error ?? null } : {}),
					});
					if (ended) {
						finish(ended);
						return;
					}
				}
				if (Date.now() - startedAt > GIVE_UP_MS) return;
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
