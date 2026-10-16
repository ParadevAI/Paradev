import { z } from "zod";
import {
	AmbiguousConnectionError,
	orgConnection,
} from "../../../../lib/connectors/lookup";
import {
	getSentryAccessToken,
	SENTRY_URL,
} from "../../../integration/sentry/utils";
import { TokenRefreshError } from "../../../integration/token-refresh";
import {
	type CardContext,
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type SentryIssueView,
	type SentryPersonView,
	withInput,
} from "../types";
import {
	agentPrompt,
	startedAgent,
	startedInput,
	startedNotice,
} from "./agentStarted";
import {
	doneRef,
	type Landed,
	landedOf,
	noRoom,
	planSentence,
	runSteps,
	type Step,
	sealLanded,
} from "./handoffSteps";
import { linearFor } from "./linearClient";
import {
	type DraftRefs,
	draftInput,
	draftRefs,
	fileDraft,
	type LoadedDraft,
	loadDraft,
} from "./linearDraft";

const CONNECT = { label: "Connect Sentry", href: "#/settings/integrations" };

const issueSchema = z.object({
	id: z.string(),
	shortId: z.string(),
	title: z.string(),
	culprit: z.string().nullable().optional(),
	status: z.string(),
	level: z.string().optional(),
	count: z.string(),
	userCount: z.number(),
	firstSeen: z.string(),
	lastSeen: z.string(),
	permalink: z.string(),
	project: z.object({ slug: z.string(), name: z.string().optional() }),
	assignedTo: z
		.object({
			type: z.string(),
			id: z.string(),
			name: z.string().optional(),
			email: z.string().optional(),
		})
		.nullable()
		.optional(),
	metadata: z
		.object({
			type: z.string().optional(),
			value: z.string().optional(),
			filename: z.string().optional(),
			function: z.string().optional(),
		})
		.optional(),
});

const membersSchema = z.array(
	z.object({
		name: z.string().optional(),
		email: z.string().optional(),
		user: z
			.object({
				id: z.string(),
				name: z.string().optional(),
				email: z.string().optional(),
			})
			.nullable()
			.optional(),
	}),
);

interface Refs extends Partial<DraftRefs> {
	issue: string;
	done?: string;
}

interface IssueData {
	id: string;
	shortId: string;
	status: string;
	regionUrl: string;
	orgSlug: string;
	permalink: string;
	members: SentryPersonView[];
	draft: LoadedDraft | null;
	landed: Landed;
	noRoom: string | null;
}

const MEMBERS_PAGE = 100;
const MEMBER_PAGES_MAX = 3;
const FIX_MAX = 4000;

const reconnect = () =>
	new CardUnavailable(
		"no_connector",
		"Sentry needs reconnecting for this organization",
		CONNECT,
	);

async function sentryToken(
	organizationId: string,
): Promise<{ token: string; orgSlug: string; regionUrl: string }> {
	let connection: Awaited<ReturnType<typeof orgConnection>>;
	try {
		connection = await orgConnection(organizationId, "sentry");
	} catch (error) {
		if (error instanceof AmbiguousConnectionError) {
			throw new CardUnavailable("error", error.message);
		}
		throw error;
	}
	if (!connection) {
		throw new CardUnavailable(
			"no_connector",
			"Connect Sentry for this organization to see this issue",
			CONNECT,
		);
	}
	const orgSlug = connection.externalAccountId;
	const state =
		connection.state?.provider === "sentry" ? connection.state : null;
	let refreshed: Awaited<ReturnType<typeof getSentryAccessToken>>;
	try {
		refreshed = await getSentryAccessToken(connection.id);
	} catch (error) {
		if (error instanceof TokenRefreshError) {
			throw reconnect();
		}
		throw error;
	}
	if (refreshed.disconnected) {
		throw reconnect();
	}
	return {
		token: refreshed.accessToken,
		orgSlug,
		regionUrl: state?.regionUrl ?? SENTRY_URL,
	};
}

