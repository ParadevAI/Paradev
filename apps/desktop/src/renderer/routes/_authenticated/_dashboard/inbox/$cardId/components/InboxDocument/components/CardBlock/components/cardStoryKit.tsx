import { type ReactNode, useState } from "react";

interface CardStoryFrameProps {
	title: string;
	className?: string;
	children: (headerSlot: HTMLElement | null) => ReactNode;
}

/** A card's border and header row around one block, for stories: the block's header actions need the row to draw in. */
export function CardStoryFrame({
	title,
	className,
	children,
}: CardStoryFrameProps) {
	const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
	return (
		<div className="-m-6 h-screen overflow-y-auto p-6">
			<div
				className={`mx-auto overflow-hidden rounded-lg border border-border bg-card ${className ?? "max-w-2xl"}`}
			>
				<div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
					<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
						{title}
					</span>
					<div
						ref={setHeaderSlot}
						className="-my-1 flex shrink-0 items-center gap-1 empty:hidden"
					/>
				</div>
				{children(headerSlot)}
			</div>
		</div>
	);
}
