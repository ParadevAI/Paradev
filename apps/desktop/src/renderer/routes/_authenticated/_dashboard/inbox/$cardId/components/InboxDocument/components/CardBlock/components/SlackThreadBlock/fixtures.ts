import type { SlackMessageView } from "../SlackMessage";
import type { SlackThreadView } from "./SlackThreadBlock";

/** Shaped after real threads in a Slack workspace; the people and the words are made up. */

const at = (minutesAgo: number) =>
	((Date.now() - minutesAgo * 60_000) / 1000).toFixed(6);

const person = {
	realName: null,
	avatar: null,
	isBot: false,
	title: null,
	timezone: null,
	presence: null,
	inChannel: true,
	isReader: false,
	role: null,
	team: null,
};

const GITHUB_ICON = "/fixtures/slack/U0GITHUB1A1.png";

export const people = {
	avery: {
		...person,
		id: "U0AVERY4C1N",
		name: "Avery Chen",
		title: "Staff engineer",
		timezone: "America/New_York",
		presence: "active" as const,
	},
	blake: {
		...person,
		id: "U0BLAKE8R3V",
		name: "Blake",
		realName: "Blake Rivera",
		title: "Engineering manager",
		timezone: "America/Los_Angeles",
		presence: "away" as const,
	},
	casey: {
		...person,
		id: "U0CASEY2N6G",
		name: "Casey Nguyen",
		presence: "away" as const,
	},
	satya: {
		...person,
		id: "U0SATYA2P7D",
		name: "Satya Patel",
		title: "Co-founder",
		timezone: "America/Los_Angeles",
		presence: "active" as const,
		isReader: true,
	},
	quinn: {
		...person,
		id: "U0QUINN3B8K",
		name: "Quinn Baker (Northwind)",
		realName: "Quinn Baker",
		presence: "away" as const,
		inChannel: false,
		team: {
			id: "T0NORTHWND1",
			name: "Northwind",
			icon: null,
		},
	},
	superset: {
		...person,
		id: "U0APPBOT1A1",
		name: "Superset",
		avatar: "https://avatars.githubusercontent.com/u/242687620?v=4&s=96",
		isBot: true,
	},
	github: {
		...person,
		id: "B0GIT",
		name: "GitHub",
		avatar: GITHUB_ICON,
		isBot: true,
	},
};

const message = (
	fields: Partial<SlackMessageView> &
		Pick<SlackMessageView, "ts" | "user" | "text">,
): SlackMessageView => ({
	edited: false,
	broadcast: false,
	deleted: false,
	reactions: [],
	files: [],
	attachments: [],
	blocks: [],
	permalink: `https://superset.slack.com/archives/C0TESTAGNT1/p${fields.ts.replace(".", "")}`,
	...fields,
});

export const customEmoji: Record<string, string> = {
	shipit: "https://github.githubassets.com/images/icons/emoji/shipit.png",
	partyparrot: "https://cultofthepartyparrot.com/parrots/hd/parrot.gif",
};

