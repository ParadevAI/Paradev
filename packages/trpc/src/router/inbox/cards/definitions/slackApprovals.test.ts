import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { CardContext, ResolvedCard } from "../types";

type Row = Record<string, unknown>;
let run = 0;
let calls: { method: string; token: string; params: Row }[] = [];
let answers: Record<string, (params: Row) => Row> = {};
let canvasHtml = "";

const WRITES = new Set([
	"chat.postMessage",
	"chat.scheduleMessage",
	"conversations.open",
	"conversations.invite",
	"conversations.create",
	"conversations.inviteShared",
	"reminders.add",
	"users.profile.set",
	"dnd.setSnooze",
	"dnd.endSnooze",
	"canvases.edit",
]);

const user = (id: string, name: string, over: Row = {}) => ({
	id,
	name: name.toLowerCase().replace(/ /g, "."),
	real_name: name,
	tz: "America/Los_Angeles",
	profile: { display_name: name, real_name: name },
	...over,
});

const USERS = [
	user("U0READER1", "Satya Patel", { is_owner: true }),
	user("U0AVERY01", "Avery Chen"),
	user("U0BLAKE01", "Blake Rivera"),
	user("U0GUEST01", "Casey Lin", { is_restricted: true }),
	user("U0ROBOT01", "Deploy Bot", { is_bot: true }),
];

const channel = (id: string, name: string, over: Row = {}) => ({
	id,
	name,
	is_private: false,
	is_member: true,
	num_members: 4,
	creator: "U0AVERY01",
	created: 1_700_000_000,
	...over,
});

const realFetch = globalThis.fetch;
globalThis.fetch = (async (
	input: string | URL | Request,
	init?: RequestInit,
) => {
	const url = new URL(String(input));
	if (url.hostname === "files.slack.com")
		return new Response(canvasHtml, { status: 200 });
	const method = url.pathname.replace("/api/", "");
	const params: Row = init?.body
		? JSON.parse(String(init.body))
		: Object.fromEntries(url.searchParams);
	const token = String(
		(init?.headers as Record<string, string>).authorization,
	).replace("Bearer ", "");
	if (WRITES.has(method))
		calls.push({ method, token: token.slice(0, 4), params });
	const answer = answers[method];
	return Response.json(
		answer
			? { ok: true, ...answer(params) }
			: { ok: false, error: "unknown_method" },
	);
}) as typeof fetch;
afterAll(() => {
	globalThis.fetch = realFetch;
});

const lookup = await import("../../../../lib/connectors/lookup");
mock.module("../../../../lib/connectors/lookup", () => ({
	...lookup,
	userConnection: async () => ({ config: { slack_user_id: "sealed" } }),
}));
const refresh = await import("../../../../lib/connectors/refresh");
mock.module("../../../../lib/connectors/refresh", () => ({
	...refresh,
	connectionAccessToken: async () => `xoxp-${run}`,
}));
const crypto = await import("../../../plugins/crypto");
mock.module("../../../plugins/crypto", () => ({
	...crypto,
	decryptSecret: async () => "U0READER1",
}));
mock.module("./slackBots", () => ({
	slackBots: async () => new Map([["T0TEAM001", `xoxb-${run}`]]),
}));

const { asShown } = await import("../testing");
const { slackPost } = await import("./slackPost");
const { slackChannel } = await import("./slackChannel");
const { slackReminder } = await import("./slackReminder");
const slackStatus = asShown((await import("./slackStatus")).slackStatus);
const { slackCanvas } = await import("./slackCanvas");
const { slackRequest } = await import("./slackRequest");

const ctx: CardContext = { readerId: "reader", organizationId: "org" };
type View<K extends string> = Extract<
	NonNullable<ResolvedCard["view"]>,
	{ kind: K }
>;
const soon = (minutes: number) =>
	new Date(Date.now() + minutes * 60_000).toISOString();
const writes = () => calls.map((call) => call.method);

