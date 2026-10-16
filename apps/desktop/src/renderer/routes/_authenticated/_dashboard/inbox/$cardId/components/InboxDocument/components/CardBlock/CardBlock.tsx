import { Trans, useLingui } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { LuExternalLink, LuLink2Off, LuLock } from "react-icons/lu";
import { BrandMark } from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import { RunInWorkspacePopoverV2 } from "renderer/routes/_authenticated/_dashboard/tasks/components/RunInWorkspacePopoverV2";
import { INBOX_TONE } from "renderer/routes/_authenticated/_dashboard/utils/inboxTone";
import { ActionKeycap } from "./components/ActionKeycap";
import { AgentFinishedBlock } from "./components/AgentFinishedBlock";
import { AgentNeedsBlock } from "./components/AgentNeedsBlock";
import { AutomationFailedBlock } from "./components/AutomationFailedBlock";
import { CalendarChangeBlock } from "./components/CalendarChangeBlock";
import { CalendarFindTimeBlock } from "./components/CalendarFindTimeBlock";
import { CalendarInviteBlock } from "./components/CalendarInviteBlock";
import { GithubBranchBlock } from "./components/GithubBranchBlock";
import { GithubCiFailedBlock } from "./components/GithubCiFailedBlock";
import { GithubDeploymentBlock } from "./components/GithubDeploymentBlock";
import { GithubIssueBlock } from "./components/GithubIssueBlock";
import { GithubReleaseBlock } from "./components/GithubReleaseBlock";
import { GmailEmailBlock } from "./components/GmailEmailBlock";
import { HandoffBugReportBlock } from "./components/HandoffBugReportBlock";
import { HandoffFollowUpsBlock } from "./components/HandoffFollowUpsBlock";
import { LinearBulkBlock } from "./components/LinearBulkBlock";
import { LinearEditBlock } from "./components/LinearEditBlock";
import { LinearThreadBlock } from "./components/LinearThreadBlock";
import { LinearTriageBlock } from "./components/LinearTriageBlock";
import { PrReviewBlock } from "./components/PrReviewBlock";
import { SentryIssueBlock } from "./components/SentryIssueBlock";
import { SlackCanvasBlock } from "./components/SlackCanvasBlock";
import { SlackChannelBlock } from "./components/SlackChannelBlock";
import { SlackPostBlock } from "./components/SlackPostBlock";
import { SlackReminderBlock } from "./components/SlackReminderBlock";
import { SlackRequestBlock } from "./components/SlackRequestBlock";
import { SlackStatusBlock } from "./components/SlackStatusBlock";
import { SlackThreadBlock } from "./components/SlackThreadBlock";
import { StripeAdjustBlock } from "./components/StripeAdjustBlock";
import { StripeDisputeBlock } from "./components/StripeDisputeBlock";
import { StripeFailedPaymentBlock } from "./components/StripeFailedPaymentBlock";
import { StripeInvoiceBlock } from "./components/StripeInvoiceBlock";
import { StripeRefundBlock } from "./components/StripeRefundBlock";
import { StripeSubscriptionBlock } from "./components/StripeSubscriptionBlock";
import { StripeTag } from "./components/StripeTag";
import { TaskAssignedBlock } from "./components/TaskAssignedBlock";
import { ActionKeysProvider } from "./providers/ActionKeysProvider";
import { ConfirmEchoProvider } from "./providers/ConfirmEchoProvider";
import type { CardAction, CardBlockData, CardInput } from "./types";
import { assignActionKeys } from "./utils/assignActionKeys";

export type { ResolvedCard } from "./types";

type Action = CardAction;

interface CardBlockProps {
	block: CardBlockData;
	/** True once the card is resolved, so actions read as history rather than choices. */
	done: boolean;
	pending: boolean;
	/** Why the last action on this card failed. */
	failure: string | null;
	onAct: (actionId: string, input?: CardInput, confirm?: string) => void;
	/** Opens the settings route a degraded card points at. */
	onConnect: (href: string) => void;
	/** The document's ask question this card answers, drawn inside it. */
	ask?: ReactNode;
	/** True while this block has the card's focus: its actions answer to keys and draw them. */
	focused?: boolean;
}