export const messages = {
	question: message({
		ts: at(60 * 26),
		user: people.avery,
		text: "Does the inbox CLI need its own API key or can it reuse the desktop login? `superset inbox wait` fails with 401 on a fresh machine :thinking_face:",
		reactions: [
			{
				name: "eyes",
				count: 2,
				mine: false,
				users: ["U0BLAKE8R3V", "U0CASEY2N6G"],
			},
			{
				name: "white_check_mark",
				count: 1,
				mine: true,
				users: ["U0SATYA2P7D"],
			},
		],
	}),
	reply: message({
		ts: at(60 * 25),
		user: people.casey,
		text: "It should reuse the login. <@U0SATYA2P7D> is that the plan? Context in <https://github.com/superset-sh/superset/pull/7985|#7985>",
	}),
	followUp: message({
		ts: at(60 * 25 - 2),
		user: people.casey,
		text: "the key path only exists for CI",
		edited: true,
	}),
	links: message({
		ts: at(60 * 3),
		user: people.blake,
		text: "<@U0AVERY4C1N> two takes on the composer, both behind the flag:\n• <https://app.superset.sh/page/slack-composer-takes-9x2kq1?variant=a&view=desktop>\n• <https://app.superset.sh/page/slack-composer-takes-9x2kq1?variant=b&view=desktop>",
	}),
	willDo: message({
		ts: at(60 * 3 - 1),
		user: people.avery,
		text: "will do",
	}),
	formatted: message({
		ts: at(140),
		user: people.satya,
		text: "*Decision*: reuse the login.\n_Why_: one credential per machine, not two. ~No new key~\n```\nsuperset login\nsuperset inbox wait\n```\n<!here> heads up :shipit:",
		reactions: [
			{
				name: "shipit",
				count: 5,
				mine: false,
				users: ["U0AVERY4C1N", "U0BLAKE8R3V", "U0CASEY2N6G"],
			},
		],
	}),
	pullRequest: message({
		ts: at(30),
		user: people.github,
		text: "Pull request opened by <https://github.com/saddlepaddle|saddlepaddle>",
		attachments: [
			{
				color: "#6f42c1",
				pretext: null,
				author: null,
				title:
					"#8057 fix(desktop): move the ship controls back into the workspace tab bar",
				titleLink: "https://github.com/superset-sh/superset/pull/8057",
				text: "Reverses <https://github.com/superset-sh/superset/pull/7958|#7958>. The Changes/PR control and the open-in button return to the pane tab bar's trailing slot.",
				fields: [
					{
						title: "Reviewers",
						value: "@review-bot[bot], @lint-bot[bot]",
						short: true,
					},
					{ title: "Comments", value: "3", short: true },
				],
				image: null,
				footer: "superset-sh/superset",
				footerIcon: GITHUB_ICON,
				ts: at(30),
				blocks: [],
				unfurl: null,
				link: null,
				buttons: [{ text: "Comment", url: null, style: null }],
			},
		],
	}),
	merged: message({
		ts: at(5),
		user: people.github,
		text: "Pull request merged by <https://github.com/saddlepaddle|saddlepaddle>",
		broadcast: true,
		attachments: [
			{
				color: "#6f42c1",
				pretext: null,
				author: null,
				title:
					"#8057 fix(desktop): move the ship controls back into the workspace tab bar",
				titleLink: "https://github.com/superset-sh/superset/pull/8057",
				text: null,
				fields: [],
				image: null,
				footer: "superset-sh/superset",
				footerIcon: GITHUB_ICON,
				ts: at(30),
				blocks: [],
				unfurl: null,
				link: null,
				buttons: [{ text: "Comment", url: null, style: null }],
			},
		],
	}),
	linkPreview: message({
		ts: at(8),
		user: people.blake,
		text: "<@U0SATYA2P7D> <https://www.computesdk.com/|computesdk.com>",
		attachments: [
			{
				color: null,
				pretext: null,
				author: null,
				title: null,
				titleLink: null,
				text: null,
				fields: [],
				image: null,
				footer: null,
				footerIcon: null,
				ts: null,
				blocks: [],
				unfurl: null,
				link: {
					site: "ComputeSDK Benchmarks",
					icon: "https://slack-imgs.com/?c=1&o1=ro&url=https%3A%2F%2Fwww.computesdk.com%2Ffavicon-96x96.png",
					title:
						"ComputeSDK - The default benchmark platform for infrastructure",
					text: "Daily independent benchmarks for sandbox, storage, browser, and AI gateway providers.",
					url: "https://www.computesdk.com/",
					image:
						"https://slack-imgs.com/?c=1&o1=ro&url=https%3A%2F%2Fwww.computesdk.com%2Fog-preview-image.png",
				},
				buttons: [],
			},
		],
	}),
	withFiles: message({
		ts: at(20),
		user: people.blake,
		text: "the review bot skips PRs opened from cloud workspaces",
		files: [
			{
				id: "F0SHOT1",
				name: "Screenshot 2026-10-01 at 10.13.30 AM.png",
				permalink: "https://superset.slack.com/files/U0BLAKE8R3V/F0SHOT1",
				type: "png",
				size: 245_000,
				image: {
					url: "https://avatars.githubusercontent.com/u/242687620?v=4&s=640",
					width: 640,
					height: 640,
				},
			},
			{
				id: "F0PLAN1",
				name: "Review bot setup.pdf",
				permalink: "https://superset.slack.com/files/U0BLAKE8R3V/F0PLAN1",
				type: "pdf",
				size: 1_240_000,
				image: null,
			},
		],
	}),
	mentionsChannel: message({
		ts: at(15),
		user: people.avery,
		text: "moving this to <#C0BUGS00001>, <!subteam^S0ENG> can one of you take it? <@U0SATYA2P7D> fyi",
	}),
	deletedRoot: message({
		ts: at(60 * 30),
		user: people.casey,
		text: "",
		deleted: true,
	}),
	fromApp: message({
		ts: at(12),
		user: people.superset,
		text: "Looking into it, reply coming from Satya's agent.",
	}),
} satisfies Record<string, SlackMessageView>;

