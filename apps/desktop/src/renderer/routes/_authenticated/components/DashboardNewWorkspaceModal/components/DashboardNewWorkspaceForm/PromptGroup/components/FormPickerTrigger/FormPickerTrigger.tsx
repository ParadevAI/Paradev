import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";
import { PILL_TRIGGER_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";

// Shared trigger for the composer's context pickers (Device / Project /
// Branch): the composer's own pill, in the muted tone, so the rows above and
// below the prompt read as one set.
export function FormPickerTrigger({
	className,
	type = "button",
	...props
}: ComponentProps<"button">) {
	return (
		<button
			type={type}
			className={cn(
				PILL_TRIGGER_CLASS,
				"group text-muted-foreground disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
