import { FRAME_MS } from "./constants";
import { drawClouds } from "./drawClouds";

export interface CloudLoop {
	resize: (width: number, height: number, dpr: number) => void;
	setPlaying: (playing: boolean) => void;
	dispose: () => void;
}

export function createCloudLoop(
	canvas: HTMLCanvasElement | OffscreenCanvas,
): CloudLoop {
	const ctx = canvas.getContext("2d") as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	let width = 0;
	let height = 0;
	let frame = 0;
	let timer: ReturnType<typeof setInterval> | undefined;

	const draw = () => {
		if (ctx && width > 0 && height > 0) drawClouds(ctx, width, height, frame);
	};
	const stop = () => {
		clearInterval(timer);
		timer = undefined;
	};

	return {
		resize(nextWidth, nextHeight, dpr) {
			width = nextWidth;
			height = nextHeight;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
			draw();
		},
		setPlaying(playing) {
			if (!playing) return stop();
			if (timer !== undefined) return;
			timer = setInterval(() => {
				frame += 1;
				draw();
			}, FRAME_MS);
		},
		dispose: stop,
	};
}
