import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuHash, LuSmilePlus, LuTrash2 } from "react-icons/lu";
import { useSlackWorkspace } from "../../providers/SlackWorkspaceProvider";
import { EmojiPicker } from "../EmojiPicker";
import { MessageActions } from "./components/MessageActions";
import { MessageMenu } from "./components/MessageMenu";
import { Mrkdwn } from "./components/Mrkdwn";
import { PersonCard } from "./components/PersonCard";
import { ReactionPill } from "./components/ReactionPill";
import { SlackAttachment } from "./components/SlackAttachment";
import { SlackBlocks } from "./components/SlackBlocks";
import { SlackFile } from "./components/SlackFile";
import { useSlackTime } from "./hooks/useSlackTime";
import type { ReactFn, SlackMessageView } from "./types";

export type { ReactFn, SlackMessageView } from "./types";

interface SlackMessageProps {
	message: SlackMessageView;
	/** Follows a message from the same person moments earlier, so Slack drops the avatar and name. */
	compact?: boolean;
	now: Date;
	onReact?: ReactFn;
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

export function SlackMessage({
	message,
	compact = false,
	now,
	onReact,
}: SlackMessageProps) {
	const { t } = useLingui();
	const [menuOpen, setMenuOpen] = useState(false);
	const [pickerOpen, setPickerOpen] = useState(false);
	const time = useSlackTime(now);
	const { people, emoji, workspaceUrl } = useSlackWorkspace();
	const author = people.get(message.user.id) ?? message.user;
	const react = onReact
		? (name: string) => {
				const existing = message.reactions.find((r) => r.name === name);
				onReact(message.ts, name, existing?.mine ?? false);
			}
		: undefined;

	return (
		<MessageMenu
			text={message.text}
			permalink={message.permalink}
			onOpenChange={setMenuOpen}
		>
			<div
				className={cn(
					"group/msg relative grid grid-cols-[36px_1fr] gap-x-2.5 px-4 transition-colors hover:bg-fill-hover/60",
					compact ? "py-0.5" : "pt-2 pb-1",
					message.broadcast && "bg-warning/[0.07] hover:bg-warning/10",
					menuOpen && "bg-fill-hover/60",
				)}
			>
				<MessageActions
					text={message.text}
					permalink={message.permalink}
					onReact={react}
					open={menuOpen}
					onOpenChange={setMenuOpen}
				/>
				{message.broadcast && (
					<div className="col-span-2 mb-1 flex items-center gap-2 text-[13px] text-muted-foreground">
						<LuHash className="ml-auto size-3.5 w-9 text-blue-500 dark:text-sky-400" />
						<span className="-ml-[2px] flex-1">
							<Trans>Also sent to the channel</Trans>
						</span>
					</div>
				)}
				{compact ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<span className="-ml-2 h-[22px] whitespace-nowrap pt-0.5 text-right text-[10.5px] leading-[22px] text-muted-foreground opacity-0 group-hover/msg:opacity-100">
								{time.clock(message.ts)}
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">{time.sent(message.ts)}</TooltipContent>
					</Tooltip>
				) : message.deleted ? (
					<span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<LuTrash2 className="size-4" />
					</span>
				) : (
					<PersonCard person={author}>
						<button type="button" className="mt-0.5 h-9 cursor-default">
							<Avatar className="size-9 rounded-lg">
								{message.user.avatar ? (
									<AvatarImage src={message.user.avatar} alt="" />
								) : null}
								<AvatarFallback className="rounded-lg bg-chart-4/80 text-[11px] font-bold text-white">
									{initials(message.user.name)}
								</AvatarFallback>
							</Avatar>
						</button>
					</PersonCard>
				)}
				<div className="min-w-0">
					{message.deleted && (
						<div className="pt-2 text-[13px] text-muted-foreground">
							<Trans>This message was deleted.</Trans>
						</div>
					)}
					{!compact && !message.deleted && (
						<div className="flex items-baseline gap-2 leading-tight">
							<PersonCard person={author}>
								<button
									type="button"
									className="cursor-default truncate text-[13.5px] font-bold text-foreground hover:underline"
								>
									{message.user.name}
								</button>
							</PersonCard>
							{message.user.isBot && (
								<span className="rounded-sm bg-muted px-1 text-[9.5px] font-semibold tracking-wide text-muted-foreground uppercase">
									<Trans>App</Trans>
								</span>
							)}
							<span className="shrink-0 text-[11px] text-muted-foreground">
								{time.sent(message.ts)}
							</span>
						</div>
					)}
					{!message.deleted && message.blocks.length === 0 && message.text && (
						<div
							className={cn(
								"break-words text-[13px] leading-relaxed text-foreground",
								!compact && "mt-0.5",
							)}
						>
							<Mrkdwn text={message.text} />
							{message.edited && (
								<span className="ml-1 text-[11px] text-muted-foreground">
									<Trans>(edited)</Trans>
								</span>
							)}
						</div>
					)}
					{message.blocks.length > 0 && (
						<div className={cn(!compact && "mt-0.5")}>
							<SlackBlocks
								blocks={message.blocks}
								permalink={message.permalink}
							/>
							{message.edited && (
								<span className="text-[11px] text-muted-foreground">
									<Trans>(edited)</Trans>
								</span>
							)}
						</div>
					)}
					{message.attachments.map((attachment, index) => (
						<SlackAttachment
							key={`${attachment.title ?? ""}-${index}`}
							attachment={attachment}
							asOf={time.asOf(message.ts)}
							sentAt={attachment.ts ? time.sent(attachment.ts) : null}
							permalink={message.permalink}
						/>
					))}
					{message.files.length > 0 && (
						<div className="mt-1.5 flex flex-col gap-2">
							{message.files.map((file) => (
								<SlackFile key={file.id} file={file} />
							))}
						</div>
					)}
					{message.reactions.length > 0 && (
						<div className="mt-1.5 flex flex-wrap gap-1">
							{message.reactions.map((reaction) => (
								<ReactionPill
									key={reaction.name}
									reaction={reaction}
									onToggle={react ? () => react(reaction.name) : undefined}
								/>
							))}
							{react && (
								<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
									<PopoverTrigger asChild>
										<button
											type="button"
											aria-label={t({ message: "Add reaction" })}
											className="inline-flex h-6 items-center rounded-full bg-fill-hover px-2 text-muted-foreground transition-colors hover:bg-fill-selected hover:text-foreground"
										>
											<LuSmilePlus className="size-3.5" />
										</button>
									</PopoverTrigger>
									<PopoverContent
										side="top"
										align="start"
										className="w-auto p-0"
									>
										<EmojiPicker
											emoji={emoji}
											workspaceUrl={workspaceUrl}
											onPick={({ reaction }) => {
												react(reaction);
												setPickerOpen(false);
											}}
										/>
									</PopoverContent>
								</Popover>
							)}
						</div>
					)}
				</div>
			</div>
		</MessageMenu>
	);
}