export const draft =
	"*Yes*: the CLI reuses the desktop login when it finds one, and falls back to `SUPERSET_API_KEY` on a machine without it. The 401 on a fresh machine is a bug, tracking it as SUPER-2412. Thanks for flagging <@U0AVERY4C1N> :partyparrot:";

export function thread(
	overrides: Partial<SlackThreadView> = {},
): SlackThreadView {
	return {
		kind: "slack.thread",
		channel: { id: "C0TESTAGNT1", name: "#test-agents" },
		permalink:
			"https://superset.slack.com/archives/C0TESTAGNT1/p1787255144913739",
		readerConnected: true,
		names: Object.fromEntries(Object.values(people).map((p) => [p.id, p.name])),
		draft,
		emoji: customEmoji,
		channels: {
			C0TESTAGNT1: "test-agents",
			C0BUGS00001: "bugs",
			C0GENERAL01: "general",
		},
		groups: { S0ENG: "eng" },
		members: [
			people.avery,
			people.blake,
			people.casey,
			people.satya,
			people.superset,
			people.quinn,
		],
		messages: [
			messages.question,
			messages.reply,
			messages.followUp,
			messages.fromApp,
		],
		...overrides,
	};
}

export const actions = [
	{
		id: "reply",
		label: "Reply in thread",
		style: "primary" as const,
		role: "primary" as const,
		input: "Your reply",
	},
	{
		id: "reply_and_share",
		label: "Reply and also send to #test-agents",
		style: "primary" as const,
		role: "other" as const,
		input: "Your reply",
	},
	{
		id: "react",
		label: "React",
		style: "secondary" as const,
		role: "other" as const,
		input: "ts name",
	},
	{
		id: "invite",
		label: "Invite to #test-agents",
		style: "secondary" as const,
		role: "other" as const,
		input: "user",
	},
	{
		id: "set_topic",
		label: "Set the channel topic",
		style: "secondary" as const,
		role: "other" as const,
		input: "topic",
	},
	{
		id: "set_presence",
		label: "Set your Slack presence",
		style: "secondary" as const,
		role: "other" as const,
		input: "away or auto",
	},
	{
		id: "leave",
		label: "Leave it",
		style: "secondary" as const,
		role: "dismiss" as const,
	},
];

/** What the stories' messages can name, for a SlackWorkspaceProvider around them. */
export const workspace = {
	people: Object.values(people),
	channels: {
		C0TESTAGNT1: "test-agents",
		C0BUGS00001: "bugs",
		C0GEN22: "general",
	},
	groups: { S0ENG: "eng" },
	emoji: customEmoji,
};
