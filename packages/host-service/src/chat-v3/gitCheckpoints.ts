import type { ChatCheckpoints } from "@superset/chat-runtime";
import type { WorkerTaskDefinition } from "../workers/define-worker-task";
import { getHostWorkerPool } from "../workers/host-worker-pool";
import {
	checkpointAvailableTask,
	checkpointCaptureTask,
	checkpointChangesTask,
	checkpointForkTask,
	checkpointRestoreTask,
} from "../workers/tasks/checkpoints";

export { checkpointRef } from "../workers/tasks/checkpoints";

type RunTask = <TInput, TResult>(
	task: WorkerTaskDefinition<TInput, TResult>,
	input: TInput,
) => Promise<TResult>;

const runInWorker: RunTask = (task, input) =>
	getHostWorkerPool().run(task, input);

/** Git snapshots run in the host worker pool, off the event loop. */
export function createGitCheckpoints(
	run: RunTask = runInWorker,
): ChatCheckpoints {
	return {
		capture: (target) => run(checkpointCaptureTask, target),
		available: (cwd) => run(checkpointAvailableTask, { cwd }),
		fork: (input) => run(checkpointForkTask, input),
		changes: (target) => run(checkpointChangesTask, target),
		restore: (target) => run(checkpointRestoreTask, target),
	};
}
