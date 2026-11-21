"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { MAX_DPR } from "./constants";
import type { CloudLoop } from "./createCloudLoop";
import { createCloudRenderer } from "./createCloudRenderer";

interface DitherCloudsProps {
	visible: boolean;
	className?: string;
}

export function DitherClouds({ visible, className = "" }: DitherCloudsProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const rendererRef = useRef<CloudLoop | null>(null);
	const inViewRef = useRef(false);
	const visibleRef = useRef(visible);
	const reducedMotion = useReducedMotion() ?? false;

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		// A canvas can hand its control to a worker only once, so each effect
		// run gets its own canvas.
		const canvas = document.createElement("canvas");
		canvas.className = "block h-full w-full";
		host.append(canvas);
		const renderer = createCloudRenderer(canvas);
		rendererRef.current = renderer;

		const resize = () =>
			renderer.resize(
				host.clientWidth,
				host.clientHeight,
				Math.min(window.devicePixelRatio || 1, MAX_DPR),
			);
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(host);
		resize();

		const viewObserver = new IntersectionObserver(([entry]) => {
			inViewRef.current = entry?.isIntersecting ?? false;
			renderer.setPlaying(
				inViewRef.current && visibleRef.current && !reducedMotion,
			);
		});
		viewObserver.observe(host);

		return () => {
			viewObserver.disconnect();
			resizeObserver.disconnect();
			renderer.dispose();
			rendererRef.current = null;
			canvas.remove();
		};
	}, [reducedMotion]);

	useEffect(() => {
		visibleRef.current = visible;
		rendererRef.current?.setPlaying(
			visible && inViewRef.current && !reducedMotion,
		);
	}, [visible, reducedMotion]);

	return (
		<div
			ref={hostRef}
			aria-hidden="true"
			className={`transition-opacity duration-500 ease-out motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"} ${className}`}
		/>
	);
}
