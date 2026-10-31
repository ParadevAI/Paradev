"use client";

import { useRef } from "react";
import { usePointerVars } from "@/app/[lang]/hooks/usePointerVars";

const CENTER_X = 800;
const CENTER_Y = 420;
const RADIUS = 960;
const TILT = (18 * Math.PI) / 180;
const STEP_DEG = 2;
const MERIDIANS = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];
const FADE = "linear-gradient(to bottom, black 35%, transparent 90%)";
const SPOTLIGHT =
	"radial-gradient(280px circle at var(--grid-mx, -9999px) var(--grid-my, -9999px), #000, transparent 70%)";

type Point = [number, number] | null;

function project(latDeg: number, lonDeg: number): Point {
	const lat = (latDeg * Math.PI) / 180;
	const lon = (lonDeg * Math.PI) / 180;
	const x = Math.cos(lat) * Math.sin(lon);
	const y = Math.sin(lat);
	const z = Math.cos(lat) * Math.cos(lon);
	const tiltedY = y * Math.cos(TILT) - z * Math.sin(TILT);
	const depth = y * Math.sin(TILT) + z * Math.cos(TILT);
	if (depth < 0) return null;
	return [CENTER_X + RADIUS * x, CENTER_Y - RADIUS * tiltedY];
}

function toPath(points: Point[]): string {
	let d = "";
	let drawing = false;
	for (const point of points) {
		if (!point) {
			drawing = false;
			continue;
		}
		d += `${drawing ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
		drawing = true;
	}
	return d;
}

function range(from: number, to: number): number[] {
	const values: number[] = [];
	for (let v = from; v <= to; v += STEP_DEG) values.push(v);
	return values;
}

const GLOBE_PATHS = [
	...MERIDIANS.map((lon) =>
		toPath(range(-90, 90).map((lat) => project(lat, lon))),
	),
	...PARALLELS.map((lat) =>
		toPath(range(-180, 180).map((lon) => project(lat, lon))),
	),
];

export function FooterBackdrop() {
	const ref = useRef<HTMLDivElement>(null);
	usePointerVars(ref, "grid", { glideMs: 120 });

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-1/2 -z-10 aspect-[8/5] w-[max(100%,56rem)] -translate-x-1/2"
			style={{ maskImage: FADE, WebkitMaskImage: FADE }}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 size-full text-black/70"
				viewBox="0 0 1600 1000"
				fill="none"
			>
				{GLOBE_PATHS.map((d) => (
					<path
						key={d}
						d={d}
						stroke="currentColor"
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</svg>
			<svg
				aria-hidden="true"
				className="absolute inset-0 size-full text-white/40"
				viewBox="0 0 1600 1000"
				fill="none"
				style={{ maskImage: SPOTLIGHT, WebkitMaskImage: SPOTLIGHT }}
			>
				{GLOBE_PATHS.map((d) => (
					<path
						key={d}
						d={d}
						stroke="currentColor"
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</svg>
		</div>
	);
}
