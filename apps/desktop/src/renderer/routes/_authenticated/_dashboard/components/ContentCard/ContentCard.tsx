import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
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
	return (
		<div
			className={cn(
				"relative mr-1.5 mb-1.5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px]",
				joinsSidebar && "rounded-l-none",
				isBare ? "bg-shell-frame" : "border border-border bg-background",
			)}
		>
			<BareContentCardContext.Provider value={setIsBare}>
				<div className="relative flex min-h-0 min-w-0 flex-1">{children}</div>
			</BareContentCardContext.Provider>
		</div>
	);
}
