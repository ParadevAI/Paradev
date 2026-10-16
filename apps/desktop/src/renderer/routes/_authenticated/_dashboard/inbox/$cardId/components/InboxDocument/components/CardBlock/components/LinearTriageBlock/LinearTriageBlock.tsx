import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { useMemo, useState } from "react";
import type { CardBlockViewProps, LinearFieldsView } from "../../types";
import { acceptState, changedFields } from "../../utils/linearFields";
import { ActionButton } from "../ActionButton";
import { IssueFields } from "../IssueFields";
import { LinearAvatar } from "../LinearAvatar";
import { LinearComposer } from "../LinearComposer";
import { LinearIssueHeader } from "../LinearIssueHeader";
import { LinearMarkdown } from "../LinearMarkdown";
import { DuplicateConfirm } from "./components/DuplicateConfirm";
import { SnoozeMenu } from "./components/SnoozeMenu";

type Mode = "accept" | "decline" | "duplicate";

/** An issue in triage as Linear shows it, with its Accept panel inline: comment, suggestions, properties, and Accept, Decline, Mark as duplicate and Snooze. */
export function LinearTriageBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"linear.triage">) {
	const { t } = useLingui();
	const { issue, options } = view;
	const [mode, setMode] = useState<Mode>("accept");
	const [comment, setComment] = useState(view.comment);
	const [fields, setFields] = useState<LinearFieldsView>(() => ({
		...issue.fields,
		state:
			issue.state.type === "triage"
				? (view.defaultState ?? acceptState(options) ?? issue.fields.state)
				: issue.fields.state,
	}));
	const handles = useMemo(
		() => options.members.map((member) => member.handle),
		[options.members],
	);
	const action = (id: string) => actions.find((item) => item.id === id);
	const accept = action("accept");
	const text = comment.trim();
	const note = text ? { comment: text } : {};
	const needsPriority = view.priorityRequired && fields.priority === 0;
	const sendAccept = () => {
		if (pending || !accept || accept.disabled || needsPriority) return;
		const { state: _state, ...changed } = changedFields(issue.fields, fields);
		onAct("accept", {
			state: fields.state,
			...changed,
			...note,
			version: issue.version,
		});
	};
	const sendDecline = () => onAct("decline", note);
	const creator = issue.creator;
	const snoozedUntil = view.snoozedUntil
		? formatDateTime(new Date(view.snoozedUntil))
		: null;

	return (
		<div
			data-linear-card
			tabIndex={-1}
			className="flex flex-col gap-3 px-4 py-3 outline-none"
		>
			<LinearIssueHeader issue={issue} />
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{creator && (
					<>
						<LinearAvatar person={creator} className="size-4 text-[9px]" />
						<span className="text-foreground">{creator.name}</span>
					</>
				)}
				<time dateTime={issue.createdAt}>
					{formatRelativeTime(Date.parse(issue.createdAt))}
				</time>
				{snoozedUntil && (
					<span>
						<Trans>Snoozed until {snoozedUntil}</Trans>
					</span>
				)}
			</div>
			{issue.description && (
				<LinearMarkdown text={issue.description} handles={handles} />
			)}
			{failure && (
				<p role="alert" className="text-xs text-destructive">
					{failure}
				</p>
			)}
			{done && (
				<IssueFields
					value={issue.fields}
					options={options}
					issueState={issue.state}
					teamName={issue.team.name}
					onChange={() => {}}
					disabled
				/>
			)}
			{!done && mode === "accept" && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-3">
					<LinearComposer
						key="accept"
						value={comment}
						onChange={setComment}
						onSubmit={sendAccept}
						placeholder={t({ message: "Add a comment…" })}
						mentionable={options.members}
						disabled={pending}
						className="min-h-12"
					/>
					<IssueFields
						value={fields}
						options={options}
						suggested={view.suggested}
						teamName={issue.team.name}
						onChange={setFields}
						disabled={pending}
					/>
					<div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
						<SnoozeMenu
							action={action("snooze")}
							pending={pending}
							cycles={options.cycles}
							onSnooze={(until) =>
								onAct("snooze", { until: until.toISOString() })
							}
						/>
						{view.duplicateOf && (
							<ActionButton
								action={action("duplicate")}
								pending={pending}
								variant="ghost"
								onClick={() => setMode("duplicate")}
							>
								<Trans>Mark as duplicate</Trans>
							</ActionButton>
						)}
						<ActionButton
							action={action("decline")}
							pending={pending}
							variant="ghost"
							onClick={() => setMode("decline")}
						>
							<Trans>Decline</Trans>
						</ActionButton>
						<span className="flex-1" />
						<ActionButton
							action={
								accept && needsPriority && !accept.disabled
									? {
											...accept,
											disabled: t({
												message: "Set a priority to accept this issue",
											}),
										}
									: accept
							}
							pending={pending}
							onClick={sendAccept}
						>
							<Trans>Accept</Trans>
						</ActionButton>
					</div>
				</div>
			)}
			{!done && mode === "decline" && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-3">
					<LinearComposer
						key="decline"
						value={comment}
						onChange={setComment}
						onSubmit={sendDecline}
						placeholder={t({ message: "Add a reason for declining…" })}
						mentionable={options.members}
						disabled={pending}
						className="min-h-12"
					/>
					<div className="flex items-center justify-end gap-2 border-t border-border pt-3">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setMode("accept")}
						>
							<Trans>Cancel</Trans>
						</Button>
						<ActionButton
							action={action("decline")}
							pending={pending}
							onClick={sendDecline}
						>
							<Trans>Decline</Trans>
						</ActionButton>
					</div>
				</div>
			)}
			{!done && mode === "duplicate" && view.duplicateOf && (
				<DuplicateConfirm
					issue={issue}
					original={view.duplicateOf}
					members={options.members}
					action={action("duplicate")}
					pending={pending}
					onConfirm={() =>
						onAct("duplicate", { of: view.duplicateOf?.id ?? "", ...note })
					}
					onCancel={() => setMode("accept")}
				/>
			)}
		</div>
	);
}
