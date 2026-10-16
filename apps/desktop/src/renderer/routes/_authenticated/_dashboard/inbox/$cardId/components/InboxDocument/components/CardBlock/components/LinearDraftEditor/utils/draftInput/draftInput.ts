import type { LinearDraftView, LinearFieldsView } from "../../../../types";

/** A drafted issue as the reader left it. */
export interface LinearDraftValue {
	title: string;
	/** Markdown. */
	description: string;
	fields: Partial<LinearFieldsView>;
}

/** What the server takes to file a draft: the team by id and only the properties that are set. */
export interface LinearDraftInput extends LinearDraftValue {
	team: string;
}

/** The draft as the agent wrote it. */
export function draftValue(draft: LinearDraftView): LinearDraftValue {
	return {
		title: draft.title,
		description: draft.description,
		fields: draft.fields,
	};
}

/** Null while the title is empty, because Linear takes no issue without one. */
export function draftInput(
	draft: LinearDraftView,
	value: LinearDraftValue,
): LinearDraftInput | null {
	const title = value.title.trim();
	if (title === "") return null;
	return {
		team: draft.team.id,
		title,
		description: value.description,
		fields: Object.fromEntries(
			Object.entries(value.fields).filter(([, set]) => set !== undefined),
		),
	};
}
