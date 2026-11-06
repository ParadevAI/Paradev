import type { ReactNode } from "react";
import { LuChevronsUpDown } from "react-icons/lu";

interface PickerProps {
	icon: ReactNode;
	children: ReactNode;
	highlighted?: boolean;
}

export function Picker({ icon, children, highlighted }: PickerProps) {
	return (
		<span
			className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] ${highlighted ? "bg-foreground/[0.07] text-foreground/95" : "text-foreground/70"}`}
		>
			<span className={highlighted ? "text-brand-light" : "text-foreground/50"}>
				{icon}
			</span>
			{children}
			<LuChevronsUpDown className="size-3 text-foreground/35" />
		</span>
	);
}