beforeEach(() => {
	run += 1;
	calls = [];
	canvasHtml = `<div class="quip-canvas-content"><h1 id="t">Launch plan</h1><p id="p1" class="line">Owner: Satya</p><p id="p2" class="line">Owner of the budget: Avery</p></div>`;
	answers = {
		"auth.test": () => ({
			user_id: "U0READER1",
			team_id: "T0TEAM001",
			team: "Superset",
			url: "https://superset.slack.com/",
		}),
		"users.list": () => ({ members: USERS }),
		"users.info": (params) => ({
			user: USERS.find((each) => each.id === params.user) ?? USERS[0],
		}),
		"conversations.list": () => ({
			channels: [{ id: "C0LAUNCH01", name: "launch" }],
		}),
		"usergroups.list": () => ({ usergroups: [] }),
		"emoji.list": () => ({ emoji: {} }),
		"users.conversations": () => ({
			channels: [
				channel("C0LAUNCH01", "launch"),
				channel("C0CUSTOM01", "ext-acme", { is_ext_shared: true }),
			],
		}),
		"conversations.info": (params) => ({
			channel:
				params.channel === "C0CUSTOM01"
					? channel("C0CUSTOM01", "ext-acme", { is_ext_shared: true })
					: params.channel === "G0SECRET01"
						? channel("G0SECRET01", "leads", { is_private: true })
						: channel("C0LAUNCH01", "launch"),
		}),
		"conversations.members": () => ({
			members: ["U0READER1", "U0AVERY01", "U0BLAKE01", "U0ROBOT01"],
		}),
		"conversations.open": () => ({ channel: { id: "D0DIRECT01" } }),
		"chat.postMessage": () => ({ ts: "1700000000.000100" }),
		"chat.scheduleMessage": () => ({ scheduled_message_id: "Q0SCHED001" }),
		"conversations.invite": () => ({}),
		"conversations.create": () => ({ channel: { id: "C0NEWCHAN1" } }),
		"conversations.inviteShared": () => ({}),
		"reminders.add": () => ({ reminder: { id: "Rm0REMIND1" } }),
		"users.profile.get": () => ({
			profile: { status_text: "", status_emoji: "", status_expiration: 0 },
		}),
		"users.profile.set": () => ({}),
		"dnd.info": () => ({ snooze_enabled: false, dnd_enabled: false }),
		"dnd.setSnooze": () => ({}),
		"dnd.endSnooze": () => ({}),
		"files.info": () => ({
			file: {
				id: "F0CANVAS01",
				title: "Launch plan",
				filetype: "quip",
				url_private: "https://files.slack.com/files-pri/T-F/canvas",
				permalink: "https://superset.slack.com/docs/T/F0CANVAS01",
				edit_timestamp: 1_700_000_500,
				editable: true,
			},
		}),
		"canvases.edit": () => ({}),
		"conversations.history": () => ({
			messages: [
				{
					ts: "1700000000.000200",
					user: "U0AVERY01",
					text: "Can I get into #leads for the Acme deal?",
				},
			],
		}),
	};
});

