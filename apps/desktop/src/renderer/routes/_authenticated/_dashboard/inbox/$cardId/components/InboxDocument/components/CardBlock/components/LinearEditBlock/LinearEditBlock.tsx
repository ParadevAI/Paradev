import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import type { CardBlockViewProps, LinearFieldsView } from "../../types";
import { changedFields } from "../../utils/linearFields";
import { ActionButton } from "../ActionButton";
import { IssueFields } from "../IssueFields";
import { LinearDescriptionField } from "../LinearDescriptionField";
import { LinearIssueHeader } from "../LinearIssueHeader";
import { LinearMarkdown } from "../LinearMarkdown";
import { LinearStateIcon } from "../LinearStateIcon";
import { LinearTitleInput } from "../LinearTitleInput";
import { DescriptionDiff } from "./components/DescriptionDiff";

/** An issue with the agent's changes against what Linear holds: every one can be changed before it is applied. */
export function LinearEditBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"linear.edit">) {
	const { t } = useLingui();
	const { issue, options, proposed } = view;
	const [title, setTitle] = useState(proposed.title ?? issue.title);
	const [description, setDescription] = useState(
		proposed.description ?? issue.description,
	);
	const [fields, setFields] = useState<LinearFieldsView>({
		...issue.fields,
		...proposed.fields,
	});
	const handles = useMemo(
		() => options.members.map((member) => member.handle),
		[options.members],
	);
	const newTitle = title.trim();
	const changes = {
		...(newTitle !== issue.title ? { title: newTitle } : {}),
		...(description !== issue.description ? { description } : {}),
		...changedFields(issue.fields, fields),
	};
	const nothing = Object.keys(changes).length === 0 || newTitle === "";

	if (done)
		return (
			<div className="flex flex-col gap-3 px-4 py-3">
				<LinearIssueHeader issue={issue} />
				{issue.description && (
					<LinearMarkdown text={issue.description} handles={handles} />
				)}
				<IssueFields
					value={issue.fields}
					options={options}
					issueState={issue.state}
					teamName={issue.team.name}
					onChange={() => {}}
					disabled
				/>
			</div>
		);

	return (
		<div
			data-linear-card
			tabIndex={-1}
			className="flex flex-col gap-3 px-4 py-3 outline-none"
		>
			<div className="flex items-center gap-2 text-[13px]">
				<LinearStateIcon state={issue.state} />
				<span className="flex-1 tabular-nums text-muted-foreground">
					{issue.identifier}
				</span>
				<a
					href={issue.url}
					target="_blank"
					rel="noreferrer"
					aria-label={t({ message: "Open in Linear" })}
					className="shrink-0 rounded p-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuExternalLink className="size-3.5" />
				</a>
			</div>
			<div className="flex flex-col gap-1">
				{newTitle !== issue.title && (
					<del className="text-[13px] text-muted-foreground">{issue.title}</del>
				)}
				<LinearTitleInput
					value={title}
					onChange={setTitle}
					disabled={pending}
				/>
			</div>
			<LinearDescriptionField
				value={description}
				onChange={setDescription}
				handles={handles}
				disabled={pending}
				shown={
					description !== issue.description ? (
						<DescriptionDiff before={issue.description} after={description} />
					) : undefined
				}
			/>
			<IssueFields
				value={fields}
				options={options}
				baseline={issue.fields}
				issueState={issue.state}
				teamName={issue.team.name}
				onChange={setFields}
				disabled={pending}
			/>
			{failure && (
				<p role="alert" className="text-xs text-destructive">
					{failure}
				</p>
			)}
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
					onClick={() => onAct("apply", { ...changes, version: issue.version })}
				>
					<Trans>Apply changes</Trans>
				</ActionButton>
			</div>
		</div>
	);
}
