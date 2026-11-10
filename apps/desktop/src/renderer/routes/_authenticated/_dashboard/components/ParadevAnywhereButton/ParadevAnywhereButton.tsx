import { useLingui } from "@lingui/react/macro";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ComponentProps, type RefObject, useState } from "react";
import { track } from "renderer/lib/analytics";
import {
	RAIL_ICON_CLASS,
	RAIL_ICON_STROKE_WIDTH,
	railButtonClass,
} from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import { DevicesIcon } from "./components/DevicesIcon";
import { ParadevAnywherePanel } from "./components/ParadevAnywherePanel";

type AnchorRef = NonNullable<
	ComponentProps<typeof PopoverAnchor>["virtualRef"]
>;

interface ParadevAnywhereButtonProps {
	variant: "footer" | "rail";
	side?: "top" | "right";
	anchorRef?: RefObject<HTMLElement | null>;
}

export function ParadevAnywhereButton({
	variant,
	side = variant === "rail" ? "right" : "top",
	anchorRef,
}: ParadevAnywhereButtonProps) {
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const label = t({ message: "Use Paradev anywhere" });

	const handleOpenChange = (open: boolean) => {
		if (open) track("paradev_anywhere_opened", { variant });
		setIsOpen(open);
	};

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={label}
							className={
								variant === "rail"
									? railButtonClass(isOpen)
									: cn(
											"flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
											isOpen
												? "bg-fill-selected text-muted-foreground"
												: "text-muted-foreground hover:bg-fill-hover",
										)
							}
						>
							<DevicesIcon
								className={variant === "rail" ? RAIL_ICON_CLASS : "size-3.5"}
								strokeWidth={RAIL_ICON_STROKE_WIDTH}
							/>
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side={side}>{label}</TooltipContent>
			</Tooltip>
			{/* After the trigger: it also registers as the anchor on mount, and the last one wins. */}
			{anchorRef && <PopoverAnchor virtualRef={anchorRef as AnchorRef} />}
			<PopoverContent
				side={side}
				align={side === "top" ? "start" : "end"}
				alignOffset={anchorRef ? 8 : 0}
				sideOffset={8}
				collisionPadding={8}
				onCloseAutoFocus={(event) => event.preventDefault()}
				className="w-[332px] rounded-xl p-3.5 shadow-lg"
			>
				<ParadevAnywherePanel onClose={() => setIsOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}
