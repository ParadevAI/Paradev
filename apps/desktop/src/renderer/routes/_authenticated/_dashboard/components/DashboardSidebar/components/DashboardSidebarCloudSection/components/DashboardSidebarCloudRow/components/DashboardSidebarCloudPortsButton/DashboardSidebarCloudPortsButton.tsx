import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { type ReactNode, useState } from "react";
import { useHoverCardSafeTriangle } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useHoverCardSafeTriangle";
import { PortsCountIcon } from "renderer/routes/_authenticated/_dashboard/components/PortsCountIcon";

interface DashboardSidebarCloudPortsButtonProps {
	count: number;
	card: ReactNode;
	onOpenChange?: (open: boolean) => void;
}

export function DashboardSidebarCloudPortsButton({
	count,
	card,
	onOpenChange,
}: DashboardSidebarCloudPortsButtonProps) {
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const setOpen = (open: boolean) => {
		setIsOpen(open);
		onOpenChange?.(open);
	};
	const safeTriangle = useHoverCardSafeTriangle(isOpen, setOpen);
	return (
		<HoverCard
			open={isOpen}
			onOpenChange={safeTriangle.onOpenChange}
			openDelay={150}
			closeDelay={120}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					onClick={() => setOpen(!isOpen)}
					onPointerLeave={safeTriangle.onTriggerPointerLeave}
					aria-expanded={isOpen}
					aria-label={t({
						message: plural(count, {
							one: "# active port — show details",
							other: "# active ports — show details",
						}),
					})}
					className="mr-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<PortsCountIcon count={count} />
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				ref={safeTriangle.setCardElement}
				onPointerEnter={safeTriangle.onCardPointerEnter}
				side="right"
				align="start"
				sideOffset={8}
				className="w-64 p-0"
				onClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => event.stopPropagation()}
			>
				{card}
			</HoverCardContent>
		</HoverCard>
	);
}
