import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { useTitleBarSlots } from "../../providers/TitleBarSlotsProvider";
import { RoundedClip } from "../RoundedClip";
import { BareContentCardContext } from "./context";

/** Holds the open screen beside the sidebar. A screen that draws its own cards on the frame turns the card off with useBareContentCard. */
export function ContentCard({
	joinsSidebar,
	children,
}: {
	joinsSidebar: boolean;
	children: ReactNode;
}) {
	const [isBare, setIsBare] = useState(false);
	const { setContentCard } = useTitleBarSlots();
	return (
		<div
			ref={setContentCard}
			className={cn(
				"relative mr-1.5 mb-1.5 flex min-h-0 min-w-0 flex-1 rounded-[10px]",
				joinsSidebar && "rounded-l-none",
				isBare ? "bg-shell-frame" : "border border-border bg-background",
			)}
		>
			<BareContentCardContext.Provider value={setIsBare}>
				<RoundedClip
					squareLeft={joinsSidebar}
					radiusClassName={isBare ? "rounded-[10px]" : "rounded-[9px]"}
				>
					{children}
				</RoundedClip>
			</BareContentCardContext.Provider>
		</div>
	);
}
