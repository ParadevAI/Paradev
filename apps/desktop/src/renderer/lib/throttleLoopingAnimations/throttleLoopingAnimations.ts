// Measured on a Core Ultra laptop: 8 fps costs about the same as no animation,
// 12-15 fps keeps the CPU out of deep idle and costs 1-2 W more.
export const LOOPING_ANIMATION_FPS = 8;

type AnimationHost = Pick<
	Window,
	"addEventListener" | "removeEventListener" | "setInterval" | "clearInterval"
> & {
	document: Pick<
		Document,
		| "addEventListener"
		| "removeEventListener"
		| "getAnimations"
		| "hasFocus"
		| "visibilityState"
	>;
	performance: Pick<Performance, "now">;
};

function loops(animation: Animation): boolean {
	return (
		animation.effect?.getComputedTiming().iterations ===
		Number.POSITIVE_INFINITY
	);
}

// A running looping animation makes Chromium and the compositor draw a frame
// on every display refresh (120 Hz here). Hold every looping animation and
// step it from one timer instead, and stop stepping when nobody can see it.
export function throttleLoopingAnimations(
	host: AnimationHost = window,
	fps = LOOPING_ANIMATION_FPS,
): () => void {
	const { document, performance } = host;
	const held = new Set<Animation>();
	let timer: number | undefined;
	let lastTick = 0;

	const hold = () => {
		for (const animation of document.getAnimations()) {
			if (animation.playState !== "running" || !loops(animation)) continue;
			animation.pause();
			held.add(animation);
		}
	};

	const tick = () => {
		const now = performance.now();
		const elapsed = now - lastTick;
		lastTick = now;
		for (const animation of held) {
			// "idle" means the animation's class or element went away.
			if (animation.playState !== "paused") {
				held.delete(animation);
				continue;
			}
			animation.currentTime = Number(animation.currentTime ?? 0) + elapsed;
		}
		hold();
	};

	const sync = () => {
		hold();
		const visible =
			document.hasFocus() && document.visibilityState === "visible";
		if (visible && timer === undefined) {
			lastTick = performance.now();
			timer = host.setInterval(tick, 1000 / fps);
		} else if (!visible && timer !== undefined) {
			host.clearInterval(timer);
			timer = undefined;
		}
	};

	host.addEventListener("focus", sync);
	host.addEventListener("blur", sync);
	document.addEventListener("visibilitychange", sync);
	document.addEventListener("animationstart", hold);
	sync();

	return () => {
		host.removeEventListener("focus", sync);
		host.removeEventListener("blur", sync);
		document.removeEventListener("visibilitychange", sync);
		document.removeEventListener("animationstart", hold);
		if (timer !== undefined) host.clearInterval(timer);
		for (const animation of held) {
			if (animation.playState === "paused") animation.play();
		}
		held.clear();
	};
}
