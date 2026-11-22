import {
	DEV_AVATAR_SHAPES,
	type DevAvatarEyes,
	type DevAvatar as DevAvatarLook,
} from "@superset/shared/dev-avatar";
import { useEffect, useRef } from "react";
import { type DevMood, trackGaze } from "./gaze";

const INK = "#1b1716";

function Eyes({ style }: { style: DevAvatarEyes }) {
	switch (style) {
		case "ovals":
			return (
				<>
					<ellipse cx="38" cy="48" rx="8" ry="10" fill="#fff" />
					<ellipse cx="62" cy="48" rx="8" ry="10" fill="#fff" />
					<circle data-pupil cx="38" cy="49" r="4.5" fill={INK} />
					<circle data-pupil cx="62" cy="49" r="4.5" fill={INK} />
				</>
			);
		case "pills":
			return (
				<>
					<rect x="33" y="38" width="10" height="20" rx="5" fill={INK} />
					<rect x="57" y="38" width="10" height="20" rx="5" fill={INK} />
				</>
			);
		case "happy":
			return (
				<path
					d="M31 51 Q38 42 45 51 M55 51 Q62 42 69 51"
					stroke={INK}
					strokeWidth="4.5"
					fill="none"
					strokeLinecap="round"
				/>
			);
		default:
			return (
				<>
					<circle cx="38" cy="48" r="6.5" fill={INK} />
					<circle cx="62" cy="48" r="6.5" fill={INK} />
					<circle cx="40" cy="45.5" r="2" fill="#fff" opacity="0.85" />
					<circle cx="64" cy="45.5" r="2" fill="#fff" opacity="0.85" />
				</>
			);
	}
}

interface DevAvatarProps {
	avatar: DevAvatarLook;
	size: number;
	mood?: DevMood;
	/** Eyes follow the pointer and blink. Off for small, dense rows. */
	alive?: boolean;
	className?: string;
}

export function DevAvatar({
	avatar,
	size,
	mood = "idle",
	alive = false,
	className,
}: DevAvatarProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const eyesRef = useRef<SVGGElement>(null);
	const closedRef = useRef<SVGPathElement>(null);

	useEffect(() => {
		const svg = svgRef.current;
		const eyes = eyesRef.current;
		const closed = closedRef.current;
		if (!alive || !svg || !eyes || !closed) return;
		return trackGaze({ svg, eyes, closed, mood, watch: true });
	}, [alive, mood]);

	const asleep = mood === "asleep";
	return (
		<svg
			ref={svgRef}
			width={size}
			height={size}
			viewBox="0 0 100 100"
			aria-hidden="true"
			className={className}
			style={{ overflow: "visible", flex: "none" }}
		>
			<path d={DEV_AVATAR_SHAPES[avatar.shape]} fill={avatar.color} />
			<g ref={eyesRef} style={{ opacity: asleep ? 0 : 1 }}>
				<Eyes style={avatar.eyes} />
			</g>
			<path
				ref={closedRef}
				d="M31 52 Q38 58 45 52 M55 52 Q62 58 69 52"
				stroke={INK}
				strokeWidth="4"
				fill="none"
				strokeLinecap="round"
				style={{ opacity: asleep ? 1 : 0 }}
			/>
		</svg>
	);
}
