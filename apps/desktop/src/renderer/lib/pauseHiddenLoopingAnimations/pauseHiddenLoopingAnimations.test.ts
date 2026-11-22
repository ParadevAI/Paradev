import { expect, test } from "bun:test";
import { pauseHiddenLoopingAnimations } from "./pauseHiddenLoopingAnimations";

class FakeAnimation {
	playState: AnimationPlayState = "running";
	constructor(public iterations: number) {}
	effect = { getComputedTiming: () => ({ iterations: this.iterations }) };
	pause() {
		this.playState = "paused";
	}
	play() {
		this.playState = "running";
	}
}

function setup(visibilityState: DocumentVisibilityState) {
	const animations: FakeAnimation[] = [];
	const doc = Object.assign(new EventTarget(), {
		visibilityState,
		getAnimations: () => animations as unknown as Animation[],
	});
	const { setWindowShown } = pauseHiddenLoopingAnimations(doc);
	return {
		setWindowShown,
		start: (animation: FakeAnimation) => {
			animations.push(animation);
			doc.dispatchEvent(new Event("animationstart"));
		},
		setVisibility: (value: DocumentVisibilityState) => {
			doc.visibilityState = value;
			doc.dispatchEvent(new Event("visibilitychange"));
		},
	};
}

test("plays looping animations natively while the window is visible", () => {
	const { start } = setup("visible");
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(spinner);

	expect(spinner.playState).toBe("running");
});

test("pauses only looping animations while hidden and resumes them when visible", () => {
	const { start, setVisibility } = setup("visible");
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	const fadeIn = new FakeAnimation(1);
	start(spinner);
	start(fadeIn);

	setVisibility("hidden");
	expect(spinner.playState).toBe("paused");
	expect(fadeIn.playState).toBe("running");

	const later = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(later);
	expect(later.playState).toBe("paused");

	setVisibility("visible");
	expect(spinner.playState).toBe("running");
	expect(later.playState).toBe("running");
});

test("leaves an animation that ended while hidden alone", () => {
	const { start, setVisibility } = setup("visible");
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(spinner);

	setVisibility("hidden");
	spinner.playState = "idle";
	setVisibility("visible");
	expect(spinner.playState).toBe("idle");
});

test("pauses while the window is minimized even if the page reports visible", () => {
	const { start, setWindowShown } = setup("visible");
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(spinner);

	setWindowShown(false);
	expect(spinner.playState).toBe("paused");

	setWindowShown(true);
	expect(spinner.playState).toBe("running");
});
