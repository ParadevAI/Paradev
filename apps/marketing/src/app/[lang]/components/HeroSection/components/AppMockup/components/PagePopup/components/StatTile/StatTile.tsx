import type { ReactNode } from "react";

export function StatTile({
	label,
	value,
	delta,
}: {
	label: ReactNode;
	value: string;
	delta: string;
}) {
	return (
		<div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
			<div className="text-[10px] text-muted-foreground/70">{label}</div>
			<div className="mt-1 flex items-baseline gap-2">
				<span className="text-[18px] font-medium tabular-nums tracking-tight text-foreground">
					{value}
				</span>
				<span className="font-mono text-[10px] text-emerald-400/90">
					{delta}
				</span>
			</div>
		</div>
	);
}
