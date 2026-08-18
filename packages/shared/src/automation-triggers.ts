import { z } from "zod";

/**
 * Trigger validation, shared by the editor and the API so a form can block Save
 * on exactly what the server would reject.
 *
 * Two levels, and the distinction is the point:
 *
 * - `draftTriggerSchema` accepts a half-configured trigger. The editor has to be
 *   able to hold "Draft opened in [Select Repos]" with nothing selected yet.
 * - `triggerSchema` is what may be saved. Everything the draft form left empty
 *   is required here.
 *
 * `describeTriggerProblems` returns the same messages the form shows, so the
 * client isn't reimplementing rules the server enforces.
 */

/**
 * Three states, tagged rather than inferred from shape: `null` matches nothing,
 * `{mode:"any"}` matches everything, a list matches those ids. Every id space
 * here is user-controlled — a GitHub label really can be named "any" — so a bare
 * `string[] | "any"` would collide with legal values.
 */
export const triggerScopeSchema = z.union([
	z.null(),
	z.object({ mode: z.literal("any") }),
	z.object({
		mode: z.literal("list"),
		ids: z.array(z.string().min(1)).max(200),
	}),
]);
export type TriggerScope = z.infer<typeof triggerScopeSchema>;

export const triggerActorSchema = z.union([
	z.literal("anyone"),
	// Resolves to the automation's owner at match time rather than being
	// expanded to an id on save, so it survives the owner being renamed.
	z.literal("me"),
	z.object({ ids: z.array(z.string().min(1)).max(200) }),
]);
export type TriggerActor = z.infer<typeof triggerActorSchema>;

/** A scope that is set but selects nothing — the "Select Repos" empty state. */
export function isEmptyScope(scope: TriggerScope): boolean {
	return scope === null || (scope.mode === "list" && scope.ids.length === 0);
}

export function isEmptyActor(actor: TriggerActor): boolean {
	return typeof actor !== "string" && actor.ids.length === 0;
}

const rrule = z.string().min(1).max(500);
const iana = z.string().min(1);

/**
 * A free-text match over a comment body.
 *
 * `isRegex` is pinned to false. A user-supplied pattern is evaluated on the
 * webhook path, and JavaScript's engine backtracks: `^(a+)+$` against a
 * non-matching body doubles in cost every two characters — 408ms at 28
 * characters, and never finishing at a realistic comment length. Truncating the
 * body bounds nothing, because the blowup happens within the first few dozen
 * characters. Substring matching covers the common case; regex returns with a
 * linear-time engine.
 */
export const textFilterSchema = z.object({
	pattern: z.string().max(500),
	isRegex: z.literal(false).default(false),
});
export type TextFilter = z.infer<typeof textFilterSchema>;

/**
 * GitHub events carry different filters, so the config is a union on the event
 * rather than one flat shape: a comment filters on two independent people and a
 * body pattern, while a push filters on neither.
 */
export const githubTriggerEventValues = [
	"draft_opened",
	"pull_request.opened",
	"pull_request.pushed",
	"pull_request.merged",
	"comment_added",
	"push_to_branch",
	"label_change",
	"checks_completed",
	"issue_comment",
	"pr_review_comment",
	"pr_review_submitted.approved",
	"pr_review_submitted.changes_requested",
	"pr_review_submitted.commented",
	"pr_review_submitted.any",
	"review_thread.resolved",
	"review_thread.unresolved",
	"review_thread.any",
	"workflow_run.success",
	"workflow_run.failure",
	"workflow_run.cancelled",
	"workflow_run.any",
] as const;
export type GithubTriggerEvent = (typeof githubTriggerEventValues)[number];

const githubCommon = {
	kind: z.literal("github"),
	repositories: triggerScopeSchema,
	branches: triggerScopeSchema,
	labels: triggerScopeSchema,
	// Fork payloads carry attacker-controlled content into a checkout the agent
	// runs in. A literal rather than a boolean, so enabling it is a schema change
	// with a threat model attached rather than a checkbox someone can tick.
	includeForks: z.literal(false).default(false),
};

