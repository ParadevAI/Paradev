type AnimationDocument = Pick<
	Document,
	"addEventListener" | "getAnimations" | "visibilityState"
>;

function loops(animation: Animation): boolean {
	return (
		animation.effect?.getComputedTiming().iterations ===
		Number.POSITIVE_INFINITY
	);
}

export function pauseHiddenLoopingAnimations(
	doc: AnimationDocument = document,
): { setWindowShown: (shown: boolean) => void } {
	const held = new Set<Animation>();
	let windowShown = true;

	const sync = () => {
		if (windowShown && doc.visibilityState === "visible") {
			for (const animation of held) {
				// A CSS animation whose class or element went away is "idle".
				if (animation.playState === "paused") animation.play();
			}
			held.clear();
			return;
		}
		for (const animation of doc.getAnimations()) {
			if (animation.playState !== "running" || !loops(animation)) continue;
			animation.pause();
			held.add(animation);
		}
	};

	doc.addEventListener("animationstart", sync);
	doc.addEventListener("visibilitychange", sync);
	sync();

	return {
		setWindowShown: (shown) => {
			windowShown = shown;
			sync();
		},
	};
}
