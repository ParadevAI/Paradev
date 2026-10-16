import { useMemo } from "react";
import type { LinearDraftView } from "../../types";
import { IssueFields } from "../IssueFields";
import { LinearDescriptionField } from "../LinearDescriptionField";
import { LinearTitleInput } from "../LinearTitleInput";
import type { LinearDraftValue } from "./utils/draftInput";

interface LinearDraftEditorProps {
	draft: LinearDraftView;
	value: LinearDraftValue;
	onChange: (next: LinearDraftValue) => void;
	disabled?: boolean;
}

/** A new Linear issue before it is filed: its team, title, description and properties, each open to change. */
export function LinearDraftEditor({
	draft,
	value,
	onChange,
	disabled,
}: LinearDraftEditorProps) {
	const handles = useMemo(
		() => draft.options.members.map((member) => member.handle),
		[draft.options.members],
	);
	return (
		<div
			data-linear-card
			tabIndex={-1}
			className="flex flex-col gap-3 outline-none"
		>
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">{draft.team.name}</span>
				<span aria-hidden>·</span>
				<span className="tabular-nums">{draft.team.key}</span>
			</div>
			<LinearTitleInput
				value={value.title}
				onChange={(title) => onChange({ ...value, title })}
				disabled={disabled}
			/>
			<LinearDescriptionField
				value={value.description}
				onChange={(description) => onChange({ ...value, description })}
				handles={handles}
				disabled={disabled}
			/>
			<IssueFields
				value={value.fields}
				options={draft.options}
				teamName={draft.team.name}
				onChange={(fields) => onChange({ ...value, fields })}
				disabled={disabled}
			/>
		</div>
	);
}
