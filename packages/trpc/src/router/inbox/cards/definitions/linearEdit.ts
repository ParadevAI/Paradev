import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type LinearEditView,
	type LinearFieldsView,
	withInput,
} from "../types";
import { linearFor } from "./linearClient";
import {
	assertUnchanged,
	DRAFT_MAX,
	fieldsInput,
	ISSUE_REF,
	loadIssue,
	loadTeam,
	type RawIssue,
	resolveSuggested,
	type SuggestionRefs,
	suggestionRefs,
	type TeamFacts,
	toIssueUpdate,
	toIssueView,
	updateIssue,
	versionInput,
} from "./linearIssues";

interface Refs extends SuggestionRefs {
	issue: string;
	title?: string;
	description?: string;
}

interface Data {
	issue: RawIssue;
	team: TeamFacts;
}

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 50_000;

/** Only what differs from the issue: a suggestion that repeats the current value is no change. */
function changesOnly(
	suggested: Partial<LinearFieldsView>,
	current: LinearFieldsView,
): Partial<LinearFieldsView> {
	const same = (key: keyof LinearFieldsView) =>
		key === "labels"
			? [...(suggested.labels ?? [])].sort().join() ===
				[...current.labels].sort().join()
			: suggested[key] === current[key];
	return Object.fromEntries(
		Object.entries(suggested).filter(
			([key]) => !same(key as keyof LinearFieldsView),
		),
	);
}

export const linearEdit = defineCard<Refs, Data>({
	type: "linear.edit",
	label: "Linear issue edit",
	ask: "Edit issue",
	brand: "linear",
	refs: z.object({
		issue: z.string().regex(ISSUE_REF),
		title: z.string().trim().min(1).max(TITLE_MAX).optional(),
		/** Markdown. */
		description: z.string().max(DRAFT_MAX).optional(),
		...suggestionRefs,
	}),
	async resolve({ refs, ctx }) {
		const gql = linearFor(ctx);
		const issue = await loadIssue(gql, refs.issue);
		const team = await loadTeam(gql, issue.team.id, [issue]);
		const current = toIssueView(issue);
		const view: LinearEditView = {
			kind: "linear.edit",
			account: team.account,
			issue: current,
			options: team.options,
			proposed: {
				title:
					refs.title !== undefined && refs.title !== issue.title
						? refs.title
						: null,
				description:
					refs.description !== undefined &&
					refs.description !== current.description
						? refs.description
						: null,
				fields: changesOnly(resolveSuggested(refs, team), current.fields),
			},
		};
		const changes =
			Number(view.proposed.title !== null) +
			Number(view.proposed.description !== null) +
			Object.keys(view.proposed.fields).length;
		const fields: CardField[] = [
			{ label: "Issue", value: issue.identifier, href: issue.url },
			{ label: "Status", value: issue.state.name },
			{ label: "Proposed changes", value: String(changes) },
		];
		return {
			title: issue.title,
			subtitle: issue.identifier,
			fields,
			body: issue.description?.slice(0, 1200) || undefined,
			view,
			data: { issue, team },
		};
	},
	actions: {
		apply: {
			label: () => "Apply changes",
			style: "primary",
			role: "primary",
			run: withInput(
				fieldsInput.extend({
					title: z.string().trim().min(1).max(TITLE_MAX).optional(),
					description: z.string().max(DESCRIPTION_MAX).optional(),
					version: versionInput,
				}),
				async ({ data, ctx, input }) => {
					assertUnchanged(data.issue, input.version);
					const { title, description, version: _seen, ...chosen } = input;
					const update = {
						...toIssueUpdate(chosen, data.team),
						...(title === undefined ? {} : { title }),
						...(description === undefined ? {} : { description }),
					};
					if (Object.keys(update).length === 0)
						throw new CardUnavailable("error", "There is nothing to change");
					await updateIssue(linearFor(ctx), data.issue.id, update);
					return {
						outcome: { applied: Object.keys(update) },
						notice: {
							tone: "good",
							text: `${data.issue.identifier} updated`,
						},
					};
				},
			),
		},
		dismiss: {
			label: () => "Keep as is",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { applied: [] } };
			},
		},
	},
});
