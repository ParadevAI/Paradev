"use client";

import Image from "next/image";
import { EdgeGlare } from "@/app/[lang]/components/EdgeGlare";

// The macOS icon grid: the squircle sits 9.77% in from the canvas edge
const SQUIRCLE_INSET = "9.77%";
const SQUIRCLE_RADIUS = "21.5%";

export function DockAppIcon() {
	return (
		<span className="relative block size-24 motion-safe:animate-[dock-icon-float_9s_ease-in-out_infinite] sm:size-28 md:size-32">
			<span
				aria-hidden="true"
				className="pointer-events-none absolute -inset-3 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.22),transparent_70%)]"
			/>
			<Image
				src="/app-icons/paradev.png"
				alt=""
				width={192}
				height={192}
				priority
				className="relative size-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]"
			/>
			<EdgeGlare
				radius={220}
				strength={0.8}
				baseline={0.05}
				className=""
				style={{ inset: SQUIRCLE_INSET, borderRadius: SQUIRCLE_RADIUS }}
			/>
		</span>
	);
}
