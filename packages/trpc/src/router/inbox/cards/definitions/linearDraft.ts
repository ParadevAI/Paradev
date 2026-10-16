import { z } from "zod";
import {
	type CardContext,
	CardUnavailable,
	type LinearDraftView,
} from "../types";
import type { LinearQuery } from "./linearClient";
import {
	DRAFT_MAX,
	type FieldsInput,
	fieldsInput,
	LINEAR_ID,
	loadTeam,
	resolveSuggested,
	type SuggestionRefs,
	suggestionRefs,
	type TeamFacts,
	toIssueUpdate,
	writeId,
} from "./linearIssues";

const TITLE_MAX = 250;
const TEAM = /^([A-Za-z][A-Za-z0-9]{0,9}|[0-9a-f-]{36})$/;

/** A new issue the agent drafted: the team by key or id, its words, and suggested properties by name. */
export const draftRefs = {
	team: z.string().regex(TEAM),
	title: z.string().max(TITLE_MAX).optional(),
	description: z.string().max(DRAFT_MAX).optional(),
	...suggestionRefs,
};

export interface DraftRefs extends SuggestionRefs {
	team: string;
	title?: string;
	description?: string;
}

export interface LoadedDraft {
	facts: TeamFacts;
	team: { id: string; key: string; name: string };
	view: LinearDraftView;
}

export async function loadDraft(
	gql: LinearQuery,
	refs: DraftRefs,
	fallback: { title: string; description: string },
): Promise<LoadedDraft> {
	const { team } = await gql<{
		team: { id: string; key: string; name: string } | null;
	}>("query($team: String!) { team(id: $team) { id key name } }", {
		team: refs.team,
	});
	if (!team)
		throw new CardUnavailable(
			"gone",
			"Linear has no team with that key for you",
		);
	const facts = await loadTeam(gql, team.id);
	return {
		facts,
		team,
		view: {
			account: facts.account,
			team,
			title: refs.title ?? fallback.title,
			description: refs.description ?? fallback.description,
			fields: resolveSuggested(refs, facts),
			options: facts.options,
		},
	};
}

export const draftInput = z.object({
	team: z.string().regex(LINEAR_ID),
	title: z.string().trim().min(1).max(TITLE_MAX),
	description: z.string().max(DRAFT_MAX).default(""),
	fields: fieldsInput.default({}),
});
export type DraftInput = z.infer<typeof draftInput>;

export interface FiledIssue {
	id: string;
	identifier: string;
	url: string;
}

const FILED = "id identifier url";

/** The issue's id comes from the card and the step that files it, so a second try after Linear took the first finds that issue instead of filing another, whatever the reader changed in between. */
export async function fileDraft(
	gql: LinearQuery,
	ctx: CardContext,
	loaded: LoadedDraft,
	input: { title: string; description: string; fields: FieldsInput },
	slot: string,
): Promise<FiledIssue> {
	const id = writeId(ctx, ["issue", slot]);
	const issue = {
		id,
		teamId: loaded.team.id,
		title: input.title,
		description: input.description,
		...toIssueUpdate(input.fields, loaded.facts),
	};
	try {
		const { issueCreate } = await gql<{
			issueCreate: { success: boolean; issue: FiledIssue | null };
		}>(
			`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${FILED} } } }`,
			{ input: issue },
		);
		if (issueCreate.issue) return issueCreate.issue;
	} catch (error) {
		const { issue: existing } = await gql<{
			issue:
				| (FiledIssue & {
						trashed: boolean | null;
						team: { id: string };
						creator: { isMe: boolean } | null;
				  })
				| null;
		}>(
			`query($id: String!) { issue(id: $id) { ${FILED} trashed team { id } creator { isMe } } }`,
			{ id },
		).catch(() => ({ issue: null }));
		if (
			existing &&
			!existing.trashed &&
			existing.team.id === loaded.team.id &&
			existing.creator?.isMe
		)
			return {
				id: existing.id,
				identifier: existing.identifier,
				url: existing.url,
			};
		throw error;
	}
	throw new CardUnavailable("no_access", "Linear refused to file the issue");
}
