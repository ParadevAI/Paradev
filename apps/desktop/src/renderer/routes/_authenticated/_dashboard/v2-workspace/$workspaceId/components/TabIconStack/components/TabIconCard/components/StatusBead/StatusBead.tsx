import { cn } from "@superset/ui/utils";
import type { CSSProperties } from "react";
import type { ActivePaneStatus } from "shared/tabs-types";
import { BREATHING_STATUSES, STATUS_BEAD_COLORS } from "./constants";

interface StatusBeadProps {
	status: ActivePaneStatus;
	className?: string;
}

/**
 * A glass bead in the status colour: a specular catch at the top left, a
 * caustic glow at the base, a pale rim, and a bloom in its own hue. A
 * status that needs you breathes; the others hold still.
 */
export function StatusBead({ status, className }: StatusBeadProps) {
	const color = STATUS_BEAD_COLORS[status];
	return (
		<span
			className={cn("pointer-events-none absolute size-[7px]", className)}
			style={{ "--bead": color } as CSSProperties}
		>
			{BREATHING_STATUSES.has(status) ? (
				<span className="absolute -inset-[1.5px] animate-pulse rounded-full bg-[var(--bead)] opacity-60 blur-[2px] motion-reduce:animate-none" />
			) : null}
			<span
				className="absolute inset-0 rounded-full"
				style={{
					backgroundColor: color,
					backgroundImage: [
						"radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.95) 0, rgb(255 255 255 / 0.5) 18%, rgb(255 255 255 / 0) 46%)",
						"radial-gradient(circle at 50% 115%, rgb(255 255 255 / 0.45), rgb(255 255 255 / 0) 58%)",
						"linear-gradient(to bottom, rgb(0 0 0 / 0) 35%, rgb(0 0 0 / 0.22))",
					].join(", "),
					boxShadow: [
						`inset 0 0 0 0.5px color-mix(in oklab, ${color} 40%, white)`,
						"inset 0 -0.75px 1px rgb(0 0 0 / 0.28)",
						"0 0 0 1px var(--tab-status-ring)",
						`0 0 3px 0 color-mix(in oklab, ${color} 70%, transparent)`,
					].join(", "),
				}}
			/>
		</span>
	);
}