async function request(
	base: string,
	token: string,
	path: string,
	init?: RequestInit,
): Promise<{ body: unknown; next: string | null }> {
	const response = await fetch(`${base}/api/0${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${token}`,
			...(init?.body ? { "content-type": "application/json" } : {}),
		},
		signal: AbortSignal.timeout(10_000),
	}).catch(() => {
		throw new CardUnavailable(
			"error",
			init?.method
				? "Sentry did not answer. Look in Sentry before you try again"
				: "Sentry did not answer. Try again",
		);
	});
	const body: unknown = await response.json().catch(() => null);
	if (response.status === 401) throw reconnect();
	if (response.status === 404)
		throw new CardUnavailable("gone", "Sentry no longer has this");
	if (response.status === 403)
		throw new CardUnavailable(
			"no_access",
			"Superset's Sentry access cannot do this",
		);
	if (response.status === 429)
		throw new CardUnavailable(
			"error",
			"Sentry is limiting requests. Try again in a minute",
		);
	if (response.status >= 500)
		throw new CardUnavailable("error", "Sentry did not answer. Try again");
	if (!response.ok) {
		const refusal = z
			.union([
				z.object({ detail: z.string() }).transform((said) => said.detail),
				z
					.record(z.string(), z.array(z.string()).min(1))
					.transform((said) => Object.values(said)[0]?.[0] ?? ""),
			])
			.safeParse(body);
		throw new CardUnavailable(
			"error",
			refusal.success && refusal.data
				? `Sentry refused: ${refusal.data.slice(0, 300)}`
				: `Sentry answered ${response.status}`,
		);
	}
	const next =
		/<[^>]*[?&]cursor=([^&>]+)[^>]*>; rel="next"; results="true"/.exec(
			response.headers.get("link") ?? "",
		);
	return { body, next: next?.[1] ?? null };
}

async function sentry<T>(
	base: string,
	token: string,
	path: string,
	schema: z.ZodType<T>,
): Promise<T> {
	const parsed = schema.safeParse((await request(base, token, path)).body);
	if (!parsed.success)
		throw new CardUnavailable(
			"error",
			"Sentry answered in a shape this card does not know",
		);
	return parsed.data;
}

async function membersOf(
	base: string,
	token: string,
	orgSlug: string,
): Promise<z.infer<typeof membersSchema>> {
	const members: z.infer<typeof membersSchema> = [];
	let cursor: string | null = null;
	for (let page = 0; page < MEMBER_PAGES_MAX; page++) {
		const read: Awaited<ReturnType<typeof request>> | null = await request(
			base,
			token,
			`/organizations/${orgSlug}/members/?per_page=${MEMBERS_PAGE}${cursor ? `&cursor=${cursor}` : ""}`,
		).catch(() => null);
		const parsed = membersSchema.safeParse(read?.body);
		if (!read || !parsed.success) break;
		members.push(...parsed.data);
		if (!read.next) break;
		cursor = read.next;
	}
	return members;
}

async function write(
	data: IssueData,
	organizationId: string,
	path: string,
	method: "PUT" | "POST",
	body: Record<string, unknown>,
): Promise<void> {
	const { token } = await sentryToken(organizationId);
	await request(
		data.regionUrl,
		token,
		`/organizations/${data.orgSlug}/issues/${data.id}${path}`,
		{ method, body: JSON.stringify(body) },
	);
}

const setIssue = (
	data: IssueData,
	organizationId: string,
	change: Record<string, unknown>,
) => write(data, organizationId, "/", "PUT", change);

const fileInput = z.object({ issue: draftInput });

function fileSteps(
	data: IssueData,
	draft: LoadedDraft,
	input: z.infer<typeof fileInput>,
	ctx: CardContext,
): Step[] {
	return [
		{
			id: "file",
			plan: `file "${input.issue.title}" in ${draft.team.name}`,
			run: async () => {
				const issue = await fileDraft(
					linearFor(ctx),
					ctx,
					draft,
					input.issue,
					`sentry-${data.id}`,
				);
				return {
					text: `Filed ${issue.identifier} in ${draft.team.name}`,
					url: issue.url,
					detail: { issue },
				};
			},
		},
		{
			id: "note",
			plan: `add a note on ${data.shortId} with the link`,
			run: async (landed) => {
				const link = landed.file?.url;
				if (!link)
					throw new CardUnavailable(
						"error",
						"The Linear issue has no link to note. Look in Linear",
					);
				await write(data, ctx.organizationId, "/comments/", "POST", {
					text: `${landed.file?.text} from Superset: ${link}`,
				});
				return { text: `Added a note on ${data.shortId}`, url: data.permalink };
			},
		},
	];
}

const TYPE = "sentry.issue";

