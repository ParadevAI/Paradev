import { useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import type { CardInput } from "../../types";
import { ComposeWindow } from "./components/ComposeWindow";
import { GmailComposer } from "./components/GmailComposer";
import { GmailHeaderActions } from "./components/GmailHeaderActions";
import { GmailMessage, type ReplyMode } from "./components/GmailMessage";
import { HiddenCount } from "./components/HiddenCount";
import { ReconnectBar } from "./components/ReconnectBar";
import { ScheduledNotice } from "./components/ScheduledNotice";
import { ThreadHeader } from "./components/ThreadHeader";
import type { AttachmentChange } from "./hooks/useDraftAttachments";
import type { GmailAddress, GmailEmailView, Resolved } from "./types";
import { parseMailto } from "./utils/addresses";
import type { SendInput } from "./utils/emailBody";
import { threadLayout } from "./utils/threadLayout";

export type { GmailEmailView } from "./types";

const NOW_TICK_MS = 60_000;

interface GmailEmailBlockProps {
	view: GmailEmailView;
	/** The right side of the card's header row, where archive, "This is nothing" and the way to Gmail go. */
	headerSlot: HTMLElement | null;
	actions: Resolved["actions"];
	done: boolean;
	pending: boolean;
	failure: string | null;
	onAct: (actionId: string, input?: CardInput) => void;
	onConnect: (href: string) => void;
}

interface ReplyRequest {
	mode: ReplyMode;
	of: string;
	at: number;
}

function gmailLink(view: GmailEmailView): string {
	const account = encodeURIComponent(view.account.email);
	if (view.thread)
		return `https://mail.google.com/mail/?authuser=${account}#all/${view.thread.id}`;
	const params = new URLSearchParams({
		authuser: view.account.email,
		view: "cm",
		fs: "1",
		to: view.draft.to.map((a) => a.email).join(","),
		su: view.draft.subject,
		body: view.draft.body,
	});
	return `https://mail.google.com/mail/?${params}`;
}

/** An email the agent wants sent: the thread as Gmail draws it with the draft in the reply box, or Gmail's compose window. */
export function GmailEmailBlock({
	view,
	headerSlot,
	actions,
	done,
	pending,
	failure,
	onAct,
	onConnect,
}: GmailEmailBlockProps) {
	const now = useNow(NOW_TICK_MS);
	const [toggled, setToggled] = useState<Map<number, boolean>>(new Map());
	const [revealed, setRevealed] = useState(false);
	const [request, setRequest] = useState<ReplyRequest | null>(null);
	const [loose, setLoose] = useState<ReplyRequest | null>(null);
	const [openings, setOpenings] = useState(0);
	const reopen = () => {
		setLoose(null);
		setOpenings((count) => count + 1);
	};
	const gmailUrl = gmailLink(view);
	const action = (id: string) => actions.find((a) => a.id === id);
	const me: GmailAddress = { name: null, email: view.account.email };
	const known = useMemo(() => {
		const seen = new Map<string, GmailAddress>();
		for (const message of view.thread?.messages ?? []) {
			for (const address of [message.from, ...message.to, ...message.cc]) {
				if (address.email.toLowerCase() === view.account.email.toLowerCase())
					continue;
				if (!seen.has(address.email.toLowerCase()))
					seen.set(address.email.toLowerCase(), address);
			}
		}
		return [...seen.values()];
	}, [view.thread, view.account.email]);

	const [mailto, setMailto] = useState<GmailEmailView["draft"] | null>(null);
	const [lastAction, setLastAction] = useState<string | null>(null);
	const composeRun = useRef<"idle" | "requested" | "running">("idle");
	useEffect(() => {
		if (composeRun.current === "requested" && pending)
			composeRun.current = "running";
		else if (composeRun.current === "running" && !pending) {
			composeRun.current = "idle";
			if (!failure) {
				setMailto(null);
				setLoose(null);
				setOpenings((count) => count + 1);
			}
		}
	}, [pending, failure]);
	const act = (actionId: string, input?: CardInput) => {
		setLastAction(actionId);
		onAct(actionId, input);
	};
	const send = (input: SendInput & AttachmentChange) =>
		act("send", { ...input });
	const saveDraft = (input: SendInput & AttachmentChange) =>
		act("save_draft", { ...input });
	const schedule = (input: SendInput & AttachmentChange, at: Date) =>
		act("schedule_send", { ...input, at: at.toISOString() });
	const compose = (input: SendInput & AttachmentChange) => {
		composeRun.current = "requested";
		act("compose", { ...input });
	};
	const discard = () => act("discard");
	const openMailto = (href: string) => {
		const fields = parseMailto(href);
		if (!fields) return;
		setMailto({
			...fields,
			html: null,
			replyAll: false,
			from: view.draft.from,
			attachments: [],
		});
	};
	const composeAction = action("compose");
	const canCompose = Boolean(!done && composeAction && !composeAction.disabled);
	const composing = lastAction === "compose";
	const sending = pending && lastAction !== "save_draft";
	const writing = !done && view.canSend && !view.draftGone;
	const reconnect = !done && !view.canSend && !view.draftGone;
	const scheduled =
		view.scheduledAt &&
		!view.draftGone &&
		Date.parse(view.scheduledAt) > now.getTime()
			? view.scheduledAt
			: null;

	const headerActions = (
		<GmailHeaderActions
			slot={headerSlot}
			actions={actions}
			done={done}
			pending={pending}
			gmailUrl={gmailUrl}
			onAct={onAct}
		/>
	);

	if (!view.thread) {
		return (
			<div className="flex flex-col">
				{headerActions}
				{writing && (
					<ComposeWindow
						draft={view.draft}
						sendAs={view.sendAs}
						known={known}
						gmailUrl={gmailUrl}
						pending={sending}
						failure={failure}
						onSend={send}
						onSaveDraft={saveDraft}
						onSchedule={schedule}
						onRemoveBlockedAndSend={send}
						onDiscard={discard}
					/>
				)}
				{reconnect && (
					<ReconnectBar onConnect={() => onConnect("/settings/integrations")} />
				)}
				{scheduled && <ScheduledNotice at={scheduled} />}
			</div>
		);
	}

	const thread = view.thread;
	const rows = threadLayout(thread.messages, toggled, revealed);
	const toggle = (index: number, open: boolean) =>
		setToggled((current) => new Map(current).set(index, !open));
	const allOpen = rows.every((row) => row.kind === "message" && row.open);
	const setAll = (open: boolean) => {
		setToggled(new Map(thread.messages.map((_, i) => [i, open])));
		setRevealed(true);
	};
	const reply = (mode: ReplyMode, messageId: string) => {
		const next = { mode, of: messageId, at: Date.now() };
		if (writing) setRequest(next);
		else setLoose(next);
	};
	const canReply = writing || canCompose;
	const star = action("star");
	const removeLabel = action("remove_label");
	const onStar =
		!done && star && !star.disabled
			? (message: string, starred: boolean) =>
					onAct("star", { message, starred })
			: undefined;
	const onRemoveLabel =
		!done && removeLabel && !removeLabel.disabled
			? (labelId: string) => onAct("remove_label", labelId)
			: undefined;
	const replyAllDiffers =
		[...thread.replyAll.to, ...thread.replyAll.cc].length !==
		[...thread.reply.to, ...thread.reply.cc].length;
	const opensReply =
		!writing && canCompose && (loose !== null || (!reconnect && !scheduled));

	return (
		<div className="flex flex-col pb-1">
			{headerActions}
			<ThreadHeader
				subject={thread.subject}
				labels={thread.labels}
				printUrl={`https://mail.google.com/mail/?authuser=${encodeURIComponent(view.account.email)}&view=pt&th=${thread.id}`}
				onRemoveLabel={onRemoveLabel}
				expanded={allOpen}
				onToggleExpanded={
					thread.messages.length > 1 ? () => setAll(!allOpen) : undefined
				}
			/>
			<div className="border-t border-border [&>*:not(:last-child):not([data-fold]):not(:has(+[data-fold]))]:border-b [&>*]:border-border">
				{rows.map((row) =>
					row.kind === "hidden" ? (
						<HiddenCount
							key={`hidden-${row.indexes[0]}`}
							count={row.indexes.length}
							onReveal={() => setRevealed(true)}
						/>
					) : (
						(() => {
							const message = thread.messages[row.index];
							if (!message) return null;
							return (
								<GmailMessage
									key={message.id}
									message={message}
									open={row.open}
									me={view.account.email}
									mePhoto={view.account.photo}
									subject={thread.subject}
									gmailUrl={gmailUrl}
									now={now}
									onToggle={
										thread.messages.length > 1
											? () => toggle(row.index, row.open)
											: undefined
									}
									onReply={
										canReply ? (mode) => reply(mode, message.id) : undefined
									}
									onStar={
										onStar
											? (starred) => onStar(message.id, starred)
											: undefined
									}
									onMailto={canCompose ? openMailto : undefined}
								/>
							);
						})()
					),
				)}
			</div>
			{mailto && canCompose && (
				<ComposeWindow
					key={`${mailto.to.map((a) => a.email).join(",")}:${mailto.subject}`}
					draft={mailto}
					sendAs={view.sendAs}
					known={known}
					gmailUrl={gmailUrl}
					pending={pending && composing}
					failure={composing ? failure : null}
					onSend={compose}
					onRemoveBlockedAndSend={compose}
					onDiscard={() => setMailto(null)}
				/>
			)}
			{writing && (
				<GmailComposer
					thread={thread}
					draft={view.draft}
					sendAs={view.sendAs}
					me={me}
					mePhoto={view.account.photo}
					known={known}
					gmailUrl={gmailUrl}
					pending={sending && !composing}
					failure={composing ? null : failure}
					request={request}
					onSend={send}
					onSaveDraft={saveDraft}
					onSchedule={schedule}
					onRemoveBlockedAndSend={send}
					onDiscard={discard}
				/>
			)}
			{opensReply && (
				<GmailComposer
					key={openings}
					thread={thread}
					draft={{
						...(replyAllDiffers ? thread.replyAll : thread.reply),
						bcc: [],
						subject: "",
						body: "",
						html: null,
						replyAll: replyAllDiffers,
						from: view.draft.from,
						attachments: [],
					}}
					sendAs={view.sendAs}
					me={me}
					mePhoto={view.account.photo}
					known={known}
					gmailUrl={gmailUrl}
					pending={pending && composing}
					failure={composing ? failure : null}
					request={loose}
					onSend={compose}
					onRemoveBlockedAndSend={compose}
					onDiscard={reopen}
				/>
			)}
			{reconnect && (
				<ReconnectBar onConnect={() => onConnect("/settings/integrations")} />
			)}
			{scheduled && <ScheduledNotice at={scheduled} />}
		</div>
	);
}
