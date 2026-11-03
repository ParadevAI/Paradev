import { type ReactNode, useState } from "react";
import { useTitleBarMainCard } from "../../providers/TitleBarSlotsProvider";

/** The rounded card beside the sidebar that holds the open screen. */
export function ContentCard({ children }: { children: ReactNode }) {
	const [card, setCard] = useState<HTMLDivElement | null>(null);
	useTitleBarMainCard(card);
	return (
		<div
			ref={setCard}
			className="relative mr-1.5 mb-1.5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-sidebar"
		>
			<div className="relative flex min-h-0 min-w-0 flex-1">{children}</div>
		</div>
	);
}
