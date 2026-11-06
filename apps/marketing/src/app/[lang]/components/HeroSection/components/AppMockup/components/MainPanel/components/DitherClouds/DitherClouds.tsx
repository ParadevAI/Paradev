"use client";

import { m, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
	BAYER,
	CELL,
	DOT,
	DRIFT_PER_FRAME,
	FRAME_MS,
	MAX_DPR,
} from "./constants";

const hash = (i: number, j: number) => {
	const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
	return h - Math.floor(h);
};

const smooth = (t: number) => t * t * (3 - 2 * t);

const noise = (x: number, y: number) => {
	const i = Math.floor(x);
	const j = Math.floor(y);
	const u = smooth(x - i);
	const v = smooth(y - j);
	const a = hash(i, j);
	const b = hash(i + 1, j);
	const c = hash(i, j + 1);
	const d = hash(i + 1, j + 1);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (x: number, y: number) => {
	let sum = 0;
	let amp = 0.5;
	for (let o = 0; o < 5; o++) {
		sum += amp * noise(x, y);
		x *= 2.03;
		y *= 2.03;
		amp *= 0.5;
	}
	return sum;
};

const STARS = Array.from({ length: 70 }, (_, i) => ({
	x: hash(i, 1.7),
	y: hash(i, 9.3),
	sparkle: i % 13 === 0,
	phase: hash(i, 4.1) * Math.PI * 2,
}));

function draw(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: number,
) {
	const cols = Math.ceil(width / CELL);
	const rows = Math.ceil(height / CELL);
	const t = frame * DRIFT_PER_FRAME;
	ctx.clearRect(0, 0, width, height);

	for (let j = 0; j < rows; j++) {
		const ny = j / rows;
		for (let i = 0; i < cols; i++) {
			const nx = i / cols;
			const px = nx * 7.5 + t;
			const py = ny * 4.2;
			const warp = fbm(px * 0.6 + 7.3, py * 0.6 - t * 0.5);
			let d = fbm(px + warp * 1.8, py + warp * 0.9);
			const band =
				0.75 * Math.exp(-(((ny - 0.08 - nx * 0.06) / 0.17) ** 2)) +
				0.8 * Math.exp(-(((ny - 0.72 + (1 - nx) * 0.25) / 0.22) ** 2));
			d = (d * (0.55 + 0.6 * band) - 0.53) * 3.2;
			if (d <= 0) continue;
			const level = Math.min(d, 0.82);
			if (level * 64 <= (BAYER[j % 8]?.[i % 8] ?? 0)) continue;
			ctx.fillStyle = `rgba(232,232,236,${0.14 + 0.38 * level})`;
			ctx.fillRect(i * CELL, j * CELL, DOT, DOT);
		}
	}

	for (const star of STARS) {
		const twinkle = 0.45 + 0.55 * Math.sin(frame * 0.09 + star.phase) ** 2;
		const x = Math.floor((star.x * width) / CELL) * CELL;
		const y = Math.floor((star.y * height) / CELL) * CELL;
		ctx.fillStyle = `rgba(255,255,255,${(star.sparkle ? 0.9 : 0.55) * twinkle})`;
		ctx.fillRect(x, y, DOT, DOT);
		if (star.sparkle) {
			ctx.fillStyle = `rgba(255,255,255,${0.45 * twinkle})`;
			ctx.fillRect(x - CELL, y, DOT, DOT);
			ctx.fillRect(x + CELL, y, DOT, DOT);
			ctx.fillRect(x, y - CELL, DOT, DOT);
			ctx.fillRect(x, y + CELL, DOT, DOT);
		}
	}
}

interface DitherCloudsProps {
	visible: boolean;
	className?: string;
}

export function DitherClouds({ visible, className }: DitherCloudsProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const frameRef = useRef(0);
	const reducedMotion = useReducedMotion() ?? false;

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx || !visible) return;

		let width = 0;
		let height = 0;
		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
			width = canvas.clientWidth;
			height = canvas.clientHeight;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			draw(ctx, width, height, frameRef.current);
		};
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(canvas);
		resize();

		if (reducedMotion) return () => resizeObserver.disconnect();

		let raf = 0;
		let last = 0;
		const tick = (now: number) => {
			raf = requestAnimationFrame(tick);
			if (now - last < FRAME_MS) return;
			last = now;
			frameRef.current += 1;
			draw(ctx, width, height, frameRef.current);
		};
		const viewObserver = new IntersectionObserver(([entry]) => {
			cancelAnimationFrame(raf);
			if (entry?.isIntersecting) raf = requestAnimationFrame(tick);
		});
		viewObserver.observe(canvas);

		return () => {
			cancelAnimationFrame(raf);
			viewObserver.disconnect();
			resizeObserver.disconnect();
		};
	}, [visible, reducedMotion]);

	return (
		<m.canvas
			ref={canvasRef}
			aria-hidden
			className={className}
			initial={{ opacity: 0 }}
			animate={{ opacity: visible ? 1 : 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
		/>
	);
}
