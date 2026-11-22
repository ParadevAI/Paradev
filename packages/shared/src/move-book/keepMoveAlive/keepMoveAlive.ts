import { MOVE_STOPPED_ANSWERING } from "../protocol";

export const MOVE_HEARTBEAT_MS = 60_000;

/**
 * Runs a begun workspace move's own work while telling the control plane it
 * is still going, so the stale sweep never ends a move that is only slow.
 * When the control plane says the move already ended, the work stops with
 * the reason it gives, such as a cancel from another view.
 */
export async function keepMoveAlive<T>({
	workspaceMoveId,
	heartbeat,
	signal,
	intervalMs = MOVE_HEARTBEAT_MS,
	work,
}: {
	workspaceMoveId: string;
	heartbeat: (
		workspaceMoveId: string,
	) => Promise<{ alive: boolean; error?: string | null }>;
	signal?: AbortSignal;
	intervalMs?: number;
	work: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
	const controller = new AbortController();
	const forwardAbort = () => controller.abort(signal?.reason);
	if (signal?.aborted) forwardAbort();
	signal?.addEventListener("abort", forwardAbort, { once: true });

	let rejectEnded: (error: Error) => void = () => {};
	const ended = new Promise<never>((_, reject) => {
		rejectEnded = reject;
	});
	ended.catch(() => {});

	const timer = setInterval(() => {
		heartbeat(workspaceMoveId).then(
			({ alive, error: reason }) => {
				if (alive || controller.signal.aborted) return;
				const error = new Error(reason || MOVE_STOPPED_ANSWERING);
				controller.abort(error);
				rejectEnded(error);
			},
			(error: unknown) =>
				console.warn(
					`[workspace-move] could not keep move ${workspaceMoveId} going`,
					error,
				),
		);
	}, intervalMs);

	try {
		return await Promise.race([work(controller.signal), ended]);
	} finally {
		clearInterval(timer);
		signal?.removeEventListener("abort", forwardAbort);
	}
}
