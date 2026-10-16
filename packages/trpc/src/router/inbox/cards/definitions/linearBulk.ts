import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type LinearBulkView,
	withInput,
} from "../types";
import { linearFor } from "./linearClient";
import {
	commentInput,
	DRAFT_MAX,
	fieldsInput,
	ISSUE_REF,
	LINEAR_ID,
	loadIssues,
	loadTeam,
	postComment,
	type RawIssue,
	resolveSuggested,
	type SuggestionRefs,
	suggestionRefs,
	type TeamFacts,
	toIssueUpdate,
	toIssueView,
} from "./linearIssues";

interface Refs extends SuggestionRefs {
	issues: string[];
	change: "close" | "move";
	comment?: string;
}

interface Data {
	issues: RawIssue[];
	team: TeamFacts;
	teamName: string;
}

const ISSUES_MAX = 25;
const ISSUES_TEXT_MAX = 1200;

function closes(team: TeamFacts, state: string | undefined): boolean {
	const type = team.options.states.find((item) => item.id === state)?.type;
	return type === "completed" || type === "canceled";
}

export const linearBulk = defineCard<Refs, Data>({
	type: "linear.bulk",
	label: "Linear bulk edit",
	ask: "Change issues",
	brand: "linear",
	refs: z.object({
		/** Comma-separated identifiers, all of one team. */
		issues: z
			.string()
			.max(ISSUES_TEXT_MAX)
			.transform((value) => [
				...new Set(
					value
						.split(",")
						.map((part) => part.trim())
						.filter(Boolean),
				),
			])
			.pipe(z.array(z.string().regex(ISSUE_REF)).min(1).max(ISSUES_MAX)),
		/** `close` proposes the team's done status unless `state` names another. */
		change: z.enum(["close", "move"]),
		comment: z.string().max(DRAFT_MAX).optional(),
		...suggestionRefs,
	}) as unknown as z.ZodType<Refs>,
	async resolve({ refs, ctx }) {
		const gql = linearFor(ctx);
		const issues = await loadIssues(gql, refs.issues);
		const first = issues[0];
		if (!first)
			throw new CardUnavailable(
				"gone",
				"None of those issues are ones your Linear account can see",
			);
		if (issues.some((issue) => issue.team.id !== first.team.id))
			throw new CardUnavailable(
				"error",
				"Those issues are in more than one team",
			);
		const team = await loadTeam(gql, first.team.id, issues);
		const suggested = resolveSuggested(refs, team);
		const done = team.options.states.find(
			(state) => state.type === "completed",
		);
		const proposed =
			refs.change === "close" && !suggested.state && done
				? { ...suggested, state: done.id }
				: suggested;
		const view: LinearBulkView = {
			kind: "linear.bulk",
			account: team.account,
			team: first.team,
			issues: issues.map((issue) => toIssueView(issue, true)),
			options: team.options,
			proposed,
			comment: refs.comment ?? "",
		};
		const fields: CardField[] = [
			{ label: "Team", value: first.team.name },
			{ label: "Issues", value: String(issues.length) },
		];
		return {
			title: closes(team, proposed.state)
				? `Close ${issues.length} issues`
				: `Change ${issues.length} issues`,
			subtitle: first.team.key,
			fields,
			body: issues
				.map((issue) => `${issue.identifier} ${issue.title}`)
				.join("\n")
				.slice(0, 1200),
			view,
			data: { issues, team, teamName: first.team.name },
		};
	},
	actions: {
		apply: {
			label: () => "Apply to issues",
			style: "primary",
			role: "primary",
			confirm: (data) =>
				`Apply this to the checked issues in ${data.teamName}?`,
			run: withInput(
				fieldsInput.extend({
					issues: z.array(z.string().regex(LINEAR_ID)).min(1).max(ISSUES_MAX),
					comment: commentInput,
				}),
				async ({ data, ctx, input }) => {
					const { issues: chosen, comment: body, ...change } = input;
					const ids = [...new Set(chosen)];
					const targets = ids.map((id) => {
						const issue = data.issues.find((item) => item.id === id);
						if (!issue)
							throw new CardUnavailable(
								"error",
								"One of those issues is not on this card",
							);
						return issue;
					});
					const update = toIssueUpdate(change, data.team, "add");
					if (Object.keys(update).length === 0 && !body)
						throw new CardUnavailable("error", "There is nothing to change");
					const gql = linearFor(ctx);
					if (Object.keys(update).length > 0) {
						const { issueBatchUpdate } = await gql<{
							issueBatchUpdate: { success: boolean };
						}>(
							"mutation($ids: [UUID!]!, $input: IssueUpdateInput!) { issueBatchUpdate(ids: $ids, input: $input) { success } }",
							{ ids, input: update },
						);
						if (!issueBatchUpdate.success)
							throw new CardUnavailable(
								"no_access",
								"Linear refused the change",
							);
					}
					if (body)
						for (const issue of targets)
							await postComment(gql, ctx, { issueId: issue.id, body });
					return {
						outcome: {
							changed: targets.map((issue) => issue.identifier),
							fields: Object.keys(update),
							commented: Boolean(body),
						},
						notice: {
							tone: "good",
							text:
								targets.length === 1
									? "1 issue changed"
									: `${targets.length} issues changed`,
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
				return { outcome: { changed: [] } };
			},
		},
	},
});