/** Events describing one action by one person. */
const githubSimpleEvent = z.object({
	...githubCommon,
	event: z.enum([
		"draft_opened",
		"pull_request.opened",
		"pull_request.pushed",
		"pull_request.merged",
		"push_to_branch",
		"label_change",
		"checks_completed",
		"pr_review_comment",
		"pr_review_submitted.approved",
		"pr_review_submitted.changes_requested",
		"pr_review_submitted.commented",
		"pr_review_submitted.any",
		"review_thread.resolved",
		"review_thread.unresolved",
		"review_thread.any",
		"workflow_run.success",
		"workflow_run.failure",
		"workflow_run.cancelled",
		"workflow_run.any",
	]),
	actor: triggerActorSchema,
});

/**
 * Comments filter on two independent people — who wrote the comment, and who
 * opened the thing it is on — plus an optional pattern over the body.
 */
const githubCommentEvent = z.object({
	...githubCommon,
	event: z.enum(["comment_added", "issue_comment"]),
	actor: triggerActorSchema,
	subjectAuthor: triggerActorSchema,
	commentFilter: textFilterSchema.nullable().default(null),
});

export const githubTriggerConfigSchema = z.union([
	githubSimpleEvent,
	githubCommentEvent,
]);

export const scheduleTriggerConfigSchema = z.object({
	kind: z.literal("schedule"),
	rrule,
	dtstart: z.string().datetime(),
	timezone: iana,
});

export const webhookTriggerConfigSchema = z.object({
	kind: z.literal("webhook"),
});

export const slackTriggerEventValues = [
	"message_in_channel",
	"reaction_added",
	"channel_created",
] as const;
export type SlackTriggerEvent = (typeof slackTriggerEventValues)[number];

/** An emoji short name as Slack sends it: `bug`, `white_check_mark`, `+1`. */
const slackEmojiName = z.string().min(1).max(100);

export const slackTriggerConfigSchema = z.object({
	kind: z.literal("slack"),
	event: z.enum(slackTriggerEventValues),
	// The channel a message or reaction lands in. Not meaningful for
	// channel_created — the channel does not exist yet — so null there.
	channels: triggerScopeSchema,
	// Only meaningful for reaction_added; null elsewhere. The ids are emoji
	// short names typed by the person, so a workspace's custom emoji work
	// without any list of them existing.
	emoji: triggerScopeSchema,
	actor: triggerActorSchema,
	// A pattern over the message text, or over the channel name for
	// channel_created.
	messageFilter: textFilterSchema.nullable().default(null),
	// message_in_channel only: whether a reply inside a thread counts. Defaults
	// to top-level posts, since a busy thread would otherwise fire once a reply.
	topLevelOnly: z.boolean().default(true),
	// message_in_channel only: the reaction to add to the triggering message
	// when the run completes; null for none.
	completionReaction: slackEmojiName.nullable().default("white_check_mark"),
});

export const linearTriggerEventValues = [
	"issue.created",
	"issue.status_changed",
	"issue.assigned",
	"cycle.ended",
] as const;
export type LinearTriggerEvent = (typeof linearTriggerEventValues)[number];

/**
 * One flat shape for every Linear event. Filters an event has no use for —
 * labels on a cycle — sit at "any" and never narrow.
 */
export const linearTriggerConfigSchema = z.object({
	kind: z.literal("linear"),
	event: z.enum(linearTriggerEventValues),
	teams: triggerScopeSchema,
	projects: triggerScopeSchema,
	labels: triggerScopeSchema,
	// Workflow state ids the issue moved into. Only meaningful for
	// issue.status_changed; "any" elsewhere.
	toStatus: triggerScopeSchema,
	// The issue's assignee, not who made the change. Ids are Linear user ids.
	assignee: triggerActorSchema,
});

