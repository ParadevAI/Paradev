import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type KeyboardEvent, useEffect, useState } from "react";
import { LuPaperclip, LuReply } from "react-icons/lu";
import { LetterAvatar } from "../../../LetterAvatar";
import type { GmailMessageView } from "../../types";
import { gmailTime } from "../../utils/gmailTime";
import { AttachmentList } from "../AttachmentList";
import { IconAction } from "./components/IconAction";
import { MessageBody } from "./components/MessageBody";
import { MessageMenu } from "./components/MessageMenu";
import { RecipientsDetails } from "./components/RecipientsDetails";
import { StarButton } from "./components/StarButton";
import type { ReplyMode } from "./types";

interface GmailMessageProps {
	message: GmailMessageView;
	open: boolean;
	me: string;
	/** The reader's photo, drawn when the message is theirs. */
	mePhoto?: string | null;
	subject: string;
	gmailUrl: string;
	now: Date;
	onToggle?: () => void;
	onReply?: (mode: ReplyMode) => void;
	onStar?: (starred: boolean) => void;
	onMailto?: (href: string) => void;
}

function othersCount(message: GmailMessageView, me: string): number {
	const emails = new Set(
		[message.from, ...message.to, ...message.cc].map((a) =>
			a.email.toLowerCase(),
		),
	);
	emails.delete(me.toLowerCase());
	return emails.size;
}

function toggleProps(onToggle?: () => void) {
	if (!onToggle) return {};
	return {
		role: "button" as const,
		tabIndex: 0,
		onClick: onToggle,
		onKeyDown: (event: KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				onToggle();
			}
		},
	};
}

/** One message of the thread, open with its headers and body, or folded to a line the way Gmail folds read ones. */
export function GmailMessage({
	message,
	open,
	me,
	mePhoto,
	subject,
	gmailUrl,
	now,
	onToggle,
	onReply,
	onStar,
	onMailto,
}: GmailMessageProps) {
	const { t } = useLingui();
	const photo =
		message.from.email.toLowerCase() === me.toLowerCase() ? mePhoto : null;
	const time = gmailTime(now);
	const long = time.long(message.date);
	const when = long.relative
		? `${long.absolute} (${long.relative})`
		: long.absolute;
	const name = message.from.name ?? message.from.email;
	const [starred, setStarred] = useState(message.starred);
	useEffect(() => setStarred(message.starred), [message.starred]);
	const star = onStar
		? (next: boolean) => {
				setStarred(next);
				onStar(next);
			}
		: undefined;

	if (!open) {
		return (
			<div
				{...toggleProps(onToggle)}
				className={cn(
					"grid grid-cols-[40px_1fr_auto] gap-x-4 px-4 py-5 text-left",
					onToggle && "cursor-pointer",
				)}
			>
				<LetterAvatar address={message.from} photo={photo} />
				<div className="min-w-0">
					<div className="truncate text-[14px] leading-5 font-bold text-foreground">
						{name}
					</div>
					<div className="truncate text-[13px] leading-[19.5px] text-muted-foreground">
						{message.snippet}
					</div>
				</div>
				<div className="flex h-5 items-center gap-1">
					<span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted-foreground">
						{message.attachments.length > 0 && (
							<LuPaperclip className="size-3.5" aria-hidden />
						)}
						{when}
					</span>
					<StarButton starred={starred} onStar={star} />
				</div>
			</div>
		);
	}

	return (
		<article className="px-4 pt-5 pb-6">
			<div
				{...toggleProps(onToggle)}
				className={cn(
					"grid grid-cols-[40px_1fr_auto] gap-x-4",
					onToggle && "cursor-pointer",
				)}
			>
				<LetterAvatar address={message.from} photo={photo} />
				<div className="min-w-0">
					<div className="flex min-w-0 items-baseline gap-1">
						<span className="shrink-0 text-[14px] leading-5 font-bold text-foreground">
							{name}
						</span>
						{message.from.name && (
							<span className="truncate text-[12px] text-muted-foreground">
								&lt;{message.from.email}&gt;
							</span>
						)}
					</div>
					<RecipientsDetails
						message={message}
						me={me}
						subject={subject}
						when={time.full(message.date)}
					/>
				</div>
				<div className="flex h-5 items-center">
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<span className="mr-2 flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted-foreground">
								{message.attachments.length > 0 && (
									<LuPaperclip className="size-3.5" aria-hidden />
								)}
								{when}
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{time.full(message.date)}
						</TooltipContent>
					</Tooltip>
					<StarButton starred={starred} onStar={star} />
					{onReply && (
						<IconAction
							label={t({ message: "Reply" })}
							onClick={() => onReply("reply")}
						>
							<LuReply className="size-5" />
						</IconAction>
					)}
					<MessageMenu
						gmailUrl={gmailUrl}
						canReplyAll={othersCount(message, me) > 1}
						onReply={onReply}
					/>
				</div>
			</div>
			<div className="mt-5 pl-14">
				<MessageBody
					message={message}
					gmailUrl={gmailUrl}
					onMailto={onMailto}
				/>
				{message.attachments.length > 0 && (
					<AttachmentList attachments={message.attachments} />
				)}
			</div>
		</article>
	);
}
