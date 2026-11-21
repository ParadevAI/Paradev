import type { ReactNode } from "react";
import type { IconType } from "react-icons";

interface StepProps {
	icon: IconType;
	children: ReactNode;
	trailing?: ReactNode;
}

export function Step({ icon: Icon, children, trailing }: StepProps) {
	return (
		<div className="flex min-h-7 items-center gap-2 text-neutral-100/55">
			<Icon className="size-4 shrink-0 text-neutral-100/40" />
			<span className="min-w-0">{children}</span>
			{trailing}
		</div>
	);
}