export const sentryTriggerEventValues = [
	"issue.created",
	"issue.resolved",
	"issue.assigned",
	"issue.archived",
	"issue.unresolved",
	"issue.any",
] as const;
export type SentryTriggerEvent = (typeof sentryTriggerEventValues)[number];

export const sentryTriggerConfigSchema = z.object({
	kind: z.literal("sentry"),
	event: z.enum(sentryTriggerEventValues),
	// Sentry's numeric project ids: a slug can be renamed, the id cannot.
	projects: triggerScopeSchema,
	// Optional narrowing over fatal/error/warning/info/debug; "any" by default.
	level: triggerScopeSchema,
});

export const circlebackTriggerEventValues = ["meeting.completed"] as const;

/**
 * Circleback has no connection: it posts to a per-trigger URL and signs the
 * body with a secret it generates and shows in its own UI. That secret is
 * pasted into the trigger row and lives on the trigger row's secret column,
 * never in this config — the config is returned to every member of the org.
 */
export const circlebackTriggerConfigSchema = z.object({
	kind: z.literal("circleback"),
	event: z.enum(circlebackTriggerEventValues),
	tags: triggerScopeSchema,
	attendees: triggerScopeSchema,
	nameFilter: textFilterSchema.nullable().default(null),
});

/**
 * Notion. `comment.mentioned` is not a Notion event: it is `comment.created`
 * narrowed to comments whose rich text mentions a user, which the webhook
 * route works out after fetching the comment.
 */
export const notionTriggerEventValues = [
	"data_source.content_updated",
	"comment.created",
	"comment.mentioned",
] as const;
export type NotionTriggerEvent = (typeof notionTriggerEventValues)[number];

const notionCommon = {
	kind: z.literal("notion"),
	dataSources: triggerScopeSchema,
};

const notionContentUpdatedEvent = z.object({
	...notionCommon,
	event: z.literal("data_source.content_updated"),
});

/**
 * Comments live on a page, which may itself be a row of a data source, so
 * both narrow: the data source the page belongs to and the page itself.
 */
const notionCommentCreatedEvent = z.object({
	...notionCommon,
	event: z.literal("comment.created"),
	pages: triggerScopeSchema,
	actor: triggerActorSchema,
});

const notionCommentMentionedEvent = z.object({
	...notionCommon,
	event: z.literal("comment.mentioned"),
	pages: triggerScopeSchema,
	// Who has to be @-mentioned for the comment to count. "me" is the common
	// case; "anyone" fires on any comment that mentions somebody.
	mentionedUser: triggerActorSchema,
});

export const notionTriggerConfigSchema = z.union([
	notionContentUpdatedEvent,
	notionCommentCreatedEvent,
	notionCommentMentionedEvent,
]);

export const microsoftTeamsTriggerEventValues = [
	"message_in_channel",
	"channel_created",
] as const;
export type MicrosoftTeamsTriggerEvent =
	(typeof microsoftTeamsTriggerEventValues)[number];

/**
 * Teams triggers scope by team, then by channel within it. `channel_created`
 * has no channel to filter on — the channel is the thing being created — so it
 * carries `channels: null` and reads `messageFilter` as a pattern over the new
 * channel's name.
 */
export const microsoftTeamsTriggerConfigSchema = z.object({
	kind: z.literal("microsoft_teams"),
	event: z.enum(microsoftTeamsTriggerEventValues),
	teams: triggerScopeSchema,
	// Only meaningful for message_in_channel; null elsewhere.
	channels: triggerScopeSchema,
	// Only meaningful for message_in_channel; "anyone" elsewhere.
	actor: triggerActorSchema,
	messageFilter: textFilterSchema.nullable().default(null),
});

/**
 * Google Calendar events carry different filters, so the config is a union on
 * the event: a change carries the external-attendee narrowing, a starting-soon
 * fire carries how far ahead it fires, and a cancellation carries neither.
 */
