import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type LinearTriageView,
	withInput,
} from "../types";
import { linearFor } from "./linearClient";
import {
	assertUnchanged,
	commentInput,
	DRAFT_MAX,
	fieldsInput,
	ISSUE_REF,
	LINEAR_ID,
	loadIssue,
	loadTeam,
	postComment,
	type RawIssue,
	resolveSuggested,
	type SuggestionRefs,
	suggestionRefs,
	type TeamFacts,
	toIssueUpdate,
	toIssueView,
	updateIssue,
	versionInput,
	writeId,
} from "./linearIssues";

interface Refs extends SuggestionRefs {
	issue: string;
	duplicate_of?: string;
	comment?: string;
}

interface Data {
	issue: RawIssue;
	team: TeamFacts;
	duplicateOf: RawIssue | null;
}

const SNOOZE_DAYS_MAX = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const inTriage = (data: Data) =>
	data.issue.state.type === "triage"
		? true
		: `${data.issue.identifier} is no longer in triage`;

function canceledState(data: Data): string {
	const state = data.team.options.states.find(
		(item) => item.type === "canceled",
	);
	if (!state)
		throw new CardUnavailable(
			"error",
			"This team has no canceled status. Add one in Linear",
		);
	return state.id;
}

async function comment(
	args: { ctx: Parameters<typeof linearFor>[0]; data: Data },
	body: string | undefined,
): Promise<boolean> {
	if (!body) return false;
	await postComment(linearFor(args.ctx), args.ctx, {
		issueId: args.data.issue.id,
		body,
	});
	return true;
}

export const linearTriage = defineCard<Refs, Data>({
	type: "linear.triage",
	label: "Linear triage",
	ask: "Triage issue",
	brand: "linear",
	refs: z.object({
		issue: z.string().regex(ISSUE_REF),
		/** The issue this one repeats, when the agent thinks it is a duplicate. */
		duplicate_of: z.string().regex(ISSUE_REF).optional(),
		comment: z.string().max(DRAFT_MAX).optional(),
		...suggestionRefs,
	}),
	async resolve({ refs, ctx }) {
		const gql = linearFor(ctx);
		const issue = await loadIssue(gql, refs.issue);
		const [team, duplicateOf] = await Promise.all([
			loadTeam(gql, issue.team.id, [issue]),
			refs.duplicate_of
				? loadIssue(gql, refs.duplicate_of).catch((error) => {
						if (error instanceof CardUnavailable && error.state === "gone")
							return null;
						throw error;
					})
				: null,
		]);
		const original = duplicateOf?.id === issue.id ? null : duplicateOf;
		const view: LinearTriageView = {
			kind: "linear.triage",
			account: team.account,
			issue: toIssueView(issue),
			options: team.options,
			suggested: resolveSuggested(refs, team),
			duplicateOf: original ? toIssueView(original, true) : null,
			comment: refs.comment ?? "",
			snoozedUntil: issue.snoozedUntilAt,
			priorityRequired: team.priorityRequired,
			defaultState: team.defaultState,
		};
		const fields: CardField[] = [
			{ label: "Issue", value: issue.identifier, href: issue.url },
			{ label: "Team", value: issue.team.name },
			{ label: "Status", value: issue.state.name },
			...(issue.creator
				? [{ label: "Created by", value: view.issue.creator?.name ?? "" }]
				: []),
			...(original
				? [
						{
							label: "Possible duplicate of",
							value: original.identifier,
							href: original.url,
						},
					]
				: []),
		];
		return {
			title: issue.title,
			subtitle: issue.identifier,
			fields,
			body: issue.description?.slice(0, 1200) || undefined,
			view,
			data: { issue, team, duplicateOf: original },
		};
	},
	actions: {
		accept: {
			label: () => "Accept",
			style: "primary",
			role: "primary",
			available: inTriage,
			run: withInput(
				fieldsInput.extend({ comment: commentInput, version: versionInput }),
				async ({ data, ctx, input }) => {
					const { comment: body, version, ...chosen } = input;
					assertUnchanged(data.issue, version);
					const state = chosen.state ?? data.team.defaultState;
					if (!state)
						throw new CardUnavailable(
							"error",
							"Pick a status to accept this issue into",
						);
					const priority = chosen.priority ?? data.issue.priority;
					if (data.team.priorityRequired && priority === 0)
						throw new CardUnavailable(
							"error",
							"This team needs a priority before an issue leaves triage",
						);
					const update = toIssueUpdate({ ...chosen, state }, data.team);
					const commented = await comment({ ctx, data }, body);
					await updateIssue(linearFor(ctx), data.issue.id, update);
					return {
						outcome: { accepted: true, ...chosen, state, commented },
						notice: { tone: "good", text: "Issue accepted" },
					};
				},
			),
		},
		decline: {
			label: () => "Decline",
			style: "secondary",
			role: "dismiss",
			available: inTriage,
			run: withInput(
				z.object({ comment: commentInput }),
				async ({ data, ctx, input }) => {
					const stateId = canceledState(data);
					const commented = await comment({ ctx, data }, input.comment);
					await updateIssue(linearFor(ctx), data.issue.id, { stateId });
					return {
						outcome: { declined: true, commented },
						notice: { tone: "good", text: "Issue declined" },
					};
				},
			),
		},
		duplicate: {
			label: () => "Mark as duplicate",
			style: "secondary",
			role: "other",
			available: inTriage,
			run: withInput(
				z.object({
					of: z.string().regex(LINEAR_ID),
					comment: commentInput,
				}),
				async ({ data, ctx, input }) => {
					const gql = linearFor(ctx);
					if (input.of === data.issue.id)
						throw new CardUnavailable(
							"error",
							"An issue cannot be a duplicate of itself",
						);
					const original = await loadIssue(gql, input.of);
					const commented = await comment({ ctx, data }, input.comment);
					await gql(
						"mutation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }",
						{
							input: {
								id: writeId(ctx, [data.issue.id, original.id, "duplicate"]),
								issueId: data.issue.id,
								relatedIssueId: original.id,
								type: "duplicate",
							},
						},
					);
					return {
						outcome: {
							duplicateOf: original.identifier,
							duplicateOfId: original.id,
							commented,
						},
						notice: {
							tone: "good",
							text: `Marked as a duplicate of ${original.identifier}`,
						},
					};
				},
			),
		},
		snooze: {
			label: () => "Snooze",
			style: "secondary",
			role: "other",
			available: inTriage,
			run: withInput(
				z.object({ until: z.string().datetime({ offset: true }) }),
				async ({ data, ctx, input }) => {
					const until = Date.parse(input.until);
					if (until <= Date.now())
						throw new CardUnavailable("error", "That time has passed");
					if (until > Date.now() + SNOOZE_DAYS_MAX * DAY_MS)
						throw new CardUnavailable("error", "Snooze for a year at most");
					await updateIssue(linearFor(ctx), data.issue.id, {
						snoozedUntilAt: new Date(until).toISOString(),
					});
					return {
						outcome: { snoozedUntil: new Date(until).toISOString() },
						notice: { tone: "good", text: "Issue snoozed" },
					};
				},
			),
		},
	},
});