describe("slack.message", () => {
	const refs = {
		to: "C0LAUNCH01",
		draft: "Launch is on. <!channel> read the plan.",
	};

	test("shows where the message goes and how many people @channel reaches: the channel's people, without the reader and without apps", async () => {
		const card = await slackPost.resolve(refs, ctx);
		const view = card.view as View<"slack.message">;
		expect(view.target).toEqual({
			id: "C0LAUNCH01",
			kind: "channel",
			name: "launch",
			members: 4,
			external: false,
		});
		expect(view.notifies).toBe(2);
		expect(
			view.destinations.map(
				(each) => `${each.name}${each.external ? " (external)" : ""}`,
			),
		).toEqual(["ext-acme (external)", "launch"]);
		expect(view.draft).toBe(refs.draft);
	});

	test("an announcement goes out only with the count the reader was shown", async () => {
		await expect(
			slackPost.act(refs, "send", ctx, {
				to: refs.to,
				text: refs.draft,
			}),
		).rejects.toThrow("This notifies 2 people in #launch");
		await expect(
			slackPost.act(refs, "send", ctx, {
				to: refs.to,
				text: refs.draft,
				notifies: 9,
			}),
		).rejects.toThrow("This notifies 2 people in #launch");
		expect(writes()).toEqual([]);
		const { result } = await slackPost.act(refs, "send", ctx, {
			to: refs.to,
			text: refs.draft,
			notifies: 2,
		});
		expect(calls).toEqual([
			{
				method: "chat.postMessage",
				token: "xoxp",
				params: { channel: "C0LAUNCH01", text: refs.draft },
			},
		]);
		expect(result.notice?.text).toBe("Sent to #launch");
	});

	test("a rich-text broadcast counts as an announcement too", async () => {
		const blocks = [
			{
				type: "rich_text" as const,
				elements: [
					{
						type: "rich_text_section",
						elements: [{ type: "broadcast", range: "here" }],
					},
				],
			},
		];
		await expect(
			slackPost.act(refs, "send", ctx, {
				to: refs.to,
				text: "@here hello",
				blocks,
			}),
		).rejects.toThrow("This notifies 2 people");
	});

	test("every spelling of a broadcast counts, and a user group is counted by its own size", async () => {
		const { mentionsEveryone, groupsMentioned } = await import("./slackPost");
		expect(mentionsEveryone({ text: "<!here|here> hi" })).toBe(true);
		expect(mentionsEveryone({ text: "<!everyone|@everyone>" })).toBe(true);
		expect(mentionsEveryone({ text: 'he said "type":"broadcast"' })).toBe(
			false,
		);
		expect(mentionsEveryone({ text: "@channel as plain words" })).toBe(false);
		expect(
			groupsMentioned({ text: "<!subteam^S0ONCALL1|@oncall> look" }),
		).toEqual(["S0ONCALL1"]);
		answers["usergroups.list"] = () => ({
			usergroups: [{ id: "S0ONCALL1", handle: "oncall", user_count: 7 }],
		});
		const text = "<!subteam^S0ONCALL1> look";
		const view = (await slackPost.resolve(refs, ctx))
			.view as View<"slack.message">;
		expect(view.groupSizes).toEqual({ S0ONCALL1: 7 });
		await expect(
			slackPost.act(refs, "send", ctx, { to: refs.to, text }),
		).rejects.toThrow("This notifies 7 people in the groups it mentions");
		await slackPost.act(refs, "send", ctx, {
			to: refs.to,
			text,
			groupNotifies: 7,
		});
		expect(writes()).toEqual(["chat.postMessage"]);
	});

	test("a message goes only where the reader saw it going", async () => {
		await expect(
			slackPost.act(refs, "send", ctx, { to: "C0CUSTOM01", text: "Hi" }),
		).rejects.toThrow("This changed since you looked");
		expect(writes()).toEqual([]);
	});

	test("a direct message to someone in another organization is marked as shared", async () => {
		answers["users.info"] = (params) => ({
			user:
				params.user === "U0OUTSIDE1"
					? user("U0OUTSIDE1", "Pat Outside", { team_id: "T0OTHER001" })
					: USERS[0],
		});
		answers["team.info"] = () => ({ team: { name: "Acme" } });
		const card = await slackPost.resolve({ to: "U0OUTSIDE1" }, ctx);
		const view = card.view as View<"slack.message">;
		expect(view.target?.external).toBe(true);
		expect(view.recipients[0]?.team?.name).toBe("Acme");
		expect(card.fields.map((field) => field.label)).toContain("Shared");
	});

	test("a proposed time that has passed is said to be stale, not sent now in silence", async () => {
		const view = (await slackPost.resolve({ ...refs, post_at: soon(-30) }, ctx))
			.view as View<"slack.message">;
		expect(view.postAt).toBeNull();
		expect(view.stale).toBe(true);
	});

	test("a plain message needs no count and posts as the reader", async () => {
		await slackPost.act(refs, "send", ctx, {
			to: refs.to,
			text: "Launch is on.",
		});
		expect(calls[0]?.token).toBe("xoxp");
		expect(calls[0]?.params).toEqual({
			channel: "C0LAUNCH01",
			text: "Launch is on.",
		});
	});

	test("a scheduled message is scheduled, not posted, and only for a time ahead", async () => {
		const at = soon(90);
		const { result } = await slackPost.act(refs, "send", ctx, {
			to: refs.to,
			text: "Later.",
			postAt: at,
		});
		expect(calls).toEqual([
			{
				method: "chat.scheduleMessage",
				token: "xoxp",
				params: {
					channel: "C0LAUNCH01",
					text: "Later.",
					post_at: Math.floor(Date.parse(at) / 1000),
				},
			},
		]);
		expect(result.notice?.text).toStartWith("Scheduled for #launch on ");
		await expect(
			slackPost.act(refs, "send", ctx, {
				to: refs.to,
				text: "Later.",
				postAt: soon(-5),
			}),
		).rejects.toThrow("That time has passed");
		await expect(
			slackPost.act(refs, "send", ctx, {
				to: refs.to,
				text: "Later.",
				postAt: soon(60 * 24 * 130),
			}),
		).rejects.toThrow("120 days");
	});

	test("a direct message opens the conversation with exactly the people shown", async () => {
		const dm = { to: "U0AVERY01,U0BLAKE01", draft: "Hi both" };
		const view = (await slackPost.resolve(dm, ctx))
			.view as View<"slack.message">;
		expect(view.target).toMatchObject({
			kind: "group",
			name: "Avery Chen, Blake Rivera",
		});
		expect(view.notifies).toBeNull();
		await slackPost.act(dm, "send", ctx, {
			to: dm.to,
			text: "Hi both",
		});
		expect(calls).toEqual([
			{
				method: "conversations.open",
				token: "xoxp",
				params: { users: "U0AVERY01,U0BLAKE01" },
			},
			{
				method: "chat.postMessage",
				token: "xoxp",
				params: { channel: "D0DIRECT01", text: "Hi both" },
			},
		]);
	});

	test("changing where it goes rewrites the card, so the next read shows the new place", async () => {
		const { result } = await slackPost.act(refs, "retarget", ctx, {
			to: "C0CUSTOM01",
		});
		expect(result.refs).toEqual({ to: "C0CUSTOM01" });
		expect(result.terminal).toBe(false);
		const view = (await slackPost.resolve({ ...refs, to: "C0CUSTOM01" }, ctx))
			.view as View<"slack.message">;
		expect(view.target?.external).toBe(true);
		expect(writes()).toEqual([]);
	});

	test("a channel the reader is not in cannot be posted to", async () => {
		answers["conversations.info"] = () => ({
			channel: channel("C0LAUNCH01", "launch", { is_member: false }),
		});
		const card = await slackPost.resolve(refs, ctx);
		expect(card.actions[0]?.disabled).toBe(
			"Join #launch in Slack to post there",
		);
	});
});

