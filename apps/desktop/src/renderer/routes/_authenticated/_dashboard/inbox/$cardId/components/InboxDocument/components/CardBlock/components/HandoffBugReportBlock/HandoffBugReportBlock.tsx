import { Trans } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { useId, useMemo, useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { SlackWorkspaceProvider } from "../../providers/SlackWorkspaceProvider";
import type { CardBlockViewProps } from "../../types";
import { fillClause, planSentence } from "../../utils/handoffPlan";
import { ActionButton } from "../ActionButton";
import { ConnectSlackBar } from "../ConnectSlackBar";
import { HandoffLandedRow } from "../HandoffLandedRow";
import {
	draftInput,
	draftValue,
	LinearDraftEditor,
} from "../LinearDraftEditor";
import { SlackComposer, type SlackReply } from "../SlackComposer";
import { SlackThreadMessages } from "../SlackThreadMessages";

const NOW_TICK_MS = 60_000;

interface HandoffBugReportBlockProps
	extends CardBlockViewProps<"handoff.bug_report"> {
	onConnect: (href: string) => void;
}

/** A bug reported in a Slack thread, drafted as a Linear issue: the thread as Slack shows it, the issue open to change, and the reply that carries the link back. */
export function HandoffBugReportBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
	onConnect,
}: HandoffBugReportBlockProps) {
	const now = useNow(NOW_TICK_MS);
	const replyToggle = useId();
	const { thread, issue, filed, replied } = view;
	const root = thread.messages[0];
	const identity = `${thread.channel.id}:${root?.ts}:${issue.team.id}`;
	const [shown, setShown] = useState(identity);
	const [draft, setDraft] = useState(() => draftValue(issue));
	const [withReply, setWithReply] = useState(view.canReply);
	const [reply, setReply] = useState<SlackReply | null>(null);
	if (shown !== identity) {
		setShown(identity);
		setDraft(draftValue(issue));
		setWithReply(view.canReply);
		setReply(null);
	}
	const people = useMemo(
		() => [
			...thread.messages.map((message) => message.user),
			...thread.members,
		],
		[thread.messages, thread.members],
	);

	const action = (id: string) => actions.find((entry) => entry.id === id);
	const input = draftInput(issue, draft);
	const replying = view.canReply && (withReply || Boolean(filed));
	const confirmText = planSentence([
		...(filed
			? []
			: [fillClause(view.plan.file, { title: input?.title ?? "" })]),
		...(replying && !replied ? [view.plan.reply] : []),
	]);

	return (
		<SlackWorkspaceProvider
			people={people}
			names={thread.names}
			channels={thread.channels}
			groups={thread.groups}
			emoji={thread.emoji}
			workspaceUrl={thread.permalink ? new URL(thread.permalink).origin : null}
		>
			<div className="flex flex-col">
				<div className="flex flex-col pt-2">
					<SlackThreadMessages messages={thread.messages} now={now} />
				</div>
				<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
					{filed && <HandoffLandedRow landed={filed} brand="linear" />}
					{replied && <HandoffLandedRow landed={replied} brand="slack" />}
					{!(done && filed) && (
						<LinearDraftEditor
							draft={issue}
							value={draft}
							onChange={setDraft}
							disabled={pending || done || Boolean(filed)}
						/>
					)}
				</div>
				{!done && !view.canReply && !thread.readerConnected && (
					<div className="border-t border-border pt-4">
						<ConnectSlackBar onConnect={() => onConnect("/plugins/slack")} />
					</div>
				)}
				{!done && !view.canReply && thread.readerConnected && (
					<p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
						{view.replyUnavailable}
					</p>
				)}
				{!done && view.canReply && (
					<div className="flex flex-col border-t border-border">
						<div className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-foreground">
							{!filed && (
								<Checkbox
									id={replyToggle}
									checked={withReply}
									disabled={pending}
									onCheckedChange={(next) => setWithReply(next === true)}
								/>
							)}
							<label htmlFor={filed ? undefined : replyToggle}>
								<Trans>Reply in thread</Trans>
							</label>
						</div>
						{replying && (
							<SlackComposer
								key={identity}
								draft={view.reply}
								members={thread.members}
								emoji={thread.emoji}
								channels={thread.channels}
								pending={pending}
								failure={null}
								onChange={setReply}
							/>
						)}
					</div>
				)}
				{failure && (
					<p role="alert" className="px-4 py-3 text-xs text-destructive">
						{failure}
					</p>
				)}
				{!done && (
					<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
						<ActionButton
							action={action("dismiss")}
							pending={pending}
							variant="outline"
							onClick={() => onAct("dismiss")}
						>
							{filed ? (
								<Trans context="finish a card that is partly done">Done</Trans>
							) : (
								<Trans>Do not file</Trans>
							)}
						</ActionButton>
						<ActionButton
							action={action("file")}
							pending={pending}
							disabled={!input || !root || (replying ? !reply : Boolean(filed))}
							confirmText={confirmText}
							onClick={() =>
								input &&
								root &&
								onAct("file", {
									issue: input,
									reply:
										replying && reply
											? { text: reply.text, blocks: reply.blocks }
											: null,
									thread: { channel: thread.channel.id, ts: root.ts },
								})
							}
						>
							{filed ? (
								<Trans>Reply with the link</Trans>
							) : (
								<Trans>File issue</Trans>
							)}
						</ActionButton>
					</div>
				)}
			</div>
		</SlackWorkspaceProvider>
	);
}
