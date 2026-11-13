import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { useTitleBarMainCard } from "../../providers/TitleBarSlotsProvider";

/** The rounded card beside the sidebar that holds the open screen. Its left edge is square while the sidebar is open, so the two read as one card. */
export function ContentCard({
	joinsSidebar,
	isBordered,
	children,
}: {
	joinsSidebar: boolean;
	isBordered: boolean;
	children: ReactNode;
}) {
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