describe("slack.channel", () => {
	test("adding people shows who is in already and who is a guest, and adds only the rest", async () => {
		const refs = {
			action: "invite" as const,
			channel: "G0SECRET01",
			users: "U0AVERY01,U0GUEST01",
		};
		const view = (await slackChannel.resolve(refs, ctx))
			.view as View<"slack.channel">;
		expect(view.channel).toMatchObject({ kind: "private", name: "leads" });
		expect(
			view.invitees.map((each) => [
				each.person.name,
				each.guest,
				each.alreadyMember,
			]),
		).toEqual([
			["Avery Chen", false, true],
			["Casey Lin", true, false],
		]);
		const { result } = await slackChannel.act(refs, "invite", ctx, {
			channel: refs.channel,
			users: ["U0AVERY01", "U0GUEST01"],
		});
		expect(calls).toEqual([
			{
				method: "conversations.invite",
				token: "xoxp",
				params: { channel: "G0SECRET01", users: "U0GUEST01" },
			},
		]);
		expect(result.notice?.text).toBe("Added 1 person to #leads");
	});

	test("a channel is made with Slack's naming rule, then its people are added", async () => {
		const refs = {
			action: "create" as const,
			name: "launch-acme",
			private: true,
			users: "U0AVERY01",
		};
		answers["conversations.members"] = () => ({ members: [] });
		await expect(
			slackChannel.act(refs, "create", ctx, {
				name: "Launch Acme!",
				private: true,
				users: [],
			}),
		).rejects.toThrow("Channel names can’t contain spaces or punctuation");
		const { result } = await slackChannel.act(refs, "create", ctx, {
			name: "launch-acme",
			private: true,
			users: ["U0AVERY01"],
		});
		expect(calls).toEqual([
			{
				method: "conversations.create",
				token: "xoxp",
				params: { name: "launch-acme", is_private: true },
			},
			{
				method: "conversations.invite",
				token: "xoxp",
				params: { channel: "C0NEWCHAN1", users: "U0AVERY01" },
			},
		]);
		expect(result.notice?.text).toBe("Created #launch-acme and added 1 person");
	});

	test("a second try after the channel was made adds the people instead of failing on the name", async () => {
		const refs = { action: "create" as const, name: "launch-acme" };
		answers["conversations.create"] = () => ({
			ok: false,
			error: "name_taken",
		});
		answers["users.conversations"] = () => ({
			channels: [
				channel("C0MINE0001", "launch-acme", {
					creator: "U0READER1",
					created: Math.floor(Date.now() / 1000) - 60,
				}),
			],
		});
		answers["conversations.members"] = () => ({ members: [] });
		const { result } = await slackChannel.act(refs, "create", ctx, {
			name: "launch-acme",
			private: false,
			users: ["U0BLAKE01"],
		});
		expect(calls.at(-1)).toEqual({
			method: "conversations.invite",
			token: "xoxp",
			params: { channel: "C0MINE0001", users: "U0BLAKE01" },
		});
		expect(result.outcome).toMatchObject({ created: "C0MINE0001" });
		answers["users.conversations"] = () => ({
			channels: [channel("C0OTHER001", "launch-acme")],
		});
		run += 1;
		await expect(
			slackChannel.act(refs, "create", ctx, {
				name: "launch-acme",
				private: false,
				users: [],
			}),
		).rejects.toThrow("A channel with that name exists already");
	});

	test("people who were not added after the channel was made are named as not added", async () => {
		const refs = { action: "create" as const, name: "launch-acme" };
		answers["conversations.members"] = () => ({ members: [] });
		answers["conversations.invite"] = () => ({
			ok: false,
			error: "ratelimited",
		});
		const { result } = await slackChannel.act(refs, "create", ctx, {
			name: "launch-acme",
			private: false,
			users: ["U0BLAKE01"],
		});
		expect(result.terminal).toBe(false);
		expect(result.notice).toEqual({
			tone: "warn",
			text: "Created #launch-acme. People were not added: Slack is limiting requests. Try again in a minute",
		});
		expect(result.outcome).toEqual({
			created: "C0NEWCHAN1",
			name: "launch-acme",
			invited: [],
		});
		expect(result.refs).toEqual({
			action: "invite",
			channel: "C0NEWCHAN1",
			users: "U0BLAKE01",
			created: true,
		});
		const finishing = {
			action: "invite" as const,
			channel: "C0LAUNCH01",
			users: "U0BLAKE01",
			created: true,
		};
		const closed = await slackChannel.act(finishing, "dismiss", ctx, undefined);
		expect(closed.result.outcome).toEqual({
			changed: true,
			created: "C0LAUNCH01",
		});
	});

	test("a channel of the same name but the other visibility is not taken for the one this card made", async () => {
		const refs = { action: "create" as const, name: "launch-acme" };
		answers["conversations.create"] = () => ({
			ok: false,
			error: "name_taken",
		});
		answers["users.conversations"] = () => ({
			channels: [
				channel("C0MINE0001", "launch-acme", {
					creator: "U0READER1",
					is_private: true,
					created: Math.floor(Date.now() / 1000) - 60,
				}),
			],
		});
		await expect(
			slackChannel.act(refs, "create", ctx, {
				name: "launch-acme",
				private: false,
				users: [],
			}),
		).rejects.toThrow("A channel with that name exists already");
	});

	test("a second address that fails leaves the first on record and only the rest to send", async () => {
		const refs = {
			action: "connect" as const,
			channel: "C0LAUNCH01",
			emails: "pat@acme.com,lee@acme.com",
		};
		answers["conversations.inviteShared"] = (params) =>
			params.emails === "lee@acme.com"
				? { ok: false, error: "invalid_email" }
				: {};
		const { result } = await slackChannel.act(refs, "connect", ctx, {
			channel: "C0LAUNCH01",
			emails: ["pat@acme.com", "lee@acme.com"],
		});
		expect(result.terminal).toBe(false);
		expect(result.refs).toEqual({
			emails: "lee@acme.com",
			invited: "pat@acme.com",
		});
		expect(result.notice?.text).toBe(
			"Invited pat@acme.com. lee@acme.com was not invited: Slack did not accept that email address",
		);
		answers["conversations.inviteShared"] = () => ({});
		const next = { ...refs, emails: "lee@acme.com", invited: "pat@acme.com" };
		const done = await slackChannel.act(next, "connect", ctx, {
			channel: "C0LAUNCH01",
			emails: ["lee@acme.com"],
		});
		expect(done.result.outcome).toEqual({
			connectInvited: ["pat@acme.com", "lee@acme.com"],
			channel: "C0LAUNCH01",
		});
	});

	test("a reader who is not a Slack owner or admin cannot send invitations outside", async () => {
		answers["users.list"] = () => ({
			members: [user("U0READER1", "Satya Patel"), ...USERS.slice(1)],
		});
		const card = await slackChannel.resolve(
			{ action: "connect", channel: "C0LAUNCH01", emails: "pat@acme.com" },
			ctx,
		);
		expect(card.actions[0]?.disabled).toBe(
			"Only a Slack owner or admin can invite people from outside through this card",
		);
	});

	test("a Slack Connect invitation goes from the app, one address at a time, and only from a channel the app is in", async () => {
		const refs = {
			action: "connect" as const,
			channel: "C0LAUNCH01",
			emails: "pat@acme.com, not-an-address",
		};
		const card = await slackChannel.resolve(refs, ctx);
		const view = card.view as View<"slack.channel">;
		expect(view.emails).toEqual(["pat@acme.com"]);
		expect(view.appInChannel).toBe(true);
		await slackChannel.act(refs, "connect", ctx, {
			channel: refs.channel,
			emails: ["pat@acme.com"],
		});
		expect(calls).toEqual([
			{
				method: "conversations.inviteShared",
				token: "xoxb",
				params: {
					channel: "C0LAUNCH01",
					emails: "pat@acme.com",
					external_limited: true,
				},
			},
		]);
		answers["conversations.info"] = (params) => ({
			channel: channel(String(params.channel), "launch", { is_member: false }),
		});
		run += 1;
		const off = await slackChannel.resolve(refs, ctx);
		expect(off.actions[0]?.disabled).toBe("Join #launch in Slack first");
	});
});

