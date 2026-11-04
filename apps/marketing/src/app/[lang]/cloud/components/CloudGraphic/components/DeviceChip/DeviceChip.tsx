import type { ReactNode } from "react";

interface DeviceChipProps {
	icon: ReactNode;
	children: ReactNode;
}

export function DeviceChip({ icon, children }: DeviceChipProps) {
	return (
		<div className="relative flex flex-col items-center">
			<span className="absolute bottom-full mb-1 h-8 border-brand/50 border-l border-dashed sm:h-12" />
			<div className="flex w-full items-center justify-center gap-2 border border-border bg-background px-3 py-2 text-muted-foreground text-xs">
				{icon}
				<span className="truncate">{children}</span>
			</div>
		</div>
	);
}
