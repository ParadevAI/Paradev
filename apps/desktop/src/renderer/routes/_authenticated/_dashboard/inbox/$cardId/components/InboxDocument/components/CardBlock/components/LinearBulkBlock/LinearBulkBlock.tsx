import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { useState } from "react";
import type { CardBlockViewProps, LinearFieldsView } from "../../types";
import { ActionButton } from "../ActionButton";
import { IssueFields } from "../IssueFields";
import { LinearAvatar } from "../LinearAvatar";
import { LinearComposer } from "../LinearComposer";
import { LinearStateIcon } from "../LinearStateIcon";

const CLOSED = ["completed", "canceled"];

/** Several issues of one team and one change for all of them: the reader picks the issues and the properties to set. */
export function LinearBulkBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"linear.bulk">) {
	const { t } = useLingui();
	const { issues, options } = view;
	const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
	const [fields, setFields] = useState<Partial<LinearFieldsView>>(
		view.proposed,
	);
	const [comment, setComment] = useState(view.comment);
	const chosen = issues
		.filter((issue) => !unchecked.has(issue.id))
		.map((issue) => issue.id);
	const count = chosen.length;
	const text = comment.trim();
	const closing = CLOSED.includes(
		options.states.find((state) => state.id === fields.state)?.type ?? "",
	);
	const label = closing
		? count === 1
			? t({ message: "Close 1 issue" })
			: t({ message: `Close ${count} issues` })
		: count === 1
			? t({ message: "Change 1 issue" })
			: t({ message: `Change ${count} issues` });
	const nothing = count === 0 || (Object.keys(fields).length === 0 && !text);
	const apply = () =>
		onAct("apply", {
			issues: chosen,
			...fields,
			...(text ? { comment: text } : {}),
		});
	const toggle = (id: string, on: boolean) =>
		setUnchecked((current) => {
			const next = new Set(current);
			if (on) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<div
			data-linear-card
			tabIndex={-1}
			className="flex flex-col gap-3 px-4 py-3 outline-none"
		>
			<ul className="flex flex-col rounded-lg border border-border">
				{issues.map((issue) => {
					const assignee = options.members.find(
						(member) => member.id === issue.fields.assignee,
					);
					return (
						<li
							key={issue.id}
							data-issue={issue.identifier}
							className="flex h-9 items-center gap-2 border-b border-border px-3 text-[13px] last:border-b-0"
						>
							{!done && (
								<Checkbox
									checked={!unchecked.has(issue.id)}
									disabled={pending}
									onCheckedChange={(on) => toggle(issue.id, on === true)}
									aria-label={issue.identifier}
									className="size-3.5"
								/>
							)}
							<LinearStateIcon state={issue.state} />
							<span className="shrink-0 tabular-nums text-muted-foreground">
								{issue.identifier}
							</span>
							<a
								href={issue.url}
								target="_blank"
								rel="noreferrer"
								className="min-w-0 flex-1 truncate text-foreground hover:underline"
							>
								{issue.title}
							</a>
							{assignee && <LinearAvatar person={assignee} />}
						</li>
					);
				})}
			</ul>
			<IssueFields
				value={done ? view.proposed : fields}
				options={options}
				teamName={view.team.name}
				onChange={setFields}
				sparse
				disabled={done || pending}
			/>
			{failure && (
				<p role="alert" className="text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<>
					<LinearComposer
						value={comment}
						onChange={setComment}
						placeholder={t({ message: "Add a comment…" })}
						mentionable={options.members}
						disabled={pending}
						className="min-h-12 rounded-lg border border-border p-3"
					/>
					<div className="flex items-center justify-end gap-2 border-t border-border pt-3">
						<ActionButton
							action={actions.find((action) => action.id === "dismiss")}
							pending={pending}
							variant="outline"
							onClick={() => onAct("dismiss")}
						>
							<Trans>Keep as is</Trans>
						</ActionButton>
						<ActionButton
							action={actions.find((action) => action.id === "apply")}
							pending={pending}
							disabled={nothing}
							onClick={apply}
						>
							{label}
						</ActionButton>
					</div>
				</>
			)}
		</div>
	);
}
