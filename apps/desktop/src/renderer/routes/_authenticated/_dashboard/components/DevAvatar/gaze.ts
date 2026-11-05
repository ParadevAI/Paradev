export type DevMood = "idle" | "working" | "needs" | "asleep";

export interface GazeTarget {
	svg: SVGSVGElement;
	eyes: SVGGElement;
	closed: SVGPathElement;
	mood: DevMood;
	watch: boolean;
}

interface Tracked extends GazeTarget {
	x: number;
	y: number;
	vx: number;
	vy: number;
	blink: number;
	nextBlink: number;
	t: number;
}

const tracked = new Set<Tracked>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;
let last = 0;

const reducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function aimFor(d: Tracked): [number, number] {
	if (d.mood === "working") return [Math.sin(d.t * 2.2) * 0.8, 0.35];
	if (d.mood === "asleep" || !d.watch || !pointer) return [0, 0];
	const rect = d.svg.getBoundingClientRect();
	const dx = pointer.x - (rect.left + rect.width / 2);
	const dy = pointer.y - (rect.top + rect.height / 2);
	const dist = Math.hypot(dx, dy) || 1;
	const reach = Math.min(1, dist / 260);
	return [(dx / dist) * reach, (dy / dist) * reach];
}

function draw(d: Tracked) {
	let squash = 1;
	if (d.blink > 0) squash = Math.max(0.08, Math.abs(d.blink - 0.07) / 0.07);
	const wide = d.mood === "needs" ? 1.2 : 1;
	const bob =
		d.mood === "needs"
			? -Math.abs(Math.sin(d.t * 5)) * 3
			: d.mood === "asleep"
				? Math.sin(d.t * 1.6) * 1.2
				: 0;
	const pupils = d.eyes.querySelectorAll<SVGElement>("[data-pupil]");
	const scale = `translate(50 48) scale(${wide} ${squash * wide}) translate(-50 -48)`;
	if (pupils.length > 0) {
		d.eyes.setAttribute("transform", `translate(0 ${bob}) ${scale}`);
		for (const pupil of pupils) {
			pupil.setAttribute("transform", `translate(${d.x * 3.5} ${d.y * 4.5})`);
		}
	} else {
		d.eyes.setAttribute(
			"transform",
			`translate(${d.x * 9} ${d.y * 7 + bob}) ${scale}`,
		);
	}
	const asleep = d.mood === "asleep";
	d.eyes.style.opacity = asleep ? "0" : "1";
	d.closed.style.opacity = asleep ? "1" : "0";
}

function step(now: number) {
	frame = 0;
	const dt = Math.min(0.05, (now - last) / 1000);
	last = now;
	if (document.hidden) return;
	for (const d of tracked) {
		d.t += dt;
		const [tx, ty] = aimFor(d);
		d.vx += (tx - d.x) * 90 * dt - d.vx * 14 * dt;
		d.vy += (ty - d.y) * 90 * dt - d.vy * 14 * dt;
		d.x += d.vx * dt;
		d.y += d.vy * dt;
		d.nextBlink -= dt * 1000;
		if (d.nextBlink <= 0 && d.mood !== "asleep") {
			d.blink = 0.14;
			d.nextBlink = 2200 + Math.random() * 4200;
		}
		if (d.blink > 0) d.blink -= dt;
		draw(d);
	}
	schedule();
}

function schedule() {
	if (frame || tracked.size === 0) return;
	frame = requestAnimationFrame(step);
}

function onPointer(event: PointerEvent) {
	pointer = { x: event.clientX, y: event.clientY };
}

function onVisibility() {
	if (!document.hidden) {
		last = performance.now();
		schedule();
	}
}

/** Animates an avatar's eyes until the returned function is called. */
export function trackGaze(target: GazeTarget): () => void {
	if (reducedMotion()) return () => {};
	const d: Tracked = {
		...target,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		blink: 0,
		nextBlink: 1500 + Math.random() * 3500,
		t: Math.random() * 10,
	};
	if (tracked.size === 0) {
		window.addEventListener("pointermove", onPointer, { passive: true });
		document.addEventListener("visibilitychange", onVisibility);
		last = performance.now();
	}
	tracked.add(d);
	schedule();
	return () => {
		tracked.delete(d);
		if (tracked.size === 0) {
			window.removeEventListener("pointermove", onPointer);
			document.removeEventListener("visibilitychange", onVisibility);
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		}
	};
}
