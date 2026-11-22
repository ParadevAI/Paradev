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
}

function setup() {
	const document = new EventTarget();
	let now = 0;
	let tick: (() => void) | undefined;
	const animations: FakeAnimation[] = [];
	const host = {
		setInterval: (callback: () => void) => {
			tick = callback;
			return 1;
		},
		clearInterval: () => {
			tick = undefined;
		},
		performance: { now: () => now },
		document: Object.assign(document, {
			visibilityState: "visible" as DocumentVisibilityState,
			getAnimations: () => animations as unknown as Animation[],
		}),
	};
	throttleLoopingAnimations(host);
	const start = (animation: FakeAnimation) => {
		animations.push(animation);
		document.dispatchEvent(new Event("animationstart"));
	};
	return {
		host,
		start,
		isTicking: () => tick !== undefined,
		advance: (ms: number) => {
			now += ms;
			tick?.();
		},
	};
}

test("steps only looping animations from the timer", () => {
	const { start, advance } = setup();
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	const fadeIn = new FakeAnimation(1);
	start(spinner);
	start(fadeIn);

	expect(spinner.playState).toBe("paused");
	expect(fadeIn.playState).toBe("running");
	advance(70);
	advance(60);
	expect(spinner.currentTime).toBe(130);
});

test("runs the timer only while a held animation is visible", () => {
	const { host, start, advance, isTicking } = setup();
	expect(isTicking()).toBe(false);

	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(spinner);
	expect(isTicking()).toBe(true);

	host.document.visibilityState = "hidden";
	host.document.dispatchEvent(new Event("visibilitychange"));
	expect(isTicking()).toBe(false);

	host.document.visibilityState = "visible";
	host.document.dispatchEvent(new Event("visibilitychange"));
	expect(isTicking()).toBe(true);

	spinner.playState = "idle";
	advance(50);
	expect(spinner.currentTime).toBe(0);
	expect(isTicking()).toBe(false);
});
