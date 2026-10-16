import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { forwardRef, type ReactNode, useState } from "react";
import {
	LuEllipsisVertical,
	LuExternalLink,
	LuSmilePlus,
} from "react-icons/lu";
import { useSlackWorkspace } from "../../../../providers/SlackWorkspaceProvider";
import { EmojiPicker } from "../../../EmojiPicker";
import { useMessageMenuItems } from "../../hooks/useMessageMenuItems";
import { EmojiGlyph } from "../EmojiGlyph";

const QUICK = ["white_check_mark", "eyes", "raised_hands"] as const;

interface MessageActionsProps {
	text: string;
	permalink: string | null;
	/** Absent when the reader cannot react as themselves. */
	onReact?: (name: string) => void;
	/** Keeps the bar visible while a menu it opened is up. */
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

const Action = forwardRef<
	HTMLButtonElement,
	{
		label: string;
		tooltip?: string;
		onClick?: () => void;
		children: ReactNode;
	}
>(({ label, tooltip, onClick, children, ...rest }, ref) => (
	<Tooltip delayDuration={300}>
		<TooltipTrigger asChild>
			<button
				ref={ref}
				type="button"
				aria-label={label}
				onClick={onClick}
				className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				{...rest}
			>
				{children}
			</button>
		</TooltipTrigger>
		<TooltipContent side="top">{tooltip ?? label}</TooltipContent>
	</Tooltip>
));
Action.displayName = "Action";

/** Slack's hover bar on a message: three quick reactions, the picker, the message in Slack, and More actions. */
export function MessageActions({
	text,
	permalink,
	onReact,
	onOpenChange,
	open,
}: MessageActionsProps) {
	const { emoji, workspaceUrl } = useSlackWorkspace();
	const { t } = useLingui();
	const [picker, setPicker] = useState(false);
	const [menu, setMenu] = useState(false);
	const items = useMessageMenuItems({ text, permalink });
	const quickTooltip = {
		white_check_mark: t({ message: "Completed" }),
		eyes: t({ message: "Taking a look…" }),
		raised_hands: t({ message: "Nicely done" }),
	};
	const setOpen = (which: "picker" | "menu", next: boolean) => {
		(which === "picker" ? setPicker : setMenu)(next);
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
							<EmojiGlyph
								name={name}
								emoji={emoji}
								tooltip={false}
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
								emoji={emoji}
								workspaceUrl={workspaceUrl}
								onPick={({ reaction }) => {
									onReact(reaction);
									setOpen("picker", false);
								}}
							/>
						</PopoverContent>
					</Popover>
				</>
			)}
			{permalink && (
				<Action
					label={t({ message: "Open in Slack" })}
					onClick={() => window.open(permalink, "_blank")}
				>
					<LuExternalLink className="size-4" />
				</Action>
			)}
			{items.length > 0 && (
				<DropdownMenu
					open={menu}
					onOpenChange={(next) => setOpen("menu", next)}
				>
					<DropdownMenuTrigger asChild>
						<Action label={t({ message: "More actions" })}>
							<LuEllipsisVertical className="size-4" />
						</Action>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="w-56"
						onKeyDown={(event) => {
							const item = items.find((i) => i.key?.matches(event.nativeEvent));
							if (!item) return;
							event.preventDefault();
							item.run();
							setOpen("menu", false);
						}}
					>
						{items.map((item) => (
							<DropdownMenuItem key={item.id} onSelect={item.run}>
								<item.icon className="size-4" />
								{item.label}
								{item.key && (
									<DropdownMenuShortcut>
										{item.key.display}
									</DropdownMenuShortcut>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
