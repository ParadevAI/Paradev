import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { MouseEvent, ReactNode, RefObject } from "react";

export interface PaneTitleMenuTriggerProps {
	ref: RefObject<HTMLButtonElement | null>;
	type: "button";
	"aria-haspopup": "menu";
	"aria-expanded": boolean;
	onClick: (event: MouseEvent) => void;
}

export function PaneTitleMenu({
	open,
	onOpenChange,
	triggerRef,
	renderTrigger,
	contentClassName,
	onCloseAutoFocus,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	triggerRef: RefObject<HTMLButtonElement | null>;
	renderTrigger: (props: PaneTitleMenuTriggerProps) => ReactNode;
	contentClassName?: string;
	onCloseAutoFocus?: (event: Event) => void;
	children: ReactNode;
}) {
	return (
		<span className="relative flex min-w-0 items-center">
			{renderTrigger({
				ref: triggerRef,
				type: "button",
				"aria-haspopup": "menu",
				"aria-expanded": open,
				// The pane header is a drag handle. A pointer-down trigger would open
				// the menu instead of starting the drag, so the menu opens on click.
				onClick: (event) => {
					event.stopPropagation();
					onOpenChange(!open);
				},
			})}
			<DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
				<DropdownMenuTrigger asChild>
					<span aria-hidden className="pointer-events-none absolute inset-0" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className={contentClassName}
					onClick={(event) => event.stopPropagation()}
					onPointerDownOutside={(event) => {
						if (triggerRef.current?.contains(event.target as Node)) {
							event.preventDefault();
						}
					}}
					onCloseAutoFocus={(event) => {
						onCloseAutoFocus?.(event);
						if (event.defaultPrevented) return;
						event.preventDefault();
						triggerRef.current?.focus();
					}}
				>
					{children}
				</DropdownMenuContent>
			</DropdownMenu>
		</span>
	);
}
