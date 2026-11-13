import { cn } from "@superset/ui/utils";
import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTitleBarMainCard } from "../../providers/TitleBarSlotsProvider";

/** The rounded card beside the sidebar that holds the open screen. Its left edge is square while the sidebar is open, so the two read as one card. A workspace draws its own pane cards, so only other screens get the border. */
export function ContentCard({
	joinsSidebar,
	children,
}: {
	joinsSidebar: boolean;
	children: ReactNode;
}) {
	const isBordered = useLocation({
		select: (location) => !location.pathname.startsWith("/v2-workspace/"),
	});
	const [card, setCard] = useState<HTMLDivElement | null>(null);
	useTitleBarMainCard(card);
	return (
		<div
			ref={setCard}
			className={cn(
				"relative mr-1.5 mb-1.5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-background",
				joinsSidebar && "rounded-l-none",
				isBordered && "border border-border",
			)}
		>
			<div className="relative flex min-h-0 min-w-0 flex-1">{children}</div>
		</div>
	);
}
