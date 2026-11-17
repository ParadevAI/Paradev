import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuX } from "react-icons/lu";

interface UnreadBannerProps {
	/** Null when the first unread message is older than what is loaded. */
	count: number | null;
	onJump: () => void;
	onMarkRead: () => void;
}

export function UnreadBanner({ count, onJump, onMarkRead }: UnreadBannerProps) {
	const { t } = useLingui();
	return (
		<div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
			<div className="pointer-events-auto flex items-center rounded-full border border-border bg-popover text-xs shadow-sm">
				<button
					type="button"
					onClick={onJump}
					className="flex items-center gap-2 rounded-l-full py-1 pr-2 pl-3 hover:bg-fill-hover"
				>
					<span className="font-medium">
						{count === null ? (
							<Trans>New messages</Trans>
						) : (
							<Plural
								value={count}
								one="# new message"
								other="# new messages"
							/>
						)}
					</span>
					<span className="text-muted-foreground">
						<Trans>Jump</Trans>
					</span>
				</button>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Mark as read" })}
							onClick={onMarkRead}
							className="flex size-6 items-center justify-center rounded-r-full border-l border-border text-muted-foreground hover:bg-fill-hover hover:text-foreground"
						>
							<LuX className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>
						<Trans>Mark as read</Trans>
						<kbd className="ml-1.5 font-sans text-muted-foreground">Esc</kbd>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