describe("slack.reminder", () => {
	test("sets the reminder for the reader at the time they chose", async () => {
		const at = soon(120);
		const refs = { text: "Send the invoice", time: at };
		const { result } = await slackReminder.act(refs, "remind", ctx, {
			text: "Send the invoice",
			time: at,
		});
		expect(calls).toEqual([
			{
				method: "reminders.add",
				token: "xoxp",
				params: {
					text: "Send the invoice",
					time: Math.floor(Date.parse(at) / 1000),
				},
			},
		]);
		expect(result.notice?.text).toStartWith("Slack reminds you on ");
		await expect(
			slackReminder.act(refs, "remind", ctx, { text: "x", time: soon(-1) }),
		).rejects.toThrow("That time has passed");
	});
});

describe("slack.status", () => {
	const refs = {
		mode: "status" as const,
		text: "Heads down",
		emoji: ":headphones:",
		pause: true,
	};

	test("sets the status until the chosen time and pauses notifications for the same span", async () => {
		const until = soon(90);
		await slackStatus.act(refs, "set_status", ctx, {
			text: "Heads down",
			emoji: ":headphones:",
			until,
			pause: true,
		});
		expect(calls[0]).toEqual({
			method: "users.profile.set",
			token: "xoxp",
			params: {
				profile: {
					status_text: "Heads down",
					status_emoji: ":headphones:",
					status_expiration: Math.floor(Date.parse(until) / 1000),
				},
			},
		});
		expect(calls[1]?.method).toBe("dnd.setSnooze");
		expect(Number(calls[1]?.params.num_minutes)).toBeGreaterThanOrEqual(89);
		expect(Number(calls[1]?.params.num_minutes)).toBeLessThanOrEqual(90);
	});

	test("a status with no end cannot pause notifications, and an empty status is not set", async () => {
		await expect(
			slackStatus.act(refs, "set_status", ctx, {
				text: "Heads down",
				emoji: "",
				until: null,
				pause: true,
			}),
		).rejects.toThrow("Pick when the status ends");
		await expect(
			slackStatus.act(refs, "set_status", ctx, {
				text: " ",
				emoji: "",
				until: null,
			}),
		).rejects.toThrow("A status needs words or an emoji");
		expect(writes()).toEqual([]);
	});

	test("shows the status and the pause the reader has now, a quiet-hours schedule included", async () => {
		const now = Math.floor(Date.now() / 1000);
		answers["users.info"] = () => ({
			user: {
				...USERS[0],
				profile: {
					status_text: "Lunch",
					status_emoji: ":bento:",
					status_expiration: now + 600,
				},
			},
		});
		answers["dnd.info"] = () => ({
			snooze_enabled: false,
			dnd_enabled: true,
			next_dnd_start_ts: now - 100,
			next_dnd_end_ts: now + 3600,
		});
		const card = await slackStatus.resolve(refs, ctx);
		const view = card.view as View<"slack.status">;
		expect(view.current).toEqual({
			text: "Lunch",
			emoji: ":bento:",
			until: new Date((now + 600) * 1000).toISOString(),
			pausedUntil: new Date((now + 3600) * 1000).toISOString(),
		});
		expect(card.actions.map((action) => action.id)).toEqual([
			"set_status",
			"dismiss",
		]);
	});

	test("pause and resume are the reader's own notifications only", async () => {
		const pause = { mode: "pause" as const };
		const until = soon(30);
		await slackStatus.act(pause, "pause", ctx, { until });
		expect(calls[0]?.method).toBe("dnd.setSnooze");
		answers["dnd.info"] = () => ({
			snooze_enabled: true,
			snooze_endtime: Math.floor(Date.now() / 1000) + 900,
		});
		const card = await slackStatus.resolve(pause, ctx);
		expect(card.actions.map((action) => action.id)).toEqual([
			"pause",
			"resume",
			"dismiss",
		]);
		await slackStatus.act(pause, "resume", ctx, undefined);
		expect(calls.at(-1)?.method).toBe("dnd.endSnooze");
	});
});

