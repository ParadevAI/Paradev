// Test fixture: a worker that answers its task, then dies while idle — the
// shape of a background scan that crashes after its request returned.
import { parentPort } from "node:worker_threads";

parentPort?.on("message", (message: { kind?: string; taskId?: string }) => {
	if (message.kind !== "task") return;
	parentPort?.postMessage({
		kind: "result",
		taskId: message.taskId,
		ok: true,
		result: 1,
	});
	setTimeout(() => process.exit(1), 20);
});