/** A new or climbing error: settle it in Sentry, give it to someone, file it in Linear, or start an agent on it. */
export const sentryIssue = defineCard<Refs, IssueData>({
	type: TYPE,
	label: "Sentry issue",
	ask: "Handle issue",
	brand: "sentry",
	refs: z.object({
		issue: z.string().regex(/^\d{1,20}$/),
		...draftRefs,
		/** The Linear team to file in; without it the card offers no Linear issue. */
		team: draftRefs.team.optional(),
		done: doneRef,
	}),
	async resolve({ refs, ctx }) {
		const { token, orgSlug, regionUrl } = await sentryToken(ctx.organizationId);
		const [issue, listed] = await Promise.all([
			sentry(
				regionUrl,
				token,
				`/organizations/${orgSlug}/issues/${refs.issue}/`,
				issueSchema,
			),
			membersOf(regionUrl, token, orgSlug),
		]);
		const members = listed.flatMap((member): SentryPersonView[] =>
			member.user
				? [
						{
							id: member.user.id,
							name: member.user.name || member.name || member.email || "",
							email: member.user.email ?? member.email ?? null,
						},
					]
				: [],
		);
		const where =
			[issue.metadata?.filename, issue.metadata?.function]
				.filter(Boolean)
				.join(" · ") ||
			issue.culprit ||
			"";
		const message = issue.metadata?.value ?? "";
		const facts = [
			issue.title,
			issue.title.includes(message) ? "" : message,
			where ? `Where: ${where}` : "",
			`Events: ${issue.count}, users: ${issue.userCount}, first seen ${issue.firstSeen}, last seen ${issue.lastSeen}.`,
			issue.permalink,
		].filter(Boolean);
		const prompt = agentPrompt(
			[`Fix the Sentry issue ${issue.shortId} (${issue.permalink}).`],
			facts,
			FIX_MAX,
		);
		let linearUnavailable: string | null = null;
		const draft = refs.team
			? await loadDraft(
					linearFor(ctx),
					{ ...refs, team: refs.team },
					{
						title: `${issue.shortId}: ${issue.title}`.slice(0, 250),
						description: facts.join("\n\n").slice(0, FIX_MAX),
					},
				).catch((error) => {
					if (!(error instanceof CardUnavailable)) throw error;
					linearUnavailable = error.text;
					return null;
				})
			: null;
		const landed = landedOf(ctx, TYPE, refs.done);
		const status =
			issue.status === "resolved" || issue.status === "ignored"
				? issue.status
				: "unresolved";
		const assignee = issue.assignedTo
			? {
					id: issue.assignedTo.id,
					name: issue.assignedTo.name ?? issue.assignedTo.email ?? "",
					email: issue.assignedTo.email ?? null,
				}
			: null;
		const view: SentryIssueView = {
			kind: "sentry.issue",
			organization: orgSlug,
			issue: {
				id: issue.id,
				shortId: issue.shortId,
				title: issue.title,
				culprit: issue.culprit ?? null,
				level: issue.level ?? "error",
				status,
				events: issue.count,
				users: issue.userCount,
				firstSeen: issue.firstSeen,
				lastSeen: issue.lastSeen,
				url: issue.permalink,
				project: issue.project.name ?? issue.project.slug,
				assignee,
				error: {
					type: issue.metadata?.type ?? null,
					value: issue.metadata?.value ?? null,
					filename: issue.metadata?.filename ?? null,
					function: issue.metadata?.function ?? null,
				},
			},
			members,
			linear: draft?.view ?? null,
			linearUnavailable,
			filed: landed.file ?? null,
			noted: landed.note ?? null,
			plan: {
				file: `file "{title}" in ${draft?.team.name ?? ""}`,
				note: `add a note on ${issue.shortId} with the link`,
			},
			fix: { slug: issue.shortId, title: issue.title, prompt },
		};
		const fields: CardField[] = [
			{
				label: "Issue",
				value: issue.shortId,
				href: issue.permalink,
				mono: true,
			},
			{ label: "Project", value: view.issue.project },
			{ label: "Events", value: issue.count },
			{ label: "Users", value: String(issue.userCount) },
			{ label: "First seen", value: issue.firstSeen },
			{ label: "Last seen", value: issue.lastSeen },
			...(assignee ? [{ label: "Assigned to", value: assignee.name }] : []),
			...(issue.culprit
				? [{ label: "Where", value: issue.culprit, mono: true }]
				: []),
			...(view.filed
				? [
						{
							label: "Linear",
							value: view.filed.text,
							...(view.filed.url ? { href: view.filed.url } : {}),
						},
					]
				: []),
		];
		return {
			title: issue.title,
			subtitle: issue.shortId,
			status:
				status === "resolved"
					? { tone: "good", text: "Resolved" }
					: status === "ignored"
						? { tone: "neutral", text: "Archived" }
						: {
								tone:
									issue.level === "fatal" || issue.level === "error"
										? "bad"
										: "warn",
								text: "Unresolved",
							},
			fields,
			view,
			data: {
				id: issue.id,
				shortId: issue.shortId,
				status,
				regionUrl,
				orgSlug,
				permalink: issue.permalink,
				members,
				draft,
				landed,
				noRoom: noRoom(refs, 3),
			},
		};
	},
	actions: {
		resolve: {
			label: () => "Resolve",
			style: "primary",
			role: "primary",
			available: (data) =>
				data.status === "resolved" ? "Already resolved" : true,
			confirm: (data) => `Resolve ${data.shortId} in Sentry?`,
			async run({ data, ctx }) {
				await setIssue(data, ctx.organizationId, { status: "resolved" });
				return {
					outcome: { status: "resolved", landed: data.landed },
					notice: { tone: "good", text: `Resolved ${data.shortId}` },
				};
			},
		},
		ignore: {
			label: () => "Archive",
			style: "secondary",
			role: "other",
			available: (data) =>
				data.status === "ignored" ? "Already archived" : true,
			confirm: (data) =>
				`Archive ${data.shortId} in Sentry? It comes back if it escalates.`,
			async run({ data, ctx }) {
				await setIssue(data, ctx.organizationId, {
					status: "ignored",
					substatus: "archived_until_escalating",
				});
				return {
					outcome: { status: "ignored", landed: data.landed },
					notice: { tone: "neutral", text: `Archived ${data.shortId}` },
				};
			},
		},
		assign: {
			label: () => "Assign",
			style: "secondary",
			role: "other",
			terminal: false,
			run: withInput(
				z.object({
					assignee: z
						.string()
						.regex(/^\d{1,20}$/)
						.nullable(),
				}),
				async ({ data, ctx, input }) => {
					const person = data.members.find(
						(member) => member.id === input.assignee,
					);
					if (input.assignee && !person)
						throw new CardUnavailable(
							"error",
							"That person is not a member of this Sentry organization",
						);
					await setIssue(data, ctx.organizationId, {
						assignedTo: person ? `user:${person.id}` : "",
					});
					const text = person
						? `Assigned ${data.shortId} to ${person.name}`
						: `Unassigned ${data.shortId}`;
					return {
						outcome: { assignee: person?.id ?? null },
						refs: data.noRoom
							? undefined
							: {
									done: sealLanded(ctx, TYPE, {
										...data.landed,
										assign: { text, url: null },
									}),
								},
						notice: { tone: "good", text },
					};
				},
			),
		},
		file_linear: {
			label: (data) =>
				data.landed.file && !data.landed.note
					? "Add the note"
					: "File in Linear",
			style: "secondary",
			role: "other",
			terminal: false,
			applies: (data) => data.draft !== null,
			available: (data) =>
				data.landed.file && data.landed.note
					? "This is filed in Linear already"
					: (data.noRoom ?? true),
			confirmFor: (data, raw, ctx) => {
				const input = fileInput.safeParse(raw);
				return input.success && data.draft
					? planSentence(
							fileSteps(data, data.draft, input.data, ctx),
							data.landed,
						)
					: "";
			},
			run: withInput(fileInput, async ({ data, ctx, input }) => {
				const { draft } = data;
				if (!draft || input.issue.team !== draft.team.id)
					throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
				const { landed, ...ran } = await runSteps(
					ctx,
					TYPE,
					fileSteps(data, draft, input, ctx),
					data.landed,
				);
				return {
					...ran,
					terminal: false,
					refs: { done: sealLanded(ctx, TYPE, landed) },
				};
			}),
		},
		started: {
			label: () => "Start an agent to fix it",
			style: "secondary",
			role: "other",
			run: withInput(startedInput, async ({ data, ctx, input }) => {
				const started = await startedAgent(ctx, input.workspace);
				return {
					outcome: { started, landed: data.landed },
					notice: { tone: "good", text: startedNotice(started, data.shortId) },
				};
			}),
		},
		dismiss: {
			label: (data) => (Object.keys(data.landed).length ? "Done" : "Leave it"),
			style: "secondary",
			role: "dismiss",
			async run({ data }) {
				return { outcome: { status: data.status, landed: data.landed } };
			},
		},
	},
});
