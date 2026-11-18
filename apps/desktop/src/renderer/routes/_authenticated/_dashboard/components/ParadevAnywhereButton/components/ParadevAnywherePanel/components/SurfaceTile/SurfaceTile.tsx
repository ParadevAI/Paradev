import type { ReactNode } from "react";
import { SCENE_GLOW } from "./constants";

interface SurfaceTileProps {
	title: string;
	caption: string;
	onClick: () => void;
	children: ReactNode;
}

export function SurfaceTile({
	title,
	caption,
	onClick,
	children,
}: SurfaceTileProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span
				aria-hidden="true"
				className="relative h-[74px] overflow-hidden border-b border-border bg-muted/60"
				style={{ backgroundImage: SCENE_GLOW }}
			>
				<span className="absolute inset-0 flex items-end justify-center transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
					{children}
				</span>
			</span>
			<span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
				<span className="truncate text-[13px] font-medium leading-tight text-foreground">
					{title}
				</span>
				<span className="truncate text-[11px] leading-tight text-muted-foreground">
					{caption}
				</span>
			</span>
		</button>
	);
}
