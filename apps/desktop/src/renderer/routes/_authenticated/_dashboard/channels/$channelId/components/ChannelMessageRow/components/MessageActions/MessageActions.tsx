import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { Fragment, useState } from "react";
import {
	LuEllipsisVertical,
	LuMessageSquareText,
	LuSmilePlus,
} from "react-icons/lu";
import type { MessageMenuItem } from "../../hooks/useMessageMenuItems";
import { EmojiPicker } from "../EmojiPicker";
import { ReactionEmoji } from "../ReactionEmoji";
import { Action } from "./components/Action";

const QUICK = ["white_check_mark", "eyes", "raised_hands"] as const;

interface MessageActionsProps {
	menu: MessageMenuItem[][];
	/** Absent when the reader cannot react here. */
	onReact?: (emoji: string) => void;
	onReply?: () => void;
	/** Keeps the bar up while a menu it opened is showing. */
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Slack's hover bar: three quick reactions, the emoji picker, reply in thread, and More actions. */
export function MessageActions({
	menu,
	onReact,
	onReply,
	open,
	onOpenChange,
}: MessageActionsProps) {
	const { t } = useLingui();
	const [picker, setPicker] = useState(false);
	const [more, setMore] = useState(false);
	const quickTooltip = {
		white_check_mark: t({ message: "Completed" }),
		eyes: t({ message: "Taking a look…" }),
		raised_hands: t({ message: "Nicely done" }),
	};
	const setOpen = (which: "picker" | "more", next: boolean) => {
		(which === "picker" ? setPicker : setMore)(next);
		onOpenChange(next);
	};

	return (
		<div
			className={cn(
				"absolute -top-4 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-md transition-opacity duration-100",
				open
					? "opacity-100"
					: "pointer-events-none opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100",
			)}
		>
			{onReact && (
				<>
					{QUICK.map((name) => (
						<Action
							key={name}
							label={t({ message: `React with ${name}` })}
							tooltip={quickTooltip[name]}
							onClick={() => onReact(name)}
						>
							<ReactionEmoji
								name={name}
								className="flex size-5 items-center justify-center text-[17px] leading-none"
							/>
						</Action>
					))}
					<Popover
						open={picker}
						onOpenChange={(next) => setOpen("picker", next)}
					>
						<PopoverTrigger asChild>
							<Action
								label={t({ message: "Add reaction…" })}
								tooltip={t({ message: "Find another reaction" })}
							>
								<LuSmilePlus className="size-[18px]" />
							</Action>
						</PopoverTrigger>
						<PopoverContent side="top" align="end" className="w-auto p-0">
							<EmojiPicker
								onPick={({ reaction }) => {
									onReact(reaction);
									setOpen("picker", false);
								}}
							/>
						</PopoverContent>
					</Popover>
				</>
			)}
			{onReply && (
				<Action label={t({ message: "Reply in thread" })} onClick={onReply}>
					<LuMessageSquareText className="size-4" />
				</Action>
			)}
			<DropdownMenu open={more} onOpenChange={(next) => setOpen("more", next)}>
				<DropdownMenuTrigger asChild>
					<Action label={t({ message: "More actions" })}>
						<LuEllipsisVertical className="size-4" />
					</Action>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					{menu.map((group, index) => (
						<Fragment key={group[0]?.id}>
							{index > 0 && <DropdownMenuSeparator />}
							{group.map((item) => (
								<DropdownMenuItem
									key={item.id}
									variant={item.destructive ? "destructive" : "default"}
									onSelect={item.run}
								>
									<item.icon className="size-4" />
									{item.label}
								</DropdownMenuItem>
							))}
						</Fragment>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
