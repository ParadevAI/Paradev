"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import { usePointerVars } from "./hooks/usePointerVars";

type Edges = "ring" | "horizontal";

interface EdgeGlareProps {
	/** `ring` lights the whole border; `horizontal` only a top and a bottom line. */
	edges?: Edges;
	/** Reach of the light from the cursor, in px. */
	radius?: number;
	/** Opacity of the light right at the cursor. */
	strength?: number;
	/** Opacity of the edge far from the cursor. 0 leaves it invisible until lit. */
	baseline?: number;
	thickness?: number;
	glideMs?: number;
	/** Set when a 2D scale transform sits above, so the light lands under the cursor. */
	unscale?: boolean;
	className?: string;
	style?: CSSProperties;
}

const DEFAULT_GLIDE_MS = 120;
const HIDDEN = "-9999px";
// Share of each horizontal line that fades out at its ends
const LINE_FADE = "15%";
// Keeps only the padding ring: the content box is cut out of a full fill
const RING_MASK =
	"linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)";

const white = (alpha: number) => `rgb(255 255 255 / ${alpha})`;

export function EdgeGlare({
	edges = "ring",
	radius = 240,
	strength = 0.75,
	baseline = 0,
	thickness = 1,
	glideMs = DEFAULT_GLIDE_MS,
	unscale = false,
	className = "inset-0 rounded-[inherit]",
	style,
}: EdgeGlareProps) {
	const ref = useRef<HTMLSpanElement>(null);
	usePointerVars(ref, "edge", { glideMs, unscale });

	const at = `var(--edge-mx, ${HIDDEN}) var(--edge-my, ${HIDDEN})`;
	const paint: CSSProperties =
		edges === "ring"
			? {
					padding: thickness,
					background: `radial-gradient(${radius}px circle at ${at}, ${white(strength)}, ${white(strength * 0.2)} 45%, ${white(baseline)} 70%)`,
					mask: RING_MASK,
				}
			: {
					background: ["top", "bottom"]
						.map(
							(side) =>
								`linear-gradient(90deg, transparent, ${white(strength)} ${LINE_FADE}, ${white(strength)} calc(100% - ${LINE_FADE}), transparent) ${side} / 100% ${thickness}px no-repeat`,
						)
						.join(", "),
					mask: `radial-gradient(${radius}px circle at ${at}, #000, transparent 70%)`,
				};

	return (
		<span
			ref={ref}
			aria-hidden="true"
			className={`pointer-events-none absolute ${className}`}
			style={{ ...paint, ...style }}
		/>
	);
}
