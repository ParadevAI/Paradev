import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuChevronDown, LuForward, LuReply, LuReplyAll } from "react-icons/lu";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { LetterAvatar } from "../../../LetterAvatar";
import type { AttachmentChange } from "../../hooks/useDraftAttachments";
import { useGmailCompose } from "../../hooks/useGmailCompose";
import type { GmailAddress, GmailEmailView, GmailThread } from "../../types";
import { byEmail, chipLabel, formatRecipient } from "../../utils/addresses";
import { type SendInput, sendInput } from "../../utils/emailBody";
import { GMAIL_EDITOR_FEATURES } from "../../utils/gmailEditor";
import { BlockedFilesBar } from "../BlockedFilesBar";
import { ComposeAttachments } from "../ComposeAttachments";
import { FileDropZone } from "../FileDropZone";
import { FormattingBar } from "../FormattingBar";
import { FromField } from "../FromField";
import type { ReplyMode } from "../GmailMessage";
import { LinkPopover } from "../LinkPopover";
import { QuoteToggle } from "../QuoteToggle";
import { RecipientField } from "../RecipientField";
import { ScheduleSendDialog } from "../ScheduleSendDialog";
import { SendFooter } from "../SendFooter";

interface GmailComposerProps {
	thread: GmailThread;
	draft: GmailEmailView["draft"];
	sendAs: GmailEmailView["sendAs"];
	me: GmailAddress;
	mePhoto?: string | null;
	known: GmailAddress[];
	gmailUrl: string;
	pending: boolean;
	failure: string | null;
	/** Set by a message's reply buttons: switches the box to that mode for that message and focuses it. */
	request: { mode: ReplyMode; of: string; at: number } | null;
	onSend: (input: SendInput & AttachmentChange) => void;
	/** Absent when there is no Gmail draft behind the composer: files then go with Send. */
	onSaveDraft?: (input: SendInput & AttachmentChange) => void;
	onSchedule?: (input: SendInput & AttachmentChange, at: Date) => void;
	onRemoveBlockedAndSend: (input: SendInput & AttachmentChange) => void;
	onDiscard: () => void;
}

