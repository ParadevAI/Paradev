import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

const TINTS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

const GLYPHS: readonly ReactNode[] = [
	<>
		<circle cx="8" cy="8" opacity="0.4" r="6.5" />
		<circle cx="8" cy="8" r="3" />
	</>,
	<>
		<rect height="5.5" opacity="0.45" rx="1.5" width="5.5" x="1.5" y="1.5" />
		<rect height="5.5" rx="1.5" width="5.5" x="9" y="1.5" />
		<rect height="5.5" rx="1.5" width="5.5" x="1.5" y="9" />
		<rect height="5.5" opacity="0.45" rx="1.5" width="5.5" x="9" y="9" />
	</>,
	<>
		<path d="M8 1 15 8 8 15 1 8Z" opacity="0.4" />
		<path d="M8 4.5 11.5 8 8 11.5 4.5 8Z" />
	</>,
	<>
		<circle cx="4.5" cy="8" opacity="0.5" r="3.5" />
		<circle cx="11.5" cy="8" r="3.5" />
	</>,
	<>
		<path d="M8 1.5 14.5 13.5H1.5Z" opacity="0.4" />
		<circle cx="8" cy="10" r="2.5" />
	</>,
	<>
		<rect height="13" opacity="0.4" rx="2" width="3" x="2" y="1.5" />
		<rect height="13" rx="2" width="3" x="6.5" y="1.5" />
		<rect height="13" opacity="0.4" rx="2" width="3" x="11" y="1.5" />
	</>,
];

function seedHash(seed: string): number {
	let hash = 0;
	for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return hash;
}

export function SubagentAvatar({
	seed,
	className,
}: {
	seed: string;
	className?: string;
}) {
	const hash = seedHash(seed);
	return (
		<svg
			aria-hidden="true"
			className={cn("size-3.5 shrink-0", className)}
			fill="currentColor"
			style={{ color: TINTS[hash % TINTS.length] }}
			viewBox="0 0 16 16"
		>
			{GLYPHS[(hash >>> 7) % GLYPHS.length]}
		</svg>
	);
}

export function SubagentAvatarStack({ seeds }: { seeds: readonly string[] }) {
	return (
		<span
			aria-hidden="true"
			className="inline-flex shrink-0 items-center gap-0.5"
		>
			{seeds.map((seed) => (
				<SubagentAvatar key={seed} seed={seed} />
			))}
		</span>
	);
}
