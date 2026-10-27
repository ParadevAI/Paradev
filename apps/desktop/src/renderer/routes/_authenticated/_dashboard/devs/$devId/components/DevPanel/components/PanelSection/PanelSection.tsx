import type { ReactNode } from "react";

export function PanelSection({
	title,
	children,
}: {
	title: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex h-7 items-center text-[10px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
				{title}
			</div>
			{children}
		</div>
	);
}
