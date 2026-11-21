import { cn } from "@superset/ui/utils";

const TONE_CLASS = {
	neutral: "bg-muted-foreground/60",
	warning: "bg-amber-500",
	critical: "bg-destructive",
} as const;

export function ResourceMeter({
	label,
	value,
	percent,
	tone,
}: {
	label: string;
	value: string;
	percent: number;
	tone: keyof typeof TONE_CLASS;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-2 text-[11px]">
				<span className="text-muted-foreground">{label}</span>
				<span className="truncate text-foreground/90">{value}</span>
			</div>
			<div className="h-1 overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full", TONE_CLASS[tone])}
					style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
				/>
			</div>
		</div>
	);
}
