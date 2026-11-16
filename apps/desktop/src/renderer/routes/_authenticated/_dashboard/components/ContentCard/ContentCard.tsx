import { cn } from "@superset/ui/utils";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Holds the open screen beside the sidebar. A workspace draws its pane areas as their own cards, so behind it this is only frame. */
export function ContentCard({
	joinsSidebar,
	children,
}: {
	joinsSidebar: boolean;
	children: ReactNode;
}) {
	const isCard = useLocation({
		select: (location) => !location.pathname.startsWith("/v2-workspace/"),
	});
	return (
		<div
			className={cn(
				"relative mr-1.5 mb-1.5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px]",
				joinsSidebar && "rounded-l-none",
				isCard ? "border border-border bg-background" : "bg-shell-frame",
			)}
		>
			<div className="relative flex min-h-0 min-w-0 flex-1">{children}</div>
		</div>
	);
}