describe("slack.canvas", () => {
	const refs = {
		canvas: "F0CANVAS01",
		change: "replace" as const,
		find: "Owner: Satya",
		markdown: "Owner: Satya and Avery",
	};

	test("shows the part it changes beside the new text, and changes that section by Slack's id", async () => {
		const view = (await slackCanvas.resolve(refs, ctx))
			.view as View<"slack.canvas">;
		expect(view.before).toBe("Owner: Satya");
		expect(view.after).toBe("Owner: Satya and Avery");
		expect(view.version).toBe(1_700_000_500);
		await slackCanvas.act(refs, "apply", ctx, {
			markdown: "Owner: Satya and Avery",
			section: view.section,
			before: view.before,
			version: view.version,
		});
		expect(calls).toEqual([
			{
				method: "canvases.edit",
				token: "xoxp",
				params: {
					canvas_id: "F0CANVAS01",
					changes: [
						{
							operation: "replace",
							section_id: "p1",
							document_content: {
								type: "markdown",
								markdown: "Owner: Satya and Avery",
							},
						},
					],
				},
			},
		]);
	});

	test("a canvas edited since the reader looked is not written over", async () => {
		await expect(
			slackCanvas.act(refs, "apply", ctx, {
				markdown: "x",
				section: "p1",
				before: "Owner: Blake",
				version: 1_700_000_500,
			}),
		).rejects.toThrow("This canvas was edited since you looked");
		await expect(
			slackCanvas.act(
				{ canvas: "F0CANVAS01", change: "append", markdown: "## Next" },
				"apply",
				ctx,
				{ markdown: "## Next", section: null, before: null, version: 1 },
			),
		).rejects.toThrow("This canvas was edited since you looked");
		expect(writes()).toEqual([]);
	});

	test("words that are in two parts of the canvas name no part, and a part with a mention is not replaced", async () => {
		const twice = await slackCanvas.resolve({ ...refs, find: "Owner" }, ctx);
		expect(twice.state).toBe("error");
		expect(twice.notice?.text).toBe(
			"These words are in 2 parts of the canvas; the change must name one",
		);
		canvasHtml = `<div class="quip-canvas-content"><h1 id="t">Launch plan</h1><p id="p1" class="line">Owner: <control data-user="U1">@Satya</control></p></div>`;
		const card = await slackCanvas.resolve({ ...refs, find: "Owner:" }, ctx);
		expect((card.view as View<"slack.canvas">).lossy).toBe(true);
		expect(card.actions[0]?.disabled).toBe(
			"This part has a mention, file or embed this card cannot show. Change it in Slack",
		);
	});

	test("an append needs no section; a removal sends no text; a missing part is gone", async () => {
		await slackCanvas.act(
			{ canvas: "F0CANVAS01", change: "append", markdown: "## Next" },
			"apply",
			ctx,
			{
				markdown: "## Next",
				section: null,
				before: null,
				version: 1_700_000_500,
			},
		);
		expect(calls[0]?.params.changes).toEqual([
			{
				operation: "insert_at_end",
				document_content: { type: "markdown", markdown: "## Next" },
			},
		]);
		await slackCanvas.act(
			{ canvas: "F0CANVAS01", change: "delete", find: "budget" },
			"apply",
			ctx,
			{
				section: "p2",
				before: "Owner of the budget: Avery",
				version: 1_700_000_500,
			},
		);
		expect(calls[1]?.params.changes).toEqual([
			{ operation: "delete", section_id: "p2" },
		]);
		const gone = await slackCanvas.resolve(
			{ ...refs, find: "No such line" },
			ctx,
		);
		expect(gone.state).toBe("gone");
	});
});

