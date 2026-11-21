import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { ShimmerText } from "../../../ShimmerText";

interface TabProps {
	icon: ReactNode;
	label: ReactNode;
	active?: boolean;
	working?: boolean;
}

export function Tab({ icon, label, active, working }: TabProps) {
	return (
		<div
			className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md pl-2 ${active ? "bg-neutral-100/[0.12] pr-1" : "pr-2"}`}
		>
			{icon}
			{working ? (
				<ShimmerText className="whitespace-nowrap">{label}</ShimmerText>
			) : (
				<span
					className={`whitespace-nowrap ${active ? "text-neutral-100/90" : "text-neutral-100/70"}`}
				>
					{label}
				</span>
			)}
			{active && (
				<span className="flex size-5 items-center justify-center rounded-[5px] text-neutral-100/55">
					<LuX className="size-3.5" />
				</span>
			)}
		</div>
	);
}