export const googleCalendarTriggerEventValues = [
	"event.created",
	"event.updated",
	"event.cancelled",
	"event.starting_soon",
	"event.ended",
] as const;
export type GoogleCalendarTriggerEvent =
	(typeof googleCalendarTriggerEventValues)[number];

const googleCalendarCommon = {
	kind: z.literal("google_calendar"),
	calendars: triggerScopeSchema,
	// Anyone on the event: organizer, creator or invitee. Ids are email
	// addresses, since that is what a calendar event names people by.
	attendee: triggerActorSchema,
	titleFilter: textFilterSchema.nullable().default(null),
};

const googleCalendarChangeEvent = z.object({
	...googleCalendarCommon,
	event: z.enum(["event.created", "event.updated"]),
	// A boolean rather than a scope: false is "do not narrow", true requires
	// someone from outside the connected account's domain to be on the event.
	hasExternalAttendee: z.boolean().default(false),
});

const googleCalendarStartingSoonEvent = z.object({
	...googleCalendarCommon,
	event: z.literal("event.starting_soon"),
	minutesBefore: z.number().int().min(1).max(1440).default(15),
});

const googleCalendarSimpleEvent = z.object({
	...googleCalendarCommon,
	event: z.enum(["event.cancelled", "event.ended"]),
});

export const googleCalendarTriggerConfigSchema = z.union([
	googleCalendarChangeEvent,
	googleCalendarStartingSoonEvent,
	googleCalendarSimpleEvent,
]);

export const gmailTriggerEventValues = ["message.received"] as const;
export type GmailTriggerEvent = (typeof gmailTriggerEventValues)[number];

export const gmailTriggerConfigSchema = z.object({
	kind: z.literal("gmail"),
	event: z.enum(gmailTriggerEventValues),
	// Addresses or bare domains ("acme.com"), free-form: a sender is not a
	// pickable value the way a channel is.
	from: triggerScopeSchema,
	to: triggerScopeSchema,
	subjectFilter: textFilterSchema.nullable().default(null),
	// Gmail label ids, not names: a label can be renamed, its id cannot.
	labels: triggerScopeSchema,
	hasAttachment: z.boolean().default(false),
});

/**
 * Structurally valid — the shape is right, but a scope may still select nothing.
 * This is what the editor holds while someone is still filling a trigger in.
 */
export const draftTriggerSchema = z.object({
	// Absent on a row that has not been saved yet. Present rows keep their id so
	// a save updates in place rather than deleting and recreating, which would
	// otherwise roll a webhook trigger's key and lose a schedule's next run.
	id: z.string().uuid().optional(),
	enabled: z.boolean().default(true),
	config: z.union([
		scheduleTriggerConfigSchema,
		webhookTriggerConfigSchema,
		githubTriggerConfigSchema,
		slackTriggerConfigSchema,
		linearTriggerConfigSchema,
		sentryTriggerConfigSchema,
		notionTriggerConfigSchema,
		circlebackTriggerConfigSchema,
		microsoftTeamsTriggerConfigSchema,
		googleCalendarTriggerConfigSchema,
		gmailTriggerConfigSchema,
	]),
});
export type DraftTrigger = z.infer<typeof draftTriggerSchema>;
export type TriggerConfigInput = DraftTrigger["config"];

/** One problem, addressed to a specific trigger so the form can mark that row. */
export type TriggerProblem = {
	index: number;
	field: string;
	message: string;
};

/**
 * The rules a draft must satisfy before it can be saved. Kept as explicit checks
 * rather than schema refinements so each one carries a message the form can put
 * next to the field it belongs to.
 */