describe("slack.request", () => {
	const refs = {
		channel: "C0LAUNCH01",
		ts: "1700000000.000200",
		grant_channel: "G0SECRET01",
		grant_user: "U0BLAKE01",
		approve_reply: "Added you.",
	};

	test("approving adds the person the card named to the channel it named, then replies in the thread", async () => {
		answers["conversations.members"] = () => ({ members: ["U0READER1"] });
		const view = (await slackRequest.resolve(refs, ctx))
			.view as View<"slack.request">;
		expect(view.grant).toMatchObject({
			person: { name: "Blake Rivera" },
			channel: { name: "leads", kind: "private" },
			alreadyMember: false,
		});
		await expect(
			slackRequest.act(refs, "approve", ctx, {
				reply: { text: "Added you." },
				grant: { user: "U0AVERY01", channel: "G0SECRET01" },
			}),
		).rejects.toThrow("This changed since you looked");
		const { result } = await slackRequest.act(refs, "approve", ctx, {
			reply: { text: "Added you." },
			grant: { user: "U0BLAKE01", channel: "G0SECRET01" },
		});
		expect(calls).toEqual([
			{
				method: "conversations.invite",
				token: "xoxp",
				params: { channel: "G0SECRET01", users: "U0BLAKE01" },
			},
			{
				method: "chat.postMessage",
				token: "xoxp",
				params: {
					channel: "C0LAUNCH01",
					thread_ts: "1700000000.000200",
					text: "Added you.",
				},
			},
		]);
		expect(result.notice?.text).toBe(
			"Added Blake Rivera to #leads, and replied to Avery Chen",
		);
	});

	test("a denial is a reply and nothing else, and needs words", async () => {
		await slackRequest.act(refs, "deny", ctx, {
			reply: { text: "Not this quarter." },
		});
		expect(writes()).toEqual(["chat.postMessage"]);
		await expect(slackRequest.act(refs, "deny", ctx, {})).rejects.toThrow();
	});

	test("a request that is a reply inside a thread is found, and answered in that thread", async () => {
		answers["conversations.history"] = () => ({
			messages: [
				{ ts: "1700000000.000100", user: "U0AVERY01", text: "Parent" },
			],
		});
		answers["conversations.replies"] = () => ({
			messages: [
				{
					ts: "1700000000.000200",
					thread_ts: "1700000000.000100",
					user: "U0BLAKE01",
					text: "Can I join #leads?",
				},
			],
		});
		const plain = { channel: "C0LAUNCH01", ts: "1700000000.000200" };
		await slackRequest.act(plain, "deny", ctx, { reply: { text: "No." } });
		expect(calls[0]?.params).toEqual({
			channel: "C0LAUNCH01",
			thread_ts: "1700000000.000100",
			text: "No.",
		});
	});

	test("an approval with nothing to grant needs words, and a link button is not a control of its own", async () => {
		const plain = { channel: "C0LAUNCH01", ts: "1700000000.000200" };
		await expect(
			slackRequest.act(plain, "approve", ctx, { grant: null }),
		).rejects.toThrow("An approval needs a reply");
		answers["conversations.history"] = () => ({
			messages: [
				{
					ts: "1700000000.000200",
					user: "U0AVERY01",
					text: "See the doc",
					blocks: [
						{
							type: "actions",
							elements: [
								{
									type: "button",
									url: "https://example.com",
									text: { type: "plain_text", text: "Open" },
								},
							],
						},
					],
				},
			],
		});
		const linked = await slackRequest.resolve(plain, ctx);
		expect((linked.view as View<"slack.request">).ownButtons).toBe(false);
		answers["conversations.history"] = () => ({
			messages: [
				{
					ts: "1700000000.000200",
					bot_id: "B0WORKFLOW",
					text: "Pick one",
					blocks: [
						{
							type: "section",
							text: { type: "mrkdwn", text: "Pick" },
							accessory: { type: "static_select", options: [] },
						},
					],
				},
			],
		});
		const select = await slackRequest.resolve(plain, ctx);
		expect((select.view as View<"slack.request">).ownButtons).toBe(true);
	});

	test("a request with its own buttons and nothing the card can grant is answered in Slack", async () => {
		answers["conversations.history"] = () => ({
			messages: [
				{
					ts: "1700000000.000200",
					bot_id: "B0WORKFLOW",
					text: "Approve the expense?",
					blocks: [
						{
							type: "actions",
							elements: [
								{
									type: "button",
									text: { type: "plain_text", text: "Approve" },
								},
							],
						},
					],
				},
			],
		});
		const card = await slackRequest.resolve(
			{ channel: "C0LAUNCH01", ts: "1700000000.000200" },
			ctx,
		);
		expect((card.view as View<"slack.request">).ownButtons).toBe(true);
		expect(card.actions.slice(0, 2).map((action) => action.disabled)).toEqual([
			"Only Slack can press this request's own buttons. Open it in Slack",
			"Only Slack can press this request's own buttons. Open it in Slack",
		]);
	});
});

describe("when Slack is not connected for the reader", () => {
	test("every card asks for the reader's own Slack account", async () => {
		mock.module("../../../../lib/connectors/lookup", () => ({
			...lookup,
			userConnection: async () => null,
		}));
		const card = await slackReminder.resolve({ text: "x" }, ctx);
		expect(card.state).toBe("no_connector");
		expect(card.notice?.text).toBe(
			"Connect your Slack account to do this as you",
		);
		mock.module("../../../../lib/connectors/lookup", () => ({
			...lookup,
			userConnection: async () => ({ config: { slack_user_id: "sealed" } }),
		}));
	});
});
