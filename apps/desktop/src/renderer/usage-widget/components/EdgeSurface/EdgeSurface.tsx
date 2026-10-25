import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { edgeHandleLayout } from "shared/usage-widget/model";
import {
	advanceEdge,
	type EdgeFrame,
	type EdgeSpring,
	edgeAtRest,
	edgeContour,
	edgeFade,
	restingEdge,
} from "./motion";

export function EdgeSurface({
	expanded,
	panelHeight,
	transition,
	layout,
	handle,
	children,
}: {
	expanded: boolean;
	panelHeight: number;
	transition: number | null;
	layout: ReturnType<typeof edgeHandleLayout>;
	handle: ReactNode;
	children: ReactNode;
}) {
	const shell = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const handleLayer = useRef<HTMLDivElement>(null);
	const spring = useRef<EdgeSpring | null>(null);
	const collapsedHeight = layout.height;
	const collapsedWidth = layout.width;
	useLayoutEffect(() => {
		if (!document.hasFocus()) return;
		const layer = expanded ? content.current : handleLayer.current;
		layer
			?.querySelector<HTMLButtonElement>("button:not(:disabled)")
			?.focus({ preventScroll: true });
	}, [expanded]);
	useLayoutEffect(() => {
		const shape = shell.current,
			body = content.current,
			tab = handleLayer.current;
		if (!shape || !body || !tab) return;
		const target = {
			width: expanded ? Math.min(392, window.innerWidth) : collapsedWidth,
			height: Math.min(
				expanded ? panelHeight : collapsedHeight,
				window.innerHeight,
			),
			openness: expanded ? 1 : 0,
		};
		const from =
			spring.current?.frame ??
			(transition !== null && expanded
				? { width: collapsedWidth, height: collapsedHeight, openness: 0 }
				: target);
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		let raf = 0;
		let previous: number | undefined;
		const instant = transition === null || reduced.matches;
		spring.current ??= restingEdge(from);
		const draw = (next: EdgeFrame) => {
			shape.style.width = `${next.width}px`;
			shape.style.height = `${next.height}px`;
			shape.style.clipPath = `path('${edgeContour(next.width, next.height)}')`;
			body.style.opacity = String(edgeFade(next.openness, 0.15, 0.85));
			body.style.transform = `translateY(-50%) translateX(${(1 - next.openness) * 12}px)`;
			tab.style.opacity = String(1 - edgeFade(next.openness, 0.05, 0.3));
		};
		const finish = () => {
			cancelAnimationFrame(raf);
			spring.current = restingEdge(target);
			draw(target);
			if (transition !== null) window.UsageWidget.settled(transition);
		};
		const tick = (now: number) => {
			const elapsed = previous === undefined ? 0 : (now - previous) / 1000;
			previous = now;
			const next = advanceEdge(
				spring.current ?? restingEdge(from),
				target,
				elapsed,
			);
			spring.current = next;
			draw(next.frame);
			if (edgeAtRest(next, target)) finish();
			else raf = requestAnimationFrame(tick);
		};
		draw(from);
		if (instant) finish();
		else raf = requestAnimationFrame(tick);
		reduced.addEventListener("change", finish);
		return () => {
			cancelAnimationFrame(raf);
			reduced.removeEventListener("change", finish);
		};
	}, [expanded, panelHeight, transition, collapsedHeight, collapsedWidth]);
	return (
		<div className="usage-edge-stage">
			<div ref={shell} className="usage-edge-shape">
				<div
					ref={handleLayer}
					className="usage-edge-handle"
					style={{ height: collapsedHeight, width: collapsedWidth }}
					inert={expanded}
					aria-hidden={expanded}
				>
					{handle}
				</div>
				<div
					ref={content}
					className="usage-edge-content"
					style={{ height: panelHeight }}
					inert={!expanded}
					aria-hidden={!expanded}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
