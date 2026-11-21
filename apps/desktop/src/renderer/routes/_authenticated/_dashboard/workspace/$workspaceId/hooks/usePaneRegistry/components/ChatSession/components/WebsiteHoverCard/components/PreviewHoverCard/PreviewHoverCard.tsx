import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import type { ReactNode } from "react";
import {
	WebsitePreviewCard,
	type WebsitePreviewLoad,
} from "../WebsitePreviewCard";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 100;

/** The hover card around a web link; its owner says what to load and when. */
export function PreviewHoverCard({
	children,
	load,
	onOpenChange,
	onWanted,
	open,
	url,
}: {
	children: ReactNode;
	load: WebsitePreviewLoad;
	onOpenChange: (open: boolean) => void;
	/** The pointer or focus arrived, so loading can start before the card opens. */
	onWanted?: () => void;
	open: boolean;
	url: string;
}) {
	return (
		<HoverCard
			closeDelay={CLOSE_DELAY_MS}
			onOpenChange={onOpenChange}
			open={open}
			openDelay={OPEN_DELAY_MS}
		>
			<HoverCardTrigger
				asChild
				onClick={() => onOpenChange(false)}
				onContextMenu={() => onOpenChange(false)}
				onFocus={onWanted}
				onPointerEnter={(event) => {
					if (event.pointerType !== "touch") onWanted?.();
				}}
			>
				{children}
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-foreground/[0.08] p-0 shadow-xl"
				side="top"
				sideOffset={6}
			>
				<WebsitePreviewCard load={load} url={url} />
			</HoverCardContent>
		</HoverCard>
	);
}
