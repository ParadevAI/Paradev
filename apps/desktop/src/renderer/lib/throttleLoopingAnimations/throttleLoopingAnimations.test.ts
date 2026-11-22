import { expect, test } from "bun:test";
import { throttleLoopingAnimations } from "./throttleLoopingAnimations";

class FakeAnimation {
	playState: AnimationPlayState = "running";
	currentTime = 0;
	constructor(private readonly iterations: number) {}
	effect = { getComputedTiming: () => ({ iterations: this.iterations }) };
	pause() {
		this.playState = "paused";
	}
	play() {
		this.playState = "running";
	}
}

function setup() {
	const win = new EventTarget();
	const doc = new EventTarget();
	let focused = true;
	let now = 0;
	let tick: (() => void) | undefined;
	const animations: FakeAnimation[] = [];
	const host = Object.assign(win, {
		setInterval: (callback: () => void) => {
			tick = callback;
			return 1;
		},
		clearInterval: () => {
			tick = undefined;
		},
		performance: { now: () => now },
		document: Object.assign(doc, {
			hasFocus: () => focused,
			visibilityState: "visible" as DocumentVisibilityState,
			getAnimations: () => animations as unknown as Animation[],
		}),
	});
	const stop = throttleLoopingAnimations(host);
	return {
		animations,
		doc,
		stop,
		isTicking: () => tick !== undefined,
		advance: (ms: number) => {
			now += ms;
			tick?.();
		},
		setFocus: (next: boolean) => {
			focused = next;
			win.dispatchEvent(new Event(next ? "focus" : "blur"));
		},
	};
}

test("steps a looping animation from the timer instead of every frame", () => {
	const { animations, doc, advance, stop } = setup();
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	const fadeIn = new FakeAnimation(1);
	animations.push(spinner, fadeIn);
	doc.dispatchEvent(new Event("animationstart"));

	expect(spinner.playState).toBe("paused");
	expect(fadeIn.playState).toBe("running");
	advance(70);
	advance(60);
	expect(spinner.currentTime).toBe(130);
	stop();
	expect(spinner.playState).toBe("running");
});

test("stops stepping while the window is blurred", () => {
	const { animations, doc, advance, setFocus, isTicking, stop } = setup();
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	animations.push(spinner);
	doc.dispatchEvent(new Event("animationstart"));

	setFocus(false);
	expect(isTicking()).toBe(false);
	advance(500);
	expect(spinner.currentTime).toBe(0);

	setFocus(true);
	advance(50);
	expect(spinner.currentTime).toBe(50);
	stop();
});

test("drops an animation that was cancelled instead of restarting it", () => {
	const { animations, doc, advance, stop } = setup();
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	animations.push(spinner);
	doc.dispatchEvent(new Event("animationstart"));

	spinner.playState = "idle";
	animations.length = 0;
	advance(50);
	stop();
	expect(spinner.playState).toBe("idle");
	expect(spinner.currentTime).toBe(0);
});
