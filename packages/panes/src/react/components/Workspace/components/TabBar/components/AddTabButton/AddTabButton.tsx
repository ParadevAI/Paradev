import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { usePaneAppearance } from "../../../../../../hooks/usePaneAppearance";
import type { AddTabMenuActions } from "../../../../../../types";

export function AddTabButton({
	renderAddTabMenu,
	onAddTab,
}: {
	renderAddTabMenu?: (actions: AddTabMenuActions) => ReactNode;
	onAddTab?: () => void;
}) {
	const { t } = useLingui();
	const pendingActionRef = useRef<(() => void) | null>(null);
	const isCards = usePaneAppearance() === "cards";
	const buttonClassName = isCards
		? HEADER_ICON_BUTTON_CLASS
		: "size-7 rounded-md border border-border/60 bg-muted/30 px-1 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground";
	const button = (
		<Button
			aria-label={t({ message: "New tab" })}
			className={buttonClassName}
			size="icon"
			type="button"
			variant="ghost"
			onClick={onAddTab}
		>
			<PlusIcon
				className={isCards ? "size-4" : "size-3.5"}
				strokeWidth={HEADER_ICON_STROKE_WIDTH}
			/>
		</Button>
	);

	if (!renderAddTabMenu) return button;

	return (
		<DropdownMenu>
			<div className="flex items-center gap-0.5">
				{onAddTab ? (
					<>
						{button}
						<DropdownMenuTrigger asChild>
							<Button
								aria-label={t({ message: "Choose tab type" })}
								className={buttonClassName}
								size="icon"
								type="button"
								variant="ghost"
							>
								<ChevronDownIcon className="size-3" />
							</Button>
						</DropdownMenuTrigger>
					</>
				) : (
					<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
				)}
			</div>
			<DropdownMenuContent
				align="end"
				className="w-56"
				onCloseAutoFocus={(event) => {
					const action = pendingActionRef.current;
					if (!action) return;
					pendingActionRef.current = null;
					event.preventDefault();
					action();
				}}
			>
				{renderAddTabMenu({
					runAfterClose: (action) => {
						pendingActionRef.current = action;
					},
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
