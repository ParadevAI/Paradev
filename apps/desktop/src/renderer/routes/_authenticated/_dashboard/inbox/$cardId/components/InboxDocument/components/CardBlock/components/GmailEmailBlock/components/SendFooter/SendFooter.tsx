import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useRef } from "react";
import {
	LuCalendarClock,
	LuChevronDown,
	LuExternalLink,
	LuLink,
	LuPaperclip,
	LuTrash2,
	LuType,
} from "react-icons/lu";
import { formatHotkeyDisplay } from "renderer/hotkeys/display";
import { PLATFORM } from "renderer/hotkeys/registry";
import { useActionKey } from "../../../../providers/ActionKeysProvider";
import { ActionKeycap } from "../../../ActionKeycap";

interface SendFooterProps {
	canSend: boolean;
	/** Why Send is off, shown on hover; recipients missing needs none. */
	blockedReason?: string | null;
	pending: boolean;
	failure: string | null;
	gmailUrl: string;
	formatting: boolean;
	onSend: () => void;
	onSchedule?: () => void;
	onToggleFormatting: () => void;
	onAttach: (files: File[]) => void;
	onLink: () => void;
	onDiscard: () => void;
}

function Icon({
	label,
	keys,
	active,
	disabled,
	onClick,
	children,
}: {
	label: string;
	keys?: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={active}
					disabled={disabled}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClick}
					className={cn(
						"flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
						active && "bg-fill-selected text-foreground",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				{label}
				{keys && <span className="ml-2 text-muted-foreground">{keys}</span>}
			</TooltipContent>
		</Tooltip>
	);
}

/** Gmail's bottom bar: Send with schedule beside it, formatting, attach, link, and discard on the right. */
export function SendFooter({
	canSend,
	blockedReason,
	pending,
	failure,
	gmailUrl,
	formatting,
	onSend,
	onSchedule,
	onToggleFormatting,
	onAttach,
	onLink,
	onDiscard,
}: SendFooterProps) {
	const { t } = useLingui();
	const picker = useRef<HTMLInputElement>(null);
	const sendKey = useActionKey("send");
	const shortcut = (chord: string) =>
		formatHotkeyDisplay(
			PLATFORM === "mac" ? chord : chord.replace("meta", "ctrl"),
			PLATFORM,
		).text;
	const ready = canSend && !blockedReason && !pending;
	return (
		<div className="flex items-center gap-1 px-3 pt-2 pb-3">
			<div
				className={cn(
					"flex h-9 overflow-hidden rounded-full text-[14px] font-medium",
					ready
						? "bg-primary text-primary-foreground"
						: "bg-muted text-muted-foreground",
				)}
			>
				<Tooltip delayDuration={400}>
					<TooltipTrigger asChild>
						<button
							type="button"
							disabled={!ready}
							data-action-key={sendKey}
							onClick={onSend}
							className={cn("pr-4 pl-6", ready && "hover:bg-primary/90")}
						>
							{pending ? t({ message: "Sending…" }) : t({ message: "Send" })}
							<ActionKeycap slot={sendKey} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{blockedReason ?? (
							<>
								{t({ message: "Send" })}
								<span className="ml-2 text-muted-foreground">
									{shortcut("meta+enter")}
								</span>
							</>
						)}
					</TooltipContent>
				</Tooltip>
				{onSchedule && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								disabled={!ready}
								aria-label={t({ message: "More send options" })}
								className={cn(
									"flex w-8 items-center justify-center border-l",
									ready
										? "border-primary-foreground/30 hover:bg-primary/90"
										: "border-border",
								)}
							>
								<LuChevronDown className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-44">
							<DropdownMenuItem onSelect={onSchedule}>
								<LuCalendarClock className="size-4" />
								{t({ message: "Schedule send" })}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			<Icon
				label={t({ message: "Formatting options" })}
				active={formatting}
				onClick={onToggleFormatting}
			>
				<LuType className="size-[18px]" />
			</Icon>
			<Icon
				label={t({ message: "Attach files" })}
				onClick={() => picker.current?.click()}
			>
				<LuPaperclip className="size-[18px]" />
			</Icon>
			<input
				ref={picker}
				type="file"
				multiple
				hidden
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = "";
					if (files.length > 0) onAttach(files);
				}}
			/>
			<Icon
				label={t({ message: "Insert link" })}
				keys={shortcut("meta+k")}
				onClick={onLink}
			>
				<LuLink className="size-[18px]" />
			</Icon>
			<Tooltip delayDuration={400}>
				<TooltipTrigger asChild>
					<a
						href={gmailUrl}
						target="_blank"
						rel="noreferrer"
						aria-label={t({ message: "Open in Gmail" })}
						className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						<LuExternalLink className="size-[18px]" />
					</a>
				</TooltipTrigger>
				<TooltipContent side="top">
					{t({ message: "Open in Gmail" })}
				</TooltipContent>
			</Tooltip>
			<span className="flex-1" />
			{failure && (
				<span role="alert" className="truncate text-[12px] text-destructive">
					{failure}
				</span>
			)}
			<Icon
				label={t({ message: "Discard draft" })}
				disabled={pending}
				onClick={onDiscard}
			>
				<LuTrash2 className="size-[18px]" />
			</Icon>
		</div>
	);
}