export function describeTriggerProblems(
	triggers: DraftTrigger[],
): TriggerProblem[] {
	const problems: TriggerProblem[] = [];
	const add = (index: number, field: string, message: string) =>
		problems.push({ index, field, message });

	if (triggers.length === 0) {
		add(-1, "triggers", "Add at least one trigger.");
	}

	triggers.forEach((trigger, index) => {
		const config = trigger.config;
		switch (config.kind) {
			case "github": {
				if (isEmptyScope(config.repositories)) {
					add(index, "repositories", "Specify at least one repository.");
				}
				if (isEmptyActor(config.actor)) {
					add(index, "actor", "Specify at least one person, or choose Anyone.");
				}
				if ("subjectAuthor" in config && isEmptyActor(config.subjectAuthor)) {
					add(
						index,
						"subjectAuthor",
						"Specify at least one person, or choose Anyone.",
					);
				}
				break;
			}
			case "slack": {
				if (
					config.event !== "channel_created" &&
					isEmptyScope(config.channels)
				) {
					add(index, "channels", "Specify at least one channel.");
				}
				if (config.event === "reaction_added" && isEmptyScope(config.emoji)) {
					add(index, "emoji", "Specify at least one reaction.");
				}
				if (isEmptyActor(config.actor)) {
					add(index, "actor", "Specify at least one person, or choose Anyone.");
				}
				break;
			}
			case "notion": {
				if (isEmptyScope(config.dataSources)) {
					add(index, "dataSources", "Specify at least one data source.");
				}
				if ("actor" in config && isEmptyActor(config.actor)) {
					add(index, "actor", "Specify at least one person, or choose Anyone.");
				}
				if ("mentionedUser" in config && isEmptyActor(config.mentionedUser)) {
					add(
						index,
						"mentionedUser",
						"Specify at least one person, or choose Anyone.",
					);
				}
				break;
			}
			case "linear": {
				if (isEmptyScope(config.teams)) {
					add(index, "teams", "Specify at least one team.");
				}
				// Only the events whose sentence shows an assignee; a created or
				// cycle trigger has no chip to clear such a problem with.
				if (
					(config.event === "issue.status_changed" ||
						config.event === "issue.assigned") &&
					isEmptyActor(config.assignee)
				) {
					add(
						index,
						"assignee",
						"Specify at least one person, or choose Anyone.",
					);
				}
				break;
			}
			case "microsoft_teams": {
				if (isEmptyScope(config.teams)) {
					add(index, "teams", "Specify at least one team.");
				}
				if (
					config.event === "message_in_channel" &&
					isEmptyScope(config.channels)
				) {
					add(index, "channels", "Specify at least one channel.");
				}
				if (isEmptyActor(config.actor)) {
					add(index, "actor", "Specify at least one person, or choose Anyone.");
				}
				break;
			}
			case "sentry": {
				if (isEmptyScope(config.projects)) {
					add(index, "projects", "Specify at least one project.");
				}
				break;
			}
			case "google_calendar": {
				if (isEmptyScope(config.calendars)) {
					add(index, "calendars", "Specify at least one calendar.");
				}
				if (isEmptyActor(config.attendee)) {
					add(
						index,
						"attendee",
						"Specify at least one person, or choose Anyone.",
					);
				}
				break;
			}
			case "gmail": {
				// The sender is the primary scope, as the repository is for GitHub:
				// a mailbox-wide trigger has to be chosen ("Any sender"), never
				// arrived at by leaving the chip empty.
				if (isEmptyScope(config.from)) {
					add(
						index,
						"from",
						"Specify at least one sender, or choose Any sender.",
					);
				}
				break;
			}
			case "circleback":
				break;
			case "schedule":
			case "webhook":
				break;
		}
	});

	return problems;
}

/** The banner shown above the trigger list, or null when there is nothing wrong. */
export function summarizeTriggerProblems(
	problems: TriggerProblem[],
): string | null {
	if (problems.length === 0) return null;
	const missingTriggers = problems.find((p) => p.field === "triggers");
	if (missingTriggers) return missingTriggers.message;
	return "Some triggers need additional configuration";
}
