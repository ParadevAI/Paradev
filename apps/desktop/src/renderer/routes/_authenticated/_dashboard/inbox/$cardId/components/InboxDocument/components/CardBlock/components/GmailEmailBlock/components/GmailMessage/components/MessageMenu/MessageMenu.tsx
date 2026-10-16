import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuEllipsisVertical,
	LuExternalLink,
	LuForward,
	LuReply,
	LuReplyAll,
} from "react-icons/lu";
import type { ReplyMode } from "../../types";

interface MessageMenuProps {
	gmailUrl: string;
	canReplyAll: boolean;
	onReply?: (mode: ReplyMode) => void;
}

/** Gmail's ⋮ menu on an open message. */
export function MessageMenu({
	gmailUrl,
	canReplyAll,
	onReply,
}: MessageMenuProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={400}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "More" })}
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
							className={cn(
								"flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground",
								open && "bg-fill-hover text-foreground",
							)}
						>
							<LuEllipsisVertical className="size-5" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{t({ message: "More" })}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				className="w-56"
				onClick={(event) => event.stopPropagation()}
			>
				{onReply && (
					<>
						<DropdownMenuItem onSelect={() => onReply("reply")}>
							<LuReply className="size-4" />
							{t({ message: "Reply" })}
						</DropdownMenuItem>
						{canReplyAll && (
							<DropdownMenuItem onSelect={() => onReply("replyAll")}>
								<LuReplyAll className="size-4" />
								{t({ message: "Reply all" })}
							</DropdownMenuItem>
						)}
						<DropdownMenuItem onSelect={() => onReply("forward")}>
							<LuForward className="size-4" />
							{t({ message: "Forward" })}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem onSelect={() => window.open(gmailUrl, "_blank")}>
					<LuExternalLink className="size-4" />
					{t({ message: "Open in Gmail" })}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