/** Gmail's reply box under the thread, holding the agent's draft: reply, reply all or forward, with Gmail's formatting, files and schedule. */
export function GmailComposer({
	thread,
	draft,
	sendAs,
	me,
	mePhoto,
	known,
	gmailUrl,
	pending,
	failure,
	request,
	onSend,
	onSaveDraft,
	onSchedule,
	onRemoveBlockedAndSend,
	onDiscard,
}: GmailComposerProps) {
	const { t } = useLingui();
	const last = thread.messages[thread.messages.length - 1];
	const [mode, setMode] = useState<ReplyMode>(
		request?.mode ?? (draft.replyAll ? "replyAll" : "reply"),
	);
	const [of, setOf] = useState(request?.of ?? last?.id);
	const [to, setTo] = useState(draft.to);
	const [cc, setCc] = useState(draft.cc);
	const [bcc, setBcc] = useState(draft.bcc);
	const [expanded, setExpanded] = useState(request?.mode === "forward");
	const [showCc, setShowCc] = useState(draft.cc.length > 0);
	const [showBcc, setShowBcc] = useState(draft.bcc.length > 0);
	const [showQuoted, setShowQuoted] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const target = thread.messages.find((m) => m.id === of) ?? last;
	const canReplyAll =
		thread.replyAll.to.length + thread.replyAll.cc.length >
		thread.reply.to.length + thread.reply.cc.length;

	const fields = (): SendInput | null => {
		const current = compose.editor.current;
		if (!current) return null;
		const when = target
			? formatDate(new Date(target.date), {
					dateStyle: "medium",
					timeStyle: "short",
				})
			: "";
		const sender = target ? formatRecipient(target.from) : "";
		return compose.withFrom({
			...sendInput(current, {
				to,
				cc,
				bcc,
				subject: mode === "forward" ? "" : draft.subject,
				attribution:
					target && mode !== "forward"
						? t({ message: `On ${when} ${sender} wrote:` })
						: undefined,
			}),
			mode: mode === "forward" ? "forward" : "reply",
			...(target ? { of: target.id } : {}),
		});
	};
	const compose = useGmailCompose({
		draft,
		sendAs,
		failure,
		onSaveDraft:
			onSaveDraft &&
			((change) => {
				const input = fields();
				if (input) onSaveDraft({ ...input, ...change });
			}),
	});
	const { files } = compose;

	const choose = (next: ReplyMode) => {
		setMode(next);
		if (next === "forward") {
			setTo([]);
			setCc([]);
			setExpanded(true);
			return;
		}
		const recipients = next === "replyAll" ? thread.replyAll : thread.reply;
		setTo(recipients.to);
		setCc(recipients.cc);
		setShowCc(recipients.cc.length > 0);
	};
	const lastRequest = useRef(request?.at);
	// biome-ignore lint/correctness/useExhaustiveDependencies: focuses once, on a composer opened by a request
	useEffect(() => {
		if (request) compose.editor.current?.commands.focus("start");
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new request only
	useEffect(() => {
		if (!request || request.at === lastRequest.current) return;
		lastRequest.current = request.at;
		setOf(request.of);
		choose(request.mode);
		box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		compose.editor.current?.commands.focus("end");
	}, [request]);

	const hasRecipients = to.length + cc.length + bcc.length > 0;
	const blockedReason =
		files.blocked.length > 0
			? t({ message: "Gmail won't send blocked files" })
			: files.busy
				? t({ message: "Wait for the files to finish attaching" })
				: null;
	const send = () => {
		const input = fields();
		if (!input || pending || !hasRecipients || blockedReason) return;
		onSend({ ...input, ...files.withoutBlocked() });
	};
	const everyone = [...to, ...cc, ...bcc];
	const vouched = byEmail(known);
	const summary =
		everyone.length > 0
			? everyone.map((a) => chipLabel(a, vouched)).join(", ")
			: t({ message: "Recipients" });
	const ModeIcon =
		mode === "forward" ? LuForward : mode === "replyAll" ? LuReplyAll : LuReply;
	const modeLabel =
		mode === "forward"
			? t({ message: "Forward" })
			: mode === "replyAll"
				? t({ message: "Reply all" })
				: t({ message: "Reply" });

	return (
		<div ref={box} className="grid grid-cols-[40px_1fr] gap-x-3 px-4 py-4">
			<LetterAvatar address={me} photo={mePhoto} />
			<FileDropZone
				onDrop={files.add}
				className="min-w-0 rounded-xl border border-border bg-background shadow-sm focus-within:shadow-md"
			>
				<div className="flex min-h-10 items-center gap-1 pr-3 pl-1.5">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={modeLabel}
								className="flex h-8 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<ModeIcon className="size-[18px]" />
								<LuChevronDown className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-44">
							<DropdownMenuItem onSelect={() => choose("reply")}>
								<LuReply className="size-4" />
								{t({ message: "Reply" })}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!canReplyAll}
								onSelect={() => choose("replyAll")}
							>
								<LuReplyAll className="size-4" />
								{t({ message: "Reply all" })}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => choose("forward")}>
								<LuForward className="size-4" />
								{t({ message: "Forward" })}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					{!expanded && (
						<button
							type="button"
							onClick={() => setExpanded(true)}
							className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[13.5px] text-foreground hover:bg-fill-hover/60"
						>
							{summary}
						</button>
					)}
				</div>
				{expanded && (
					<div className="-mt-1">
						<FromField
							sendAs={sendAs}
							value={compose.from}
							onChange={compose.setFrom}
						/>
						<RecipientField
							label={t({ message: "To" })}
							value={to}
							onChange={setTo}
							known={known}
							autoFocus
							trailing={
								<span className="flex shrink-0 gap-2 text-[13px] text-muted-foreground">
									{!showCc && (
										<button
											type="button"
											className="hover:text-foreground hover:underline"
											onClick={() => setShowCc(true)}
										>
											{t({ message: "Cc" })}
										</button>
									)}
									{!showBcc && (
										<button
											type="button"
											className="hover:text-foreground hover:underline"
											onClick={() => setShowBcc(true)}
										>
											{t({ message: "Bcc" })}
										</button>
									)}
								</span>
							}
						/>
						{showCc && (
							<RecipientField
								label={t({ message: "Cc" })}
								value={cc}
								onChange={setCc}
								known={known}
							/>
						)}
						{showBcc && (
							<RecipientField
								label={t({ message: "Bcc" })}
								value={bcc}
								onChange={setBcc}
								known={known}
							/>
						)}
					</div>
				)}
				<MarkdownEditor
					content={compose.content}
					editorHandle={compose.editor}
					extensions={compose.extensions}
					onModEnter={send}
					placeholder={t({ message: "Write your reply" })}
					features={GMAIL_EDITOR_FEATURES}
					className="px-3 pt-2"
					editorClassName="min-h-12 text-[14px] leading-relaxed [&_p]:my-0"
				/>
				{target && (
					<div className="px-3">
						<QuoteToggle
							open={showQuoted}
							onToggle={() => setShowQuoted((v) => !v)}
						/>
						{showQuoted && (
							<div
								className={cn(
									"mt-2 border-l border-border pl-3 text-[13px] text-muted-foreground",
									"whitespace-pre-wrap break-words",
								)}
							>
								{mode === "forward" && (
									<div className="mb-2">
										{t({ message: "---------- Forwarded message ---------" })}
										<br />
										{t({ message: `From: ${formatRecipient(target.from)}` })}
									</div>
								)}
								{target.text ?? target.snippet}
							</div>
						)}
					</div>
				)}
				<ComposeAttachments files={files.files} onRemove={files.remove} />
				{files.blocked.length > 0 && (
					<BlockedFilesBar
						names={files.blocked.map((file) => file.filename)}
						pending={pending}
						onRemoveAndSend={() => {
							const input = fields();
							if (input)
								onRemoveBlockedAndSend({ ...input, ...files.withoutBlocked() });
						}}
					/>
				)}
				{compose.formatting && (
					<FormattingBar editor={compose.editor.current} />
				)}
				<SendFooter
					canSend={hasRecipients}
					blockedReason={blockedReason}
					pending={pending}
					failure={failure}
					gmailUrl={gmailUrl}
					formatting={compose.formatting}
					onSend={send}
					onSchedule={onSchedule && (() => compose.setScheduling(true))}
					onToggleFormatting={compose.toggleFormatting}
					onAttach={files.add}
					onLink={compose.openLink}
					onDiscard={onDiscard}
				/>
				<LinkPopover
					initial={compose.link}
					onSave={compose.saveLink}
					onCancel={compose.cancelLink}
				/>
				<ScheduleSendDialog
					open={compose.scheduling}
					onCancel={() => compose.setScheduling(false)}
					onSchedule={(at) => {
						compose.setScheduling(false);
						const input = fields();
						if (input && hasRecipients)
							onSchedule?.({ ...input, ...files.withoutBlocked() }, at);
					}}
				/>
			</FileDropZone>
		</div>
	);
}
