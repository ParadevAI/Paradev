import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { SlackWorkspaceProvider } from "../../providers/SlackWorkspaceProvider";
import type { CardBlockViewProps } from "../../types";
import { ActionButton } from "../ActionButton";
import { SlackComposer, type SlackReply } from "../SlackComposer";
import { SlackMessage } from "../SlackMessage";
import { SlackOpenLink } from "../SlackOpenLink";
import { StripeTag } from "../StripeTag";
import { type Answer, AnswerChoice } from "./components/AnswerChoice";
import { GrantRow } from "./components/GrantRow";

const NOW_TICK_MS = 60_000;
const QUOTE_MAX = 120;

const quoted = (text: string) =>
	text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX)}…` : text;

/** A Slack message that asks for an approval: the message as Slack draws it, what approving does, and the reply for each answer. */
export function SlackRequestBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.request">) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const { compose, grant, message } = view;
	const [answer, setAnswer] = useState<Answer>("approve");
	const [approveReply, setApproveReply] = useState<SlackReply | null>(null);
	const [denyReply, setDenyReply] = useState<SlackReply | null>(null);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const slackOnly = view.ownButtons && !grant;
	const adds = grant !== null && !grant.alreadyMember;
	const person = grant?.person.name ?? "";
	const channel = grant?.channel.name ?? "";
	const replyQuestion = (reply: SlackReply | null) => {
		const quote = quoted(reply?.text ?? "");
		return t({ message: `Reply "${quote}" in the thread?` });
	};
	const approveConfirm = adds
		? approveReply
			? t({ message: `Add ${person} to #${channel} and reply in the thread?` })
			: t({ message: `Add ${person} to #${channel}?` })
		: replyQuestion(approveReply);

	return (
		<SlackWorkspaceProvider
			people={compose.members}
			names={compose.names}
			channels={compose.channels}
			groups={compose.groups}
			emoji={compose.emoji}
			workspaceUrl={view.permalink ? new URL(view.permalink).origin : null}
		>
			<div className="flex flex-col">
				<div className="flex items-center gap-3 px-4 pt-2.5 text-xs text-muted-foreground">
					<span className="min-w-0 truncate">{view.channel.name}</span>
					{view.channel.external && (
						<StripeTag tone="warn">
							<Trans>External</Trans>
						</StripeTag>
					)}
					<span className="flex-1" />
					{view.permalink && (
						<SlackOpenLink href={view.permalink} prominent={slackOnly} />
					)}
				</div>
				<div className="pb-2">
					<SlackMessage message={message} now={now} />
				</div>
				{grant && (
					<div className="px-4 pb-3">
						<GrantRow grant={grant} />
					</div>
				)}
				{!done && !slackOnly && (
					<>
						<div className="px-4 pb-2">
							<AnswerChoice
								value={answer}
								onChange={setAnswer}
								disabled={pending}
							/>
						</div>
						<div
							data-reply="approve"
							className={answer === "approve" ? undefined : "hidden"}
						>
							<SlackComposer
								draft={view.approveReply}
								members={compose.members}
								emoji={compose.emoji}
								channels={compose.channels}
								pending={pending}
								failure={null}
								onChange={setApproveReply}
							/>
						</div>
						<div
							data-reply="deny"
							className={answer === "deny" ? undefined : "hidden"}
						>
							<SlackComposer
								draft={view.denyReply}
								members={compose.members}
								emoji={compose.emoji}
								channels={compose.channels}
								pending={pending}
								failure={null}
								onChange={setDenyReply}
							/>
						</div>
					</>
				)}
				{failure && (
					<p role="alert" className="px-4 pb-3 text-xs text-destructive">
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
							<Trans>Leave it</Trans>
						</ActionButton>
						{(answer === "deny" || slackOnly) && (
							<ActionButton
								action={action("deny")}
								pending={pending}
								variant="destructive"
								disabled={!denyReply}
								confirmText={replyQuestion(denyReply)}
								onClick={() => denyReply && onAct("deny", { reply: denyReply })}
							>
								<Trans>Deny</Trans>
							</ActionButton>
						)}
						{(answer === "approve" || slackOnly) && (
							<ActionButton
								action={action("approve")}
								pending={pending}
								disabled={!adds && !approveReply}
								confirmText={approveConfirm}
								onClick={() =>
									onAct("approve", {
										reply: approveReply,
										grant: grant && {
											user: grant.person.id,
											channel: grant.channel.id,
										},
									})
								}
							>
								<Trans>Approve</Trans>
							</ActionButton>
						)}
					</div>
				)}
			</div>
		</SlackWorkspaceProvider>
	);
}
