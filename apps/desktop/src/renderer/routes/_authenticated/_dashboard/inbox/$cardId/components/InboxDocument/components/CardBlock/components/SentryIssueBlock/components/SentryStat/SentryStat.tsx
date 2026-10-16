import type { ReactNode } from "react";

interface SentryStatProps {
	label: ReactNode;
	children: ReactNode;
	/** The exact value behind a rounded one, shown on hover. */
	title?: string;
}

/** One number of an issue's header: its name over its value. */
export function SentryStat({ label, children, title }: SentryStatProps) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<dt className="text-[11px] text-muted-foreground">{label}</dt>
			<dd
				title={title}
				className="truncate text-[13px] font-medium tabular-nums text-foreground"
			>
				{children}
			</dd>
		</div>
	);
}
