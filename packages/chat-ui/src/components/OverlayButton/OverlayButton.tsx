import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";

/** A round button on a dark scrim, as the image preview draws them. */
export function OverlayButton({
	className,
	...props
}: Omit<ComponentProps<"button">, "type">) {
	return (
		<button
			{...props}
			className={cn(
				"flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/10",
				className,
			)}
			type="button"
		/>
	);
}
