// Measured: 12-15 fps kept the CPU out of deep idle (1-2 W more); 8 fps did not.
const FPS = 8;

type AnimationHost = Pick<Window, "setInterval" | "clearInterval"> & {
	document: Pick<
		Document,
		"addEventListener" | "getAnimations" | "visibilityState"
	>;
	performance: Pick<Performance, "now">;
};

function loops(animation: Animation): boolean {
	return (
		animation.effect?.getComputedTiming().iterations ===
		Number.POSITIVE_INFINITY
	);
}

export function throttleLoopingAnimations(host: AnimationHost = window): void {
	const { document, performance } = host;
	const held = new Set<Animation>();
	let timer: number | undefined;
	let lastTick = 0;

	const stopTimer = () => {
		host.clearInterval(timer);
		timer = undefined;
	};

	const tick = () => {
		const now = performance.now();
		const elapsed = now - lastTick;
		lastTick = now;
		for (const animation of held) {
			// A CSS animation whose class or element went away is "idle".
			if (animation.playState === "paused") {
				animation.currentTime = Number(animation.currentTime ?? 0) + elapsed;
			} else {
				held.delete(animation);
			}
		}
		if (held.size === 0) stopTimer();
	};

	const sync = () => {
		for (const animation of document.getAnimations()) {
			if (animation.playState !== "running" || !loops(animation)) continue;
			animation.pause();
			held.add(animation);
		}
		const shouldTick = document.visibilityState === "visible" && held.size > 0;
		if (shouldTick && timer === undefined) {
			lastTick = performance.now();
			timer = host.setInterval(tick, 1000 / FPS);
		} else if (!shouldTick && timer !== undefined) {
			stopTimer();
		}
	};

	document.addEventListener("animationstart", sync);
	document.addEventListener("visibilitychange", sync);
	sync();
}
