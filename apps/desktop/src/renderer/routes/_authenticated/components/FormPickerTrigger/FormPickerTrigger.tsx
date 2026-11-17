import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { PILL_TRIGGER_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";

// Shared trigger for the top-of-modal pickers (Device / Project / Branch).
// No background; uniform icon size, text size, and text color so the three
// pickers read as one segmented control.
export function FormPickerTrigger({
	className,
	type = "button",
	...props
}: ComponentProps<"button">) {
	const isParadevShell = useParadevShell();
	return (
		<button
			type={type}
			className={cn(
				isParadevShell
					? cn(
							PILL_TRIGGER_CLASS,
							"group text-muted-foreground disabled:opacity-50",
						)
					: "inline-flex items-center gap-1 h-[22px] text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0",
				className,
			)}
			{...props}
		/>
	);
}
