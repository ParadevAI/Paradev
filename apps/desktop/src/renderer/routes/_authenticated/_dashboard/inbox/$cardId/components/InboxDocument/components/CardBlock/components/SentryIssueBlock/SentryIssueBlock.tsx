import { Trans, useLingui } from "@lingui/react/macro";
import {
	formatDateTime,
	formatNumber,
	formatRelativeTime,
} from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { type ComponentType, type ReactNode, useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import type { RunnableTask } from "renderer/routes/_authenticated/_dashboard/tasks/components/RunInWorkspacePopoverV2";
import type { CardBlockViewProps } from "../../types";
import { fillClause, planSentence } from "../../utils/handoffPlan";
import { ActionButton } from "../ActionButton";
import { HandoffLandedRow } from "../HandoffLandedRow";
import {
	draftInput,
	draftValue,
	LinearDraftEditor,
} from "../LinearDraftEditor";
import { AssigneePicker } from "./components/AssigneePicker";
import { SentryStat } from "./components/SentryStat";

const NOW_TICK_MS = 60_000;

interface StartAgentProps {
	tasks: RunnableTask[];
	onComplete: () => void;
	onCreated?: (workspaceIds: string[]) => void;
	trigger: ReactNode;
	align?: "start" | "end";
}

interface SentryIssueBlockProps extends CardBlockViewProps<"sentry.issue"> {
	/** The task list's "run in a workspace" popover, which needs the app's hosts and projects around it. */
	StartAgent: ComponentType<StartAgentProps>;
}

const LEVEL_DOT: Record<string, string> = {
	fatal: "bg-destructive",
	error: "bg-destructive",
	warning: "bg-warning",
};

/** A Sentry issue as Sentry heads it, with what can be done about it: who has it, its status, a Linear issue for it, an agent to fix it. */
export function SentryIssueBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
	StartAgent,
}: SentryIssueBlockProps) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const { issue, linear, filed, noted, fix } = view;
	const [shown, setShown] = useState(issue.id);
	const [draft, setDraft] = useState(() => linear && draftValue(linear));
	const [filing, setFiling] = useState(false);
	if (shown !== issue.id) {
		setShown(issue.id);
		setDraft(linear && draftValue(linear));
		setFiling(false);
	}

	const action = (id: string) => actions.find((entry) => entry.id === id);
	const assign = action("assign");
	const input = linear && draft ? draftInput(linear, draft) : null;
	const levels: Record<string, string> = {
		fatal: t({ message: "Fatal", context: "Sentry level" }),
		error: t({ message: "Error", context: "Sentry level" }),
		warning: t({ message: "Warning", context: "Sentry level" }),
		info: t({ message: "Info", context: "Sentry level" }),
		debug: t({ message: "Debug", context: "Sentry level" }),
	};
	const events = Number(issue.events);
	const seen = (iso: string) => formatRelativeTime(new Date(iso), now);
	const place =
		[issue.error.filename, issue.error.function].filter(Boolean).join(" · ") ||
		issue.culprit;
	const { shortId } = issue;

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-1.5 px-4 py-3">
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
						<span
							aria-hidden
							className={cn(
								"size-2 rounded-full",
								LEVEL_DOT[issue.level] ?? "bg-muted-foreground",
							)}
						/>
						{levels[issue.level] ?? issue.level}
					</span>
					<span className="ml-auto truncate">{issue.project}</span>
					<span className="font-mono text-[11px]">{shortId}</span>
					<a
						href={issue.url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex shrink-0 items-center gap-1 text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
					>
						<Trans>Open in Sentry</Trans>
						<LuExternalLink className="size-3 opacity-60" />
					</a>
				</div>
				<span className="text-sm font-medium text-foreground">
					{issue.title}
				</span>
				{issue.error.value && (
					<span className="line-clamp-3 text-[13px] text-muted-foreground">
						{issue.error.value}
					</span>
				)}
				{place && (
					<span className="truncate font-mono text-xs text-muted-foreground">
						{place}
					</span>
				)}
			</div>
			<dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border px-4 py-3 sm:grid-cols-4">
				<SentryStat label={<Trans>Events</Trans>}>
					{Number.isFinite(events) ? formatNumber(events) : issue.events}
				</SentryStat>
				<SentryStat label={<Trans>Users</Trans>}>
					{formatNumber(issue.users)}
				</SentryStat>
				<SentryStat
					label={<Trans>First seen</Trans>}
					title={formatDateTime(new Date(issue.firstSeen))}
				>
					{seen(issue.firstSeen)}
				</SentryStat>
				<SentryStat
					label={<Trans>Last seen</Trans>}
					title={formatDateTime(new Date(issue.lastSeen))}
				>
					{seen(issue.lastSeen)}
				</SentryStat>
			</dl>
			<div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
				<Trans>Assignee</Trans>
				<AssigneePicker
					assignee={issue.assignee}
					members={view.members}
					disabled={done || pending || !assign || Boolean(assign.disabled)}
					onPick={(assignee) => onAct("assign", { assignee })}
				/>
			</div>
			{(filed || noted) && (
				<div className="flex flex-col gap-2 border-t border-border px-4 py-3">
					{filed && <HandoffLandedRow landed={filed} brand="linear" />}
					{noted && <HandoffLandedRow landed={noted} brand="sentry" />}
				</div>
			)}
			{!done && !linear && view.linearUnavailable && (
				<p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
					{view.linearUnavailable}
				</p>
			)}
			{!done && !filed && filing && linear && draft && (
				<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
					<LinearDraftEditor
						draft={linear}
						value={draft}
						onChange={setDraft}
						disabled={pending}
					/>
					<div className="flex justify-end">
						<ActionButton
							action={action("file_linear")}
							pending={pending}
							disabled={!input}
							confirmText={planSentence([
								fillClause(view.plan.file, { title: input?.title ?? "" }),
								...(noted ? [] : [view.plan.note]),
							])}
							onClick={() => input && onAct("file_linear", { issue: input })}
						>
							<Trans>File issue</Trans>
						</ActionButton>
					</div>
				</div>
			)}
			{failure && (
				<p
					role="alert"
					className="border-t border-border px-4 py-3 text-xs text-destructive"
				>
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="ghost"
						onClick={() => onAct("dismiss")}
					>
						{filed || noted ? (
							<Trans context="finish a card that is partly done">Done</Trans>
						) : (
							<Trans>Leave it</Trans>
						)}
					</ActionButton>
					{action("started") && (
						<StartAgent
							tasks={[
								{
									id: issue.id,
									slug: fix.slug,
									title: fix.title,
									description: fix.prompt,
									branch: null,
									linked: false,
								},
							]}
							align="end"
							onComplete={() => {}}
							onCreated={([workspace]) =>
								workspace && onAct("started", { workspace })
							}
							trigger={
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={pending}
								>
									<Trans>Start an agent to fix it</Trans>
								</Button>
							}
						/>
					)}
					{linear && filed && !noted && (
						<ActionButton
							action={action("file_linear")}
							pending={pending}
							variant="outline"
							disabled={!input}
							confirmText={planSentence([view.plan.note])}
							onClick={() => input && onAct("file_linear", { issue: input })}
						>
							<Trans>Add the note</Trans>
						</ActionButton>
					)}
					{linear && !filed && (
						<ActionButton
							action={action("file_linear")}
							pending={pending}
							variant="outline"
							aria-expanded={filing}
							onClick={() => setFiling((open) => !open)}
						>
							<Trans>File in Linear</Trans>
						</ActionButton>
					)}
					<ActionButton
						action={action("ignore")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("ignore")}
					>
						<Trans>Archive</Trans>
					</ActionButton>
					<ActionButton
						action={action("resolve")}
						pending={pending}
						onClick={() => onAct("resolve")}
					>
						<Trans>Resolve</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
