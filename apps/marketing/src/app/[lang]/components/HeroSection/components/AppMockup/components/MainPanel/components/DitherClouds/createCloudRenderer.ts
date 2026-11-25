import type { CloudWorkerMessage } from "./clouds.worker";
import { type CloudLoop, createCloudLoop } from "./createCloudLoop";

function createWorker(): Worker | null {
	try {
		return new Worker(new URL("./clouds.worker.ts", import.meta.url), {
			type: "module",
		});
	} catch {
		return null;
	}
}

export function createCloudRenderer(canvas: HTMLCanvasElement): CloudLoop {
	const worker =
		"transferControlToOffscreen" in canvas && typeof Worker !== "undefined"
			? createWorker()
			: null;
	if (!worker) return createCloudLoop(canvas);

	const send = (message: CloudWorkerMessage, transfer: Transferable[] = []) =>
		worker.postMessage(message, transfer);
	const offscreen = canvas.transferControlToOffscreen();
	send({ type: "init", canvas: offscreen }, [offscreen]);

	return {
		resize: (width, height, dpr) =>
			send({ type: "resize", width, height, dpr }),
		setPlaying: (playing) => send({ type: "play", playing }),
		dispose: () => worker.terminate(),
	};
}
