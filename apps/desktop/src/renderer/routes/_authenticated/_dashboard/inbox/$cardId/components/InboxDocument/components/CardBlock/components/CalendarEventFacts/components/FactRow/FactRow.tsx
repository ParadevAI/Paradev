import type { ReactNode } from "react";

interface FactRowProps {
	icon: ReactNode;
	children: ReactNode;
}

export function FactRow({ icon, children }: FactRowProps) {
	return (
		<div className="flex gap-3 text-[13px] text-foreground">
			<span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4">
				{icon}
			</span>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
