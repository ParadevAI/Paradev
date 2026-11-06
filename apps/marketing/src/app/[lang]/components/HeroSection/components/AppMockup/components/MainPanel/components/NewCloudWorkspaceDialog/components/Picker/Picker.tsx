import type { ReactNode } from "react";
import { LuChevronsUpDown } from "react-icons/lu";

export function Picker({
	icon,
	children,
}: {
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-[10.5px] text-foreground/90">
			{icon}
			{children}
			<LuChevronsUpDown className="size-2.5 text-muted-foreground/45" />
		</span>
	);
}
