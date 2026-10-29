import { type RefObject, useEffect } from "react";

interface PointerVarsOptions {
	/** Time constant of the ease toward the cursor. 0 follows it exactly. */
	glideMs?: number;
	/** Converts to the element's own pixels when a 2D scale transform sits above it. */
	unscale?: boolean;
}

interface Point {
	x: number;
	y: number;
}

const SETTLED_PX = 0.5;

// Listens on the window so the glare tracks the cursor anywhere on the page
export function usePointerVars(
	ref: RefObject<HTMLElement | null>,
	name: string,
	{ glideMs = 0, unscale = false }: PointerVarsOptions = {},
) {
	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const glide = window.matchMedia("(prefers-reduced-motion: reduce)").matches
			? 0
			: glideMs;
		let frame = 0;
		let lastFrameAt = 0;
		let pointer: Point | null = null;
		let shown: Point | null = null;

		const step = (now: number) => {
			frame = 0;
			if (!pointer) return;
			const rect = element.getBoundingClientRect();
			const factor =
				unscale && rect.width > 0 ? element.offsetWidth / rect.width : 1;
			const goal = {
				x: (pointer.x - rect.left) * factor,
				y: (pointer.y - rect.top) * factor,
			};
			if (!shown || glide <= 0) {
				shown = goal;
			} else {
				const blend = 1 - Math.exp(-(now - lastFrameAt) / glide);
				shown = {
					x: shown.x + (goal.x - shown.x) * blend,
					y: shown.y + (goal.y - shown.y) * blend,
				};
			}
			lastFrameAt = now;
			element.style.setProperty(`--${name}-mx`, `${shown.x}px`);
			element.style.setProperty(`--${name}-my`, `${shown.y}px`);
			if (
				Math.abs(goal.x - shown.x) > SETTLED_PX ||
				Math.abs(goal.y - shown.y) > SETTLED_PX
			) {
				frame = requestAnimationFrame(step);
			}
		};

		const schedule = () => {
			if (!pointer || frame) return;
			lastFrameAt = performance.now();
			frame = requestAnimationFrame(step);
		};
		// Hover-only: a finger drag would light the edge and leave it lit
		const onPointerMove = (event: PointerEvent) => {
			if (event.pointerType !== "mouse") return;
			pointer = { x: event.clientX, y: event.clientY };
			schedule();
		};

		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("scroll", schedule, {
			passive: true,
			capture: true,
		});
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("scroll", schedule, { capture: true });
			if (frame) cancelAnimationFrame(frame);
		};
	}, [ref, name, glideMs, unscale]);
}
