import { expect, test } from "bun:test";
import { throttleLoopingAnimations } from "./throttleLoopingAnimations";

class FakeAnimation {
	playState: AnimationPlayState = "running";
	currentTime = 0;
	constructor(public iterations: number) {}
	effect = { getComputedTiming: () => ({ iterations: this.iterations }) };
	pause() {
		this.playState = "paused";
	}
	play() {
		this.playState = "running";
	}
}

function setup() {
	const window = new EventTarget();
	const document = new EventTarget();
	let now = 0;
	let focused = false;
	let tick: (() => void) | undefined;
	const animations: FakeAnimation[] = [];
	const host = Object.assign(window, {
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
			hasFocus: () => focused,
		}),
	});
	throttleLoopingAnimations(host);
	const start = (animation: FakeAnimation) => {
		animations.push(animation);
		document.dispatchEvent(new Event("animationstart"));
	};
	return {
		host,
		start,
		setFocused: (value: boolean) => {
			focused = value;
			window.dispatchEvent(new Event(value ? "focus" : "blur"));
		},
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

test("plays animations natively while the window has focus", () => {
	const { start, setFocused, isTicking } = setup();
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(spinner);

	setFocused(true);
	expect(spinner.playState).toBe("running");
	expect(isTicking()).toBe(false);

	const later = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(later);
	expect(later.playState).toBe("running");

	setFocused(false);
	expect(spinner.playState).toBe("paused");
	expect(later.playState).toBe("paused");
	expect(isTicking()).toBe(true);
});

test("releases a held animation that stops looping", () => {
	const { start, advance, isTicking } = setup();
	const spinner = new FakeAnimation(Number.POSITIVE_INFINITY);
	start(spinner);

	spinner.iterations = 1;
	advance(125);
	expect(spinner.playState).toBe("running");
	expect(isTicking()).toBe(false);
});
