import { type CloudLoop, createCloudLoop } from "./createCloudLoop";

export type CloudWorkerMessage =
	| { type: "init"; canvas: OffscreenCanvas }
	| { type: "resize"; width: number; height: number; dpr: number }
	| { type: "play"; playing: boolean };

let loop: CloudLoop | undefined;

addEventListener("message", (event: MessageEvent<CloudWorkerMessage>) => {
	const message = event.data;
	if (message.type === "init") loop = createCloudLoop(message.canvas);
	else if (message.type === "resize")
		loop?.resize(message.width, message.height, message.dpr);
	else loop?.setPlaying(message.playing);
});