/**
 * Zone 2 of the trust model: everything inside this border came from the
 * integration, rendered in the API with the reader's credentials. The brand
 * mark is the visible claim of that, and it appears only here.
 */
export function CardBlock({
	block,
	done,
	pending,
	failure,
	onAct,
	onConnect,
	ask,
	focused = false,
}: CardBlockProps) {
	const { t } = useLingui();
	const confirmButton = useRef<HTMLButtonElement>(null);
	const card = block.resolved;
	const [confirming, setConfirming] = useState<Action | null>(null);
	const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
	const shown = useRef(new Map<string, string | undefined>());
	const act = (actionId: string, input?: CardInput) =>
		onAct(actionId, input, shown.current.get(actionId));
	const [input, setInput] = useState("");
	const inputMissing = Boolean(confirming?.input) && input.trim() === "";

	const slots = useMemo(
		() => (focused && !done ? assignActionKeys(card.actions) : {}),
		[focused, done, card.actions],
	);

	const degraded = card.state !== "ok";
	const thread = card.view?.kind === "slack.thread" ? card.view : null;
	const email = card.view?.kind === "gmail.email" ? card.view : null;
	const view = card.view ?? null;
	const superset = view?.kind.startsWith("superset.") ? view : null;
	const calendar =
		view?.kind === "google_calendar.invite" ||
		view?.kind === "google_calendar.find_time" ||
		view?.kind === "google_calendar.change"
			? view
			: null;
	const linear =
		view?.kind === "linear.triage" ||
		view?.kind === "linear.edit" ||
		view?.kind === "linear.thread" ||
		view?.kind === "linear.bulk"
			? view
			: null;
	const stripe =
		view?.kind === "stripe.refund" ||
		view?.kind === "stripe.subscription" ||
		view?.kind === "stripe.adjust" ||
		view?.kind === "stripe.failed_payment" ||
		view?.kind === "stripe.dispute" ||
		view?.kind === "stripe.invoice"
			? view
			: null;
	const slack =
		view?.kind === "slack.message" ||
		view?.kind === "slack.channel" ||
		view?.kind === "slack.reminder" ||
		view?.kind === "slack.status" ||
		view?.kind === "slack.canvas" ||
		view?.kind === "slack.request"
			? view
			: null;
	const handoff =
		view?.kind === "handoff.bug_report" ||
		view?.kind === "handoff.follow_ups" ||
		view?.kind === "sentry.issue"
			? view
			: null;
	const github =
		view?.kind === "github.ci_failed" ||
		view?.kind === "github.branch" ||
		view?.kind === "github.deployment" ||
		view?.kind === "github.release" ||
		view?.kind === "github.issue"
			? view
			: null;
	const native =
		thread ??
		github ??
		slack ??
		email ??
		calendar ??
		linear ??
		stripe ??
		superset ??
		handoff;
	const nativeProps = {
		actions: card.actions,
		done,
		pending,
		failure,
		onAct: act,
	};

	return (
		<ActionKeysProvider slots={slots}>
			<ConfirmEchoProvider
				onShown={(actionId, sentence) => shown.current.set(actionId, sentence)}
			>
				<div
					className={cn(
						"overflow-hidden rounded-lg border bg-card",
						degraded ? "border-dashed border-border" : "border-border",
					)}
				>
					<div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
						<BrandMark brand={card.brand} muted={card.state !== "ok"} />
						<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
							{thread
								? thread.channel.name
								: (slack?.workspace ??
									(email ?? calendar)?.account.email ??
									linear?.account.workspace ??
									(github && "pull" in github
										? github.pull.repo
										: github?.repo) ??
									(stripe
										? (stripe.account.name ?? "Stripe")
										: view?.kind === "handoff.bug_report"
											? view.issue.account.workspace
											: view?.kind === "sentry.issue"
												? view.organization
												: view?.kind === "handoff.follow_ups"
													? t({ message: "Meeting follow-ups" })
													: card.title))}
						</span>
						{stripe?.account.live === false && (
							<StripeTag tone="warn">
								<Trans>Test mode</Trans>
							</StripeTag>
						)}
						{!native && card.subtitle && (
							<span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
								{card.subtitle}
							</span>
						)}
						{card.status && (
							<span
								className={cn(
									"shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
									INBOX_TONE[card.status.tone],
								)}
							>
								{card.status.text}
							</span>
						)}
						<div
							ref={setHeaderSlot}
							className="-my-1 flex shrink-0 items-center gap-1 empty:hidden"
						/>
					</div>

					{card.notice && (
						<div
							className={cn(
								"flex items-center gap-2 px-4 py-2.5 text-xs",
								card.notice.tone === "bad"
									? "bg-destructive/10 text-destructive"
									: card.notice.tone === "warn"
										? "bg-warning/10 text-foreground"
										: card.notice.tone === "good"
											? "bg-success/10 text-foreground"
											: "bg-muted/50 text-muted-foreground",
							)}
						>
							{card.state === "no_connector" ? (
								<LuLink2Off className="size-3.5 shrink-0" strokeWidth={1.5} />
							) : card.state === "no_access" ? (
								<LuLock className="size-3.5 shrink-0" strokeWidth={1.5} />
							) : null}
							<span className="flex-1">{card.notice.text}</span>
							{card.connect && (
								<button
									type="button"
									onClick={() =>
										onConnect(card.connect?.href.replace(/^#/, "") ?? "/")
									}
									className="shrink-0 font-medium text-foreground underline underline-offset-2"
								>
									{card.connect.label}
								</button>
							)}
						</div>
					)}

					{thread && (
						<SlackThreadBlock
							view={thread}
							headerSlot={headerSlot}
							actions={card.actions}
							done={done}
							pending={pending}
							failure={failure}
							onAct={act}
							onConnect={onConnect}
						/>
					)}

					{view?.kind === "slack.message" && (
						<SlackPostBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "slack.channel" && (
						<SlackChannelBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "slack.reminder" && (
						<SlackReminderBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "slack.status" && (
						<SlackStatusBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "slack.canvas" && (
						<SlackCanvasBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "slack.request" && (
						<SlackRequestBlock view={view} {...nativeProps} />
					)}

					{email && (
						<GmailEmailBlock
							view={email}
							headerSlot={headerSlot}
							actions={card.actions}
							done={done}
							pending={pending}
							failure={failure}
							onAct={act}
							onConnect={onConnect}
						/>
					)}

					{view?.kind === "google_calendar.invite" && (
						<CalendarInviteBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "google_calendar.find_time" && (
						<CalendarFindTimeBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "google_calendar.change" && (
						<CalendarChangeBlock view={view} {...nativeProps} />
					)}

					{view?.kind === "linear.triage" && (
						<LinearTriageBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "linear.edit" && (
						<LinearEditBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "linear.thread" && (
						<LinearThreadBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "linear.bulk" && (
						<LinearBulkBlock view={view} {...nativeProps} />
					)}

					{view?.kind === "stripe.refund" && (
						<StripeRefundBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "stripe.subscription" && (
						<StripeSubscriptionBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "stripe.adjust" && (
						<StripeAdjustBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "stripe.failed_payment" && (
						<StripeFailedPaymentBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "stripe.dispute" && (
						<StripeDisputeBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "stripe.invoice" && (
						<StripeInvoiceBlock view={view} {...nativeProps} />
					)}

					{view?.kind === "handoff.bug_report" && (
						<HandoffBugReportBlock
							view={view}
							{...nativeProps}
							onConnect={onConnect}
						/>
					)}
					{view?.kind === "handoff.follow_ups" && (
						<HandoffFollowUpsBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "sentry.issue" && (
						<SentryIssueBlock
							view={view}
							{...nativeProps}
							StartAgent={RunInWorkspacePopoverV2}
						/>
					)}

					{view?.kind === "github.ci_failed" && (
						<GithubCiFailedBlock
							view={view}
							{...nativeProps}
							StartAgent={RunInWorkspacePopoverV2}
						/>
					)}
					{view?.kind === "github.branch" && (
						<GithubBranchBlock
							view={view}
							{...nativeProps}
							StartAgent={RunInWorkspacePopoverV2}
						/>
					)}
					{view?.kind === "github.deployment" && (
						<GithubDeploymentBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "github.release" && (
						<GithubReleaseBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "github.issue" && (
						<GithubIssueBlock view={view} {...nativeProps} />
					)}

					{view?.kind === "superset.agent_finished" && (
						<AgentFinishedBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "superset.agent_needs" && (
						<AgentNeedsBlock
							view={view}
							{...nativeProps}
							ask={ask}
							onConnect={onConnect}
						/>
					)}
					{view?.kind === "superset.pr_review" && (
						<PrReviewBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "superset.task_assigned" && (
						<TaskAssignedBlock view={view} {...nativeProps} />
					)}
					{view?.kind === "superset.automation_failed" && (
						<AutomationFailedBlock view={view} {...nativeProps} />
					)}

					{!native && failure && (
						<div className="bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
							{failure}
						</div>
					)}

					{!native && card.fields.length > 0 && (
						<dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 px-4 py-3 text-[13px]">
							{card.fields.map((f) => (
								<div key={f.label} className="contents">
									<dt className="text-muted-foreground">{f.label}</dt>
									<dd
										className={cn(
											"min-w-0 truncate text-foreground",
											f.mono && "font-mono text-xs",
										)}
									>
										{f.href ? (
											<a
												href={f.href}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
											>
												{f.value}
												<LuExternalLink className="size-3 opacity-60" />
											</a>
										) : (
											f.value
										)}
									</dd>
								</div>
							))}
						</dl>
					)}

					{!native && card.body && (
						<pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-border px-4 py-3 font-sans text-[13px] leading-relaxed text-foreground">
							{card.body}
						</pre>
					)}

					{!native && card.actions.length > 0 && !done && (
						<div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
							{card.actions.map((action) => {
								const button = (
									<Button
										key={action.id}
										type="button"
										size="sm"
										variant={
											action.style === "primary"
												? "default"
												: action.style === "danger"
													? "destructive"
													: "outline"
										}
										data-action-key={slots[action.id]}
										disabled={pending || Boolean(action.disabled)}
										onClick={() => {
											if (action.confirm || action.input) {
												shown.current.set(action.id, action.confirm);
												setConfirming(action);
											} else act(action.id);
										}}
									>
										{action.label}
										<ActionKeycap slot={slots[action.id]} />
									</Button>
								);
								return action.disabled ? (
									<Tooltip key={action.id}>
										<TooltipTrigger asChild>
											<span className="inline-flex">{button}</span>
										</TooltipTrigger>
										<TooltipContent side="top">
											{action.disabled}
										</TooltipContent>
									</Tooltip>
								) : (
									button
								);
							})}
						</div>
					)}

					<AlertDialog
						open={confirming !== null}
						onOpenChange={(open) => {
							if (!open) {
								setConfirming(null);
								setInput("");
							}
						}}
					>
						<AlertDialogContent
							onOpenAutoFocus={(event) => {
								if (confirming?.input) return;
								event.preventDefault();
								confirmButton.current?.focus();
							}}
						>
							<AlertDialogHeader>
								<AlertDialogTitle>{confirming?.label}</AlertDialogTitle>
								{confirming?.confirm && (
									<AlertDialogDescription>
										{confirming.confirm}
									</AlertDialogDescription>
								)}
							</AlertDialogHeader>
							{confirming?.input && (
								<Input
									value={input}
									onChange={(e) => setInput(e.target.value)}
									placeholder={confirming.input}
									aria-label={confirming.input}
								/>
							)}
							<AlertDialogFooter>
								<AlertDialogCancel>
									{t({ message: "Cancel" })}
								</AlertDialogCancel>
								<AlertDialogAction
									ref={confirmButton}
									disabled={inputMissing}
									onClick={() => {
										if (confirming)
											act(confirming.id, input.trim() || undefined);
										setConfirming(null);
										setInput("");
									}}
								>
									{confirming?.label}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</ConfirmEchoProvider>
		</ActionKeysProvider>
	);
}

export function CardBlockPlaceholder() {
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
			<div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
			<div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
			<span className="sr-only">
				<Trans>Loading integration card</Trans>
			</span>
		</div>
	);
}
