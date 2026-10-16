import { describe, expect, test } from "bun:test";
import { messageSchema, toMessageView, viaSlack } from "./slackMessages";

/** Trimmed from a real #agents standup post, as conversations.replies returned it. */
const standup = {
	user: "U0SATYA2P7D",
	type: "message",
	ts: "1790787833.578629",
	text: "*Standup* _Window: Tue_ • first <https://superset.sh|link>",
	blocks: [
		{
			type: "rich_text",
			block_id: "b1",
			elements: [
				{
					type: "rich_text_section",
					elements: [
						{ type: "text", text: "Standup", style: { bold: true } },
						{ type: "text", text: "\n" },
						{ type: "text", text: "Window: Tue", style: { italic: true } },
					],
				},
				{
					type: "rich_text_list",
					style: "bullet",
					indent: 0,
					elements: [
						{
							type: "rich_text_section",
							elements: [
								{ type: "text", text: "first " },
								{ type: "link", url: "https://superset.sh", text: "link" },
								{ type: "user", user_id: "U0AVERY4C1N" },
								{ type: "emoji", name: "tada", unicode: "1f389" },
							],
						},
					],
				},
			],
		},
		{
			type: "context",
			elements: [{ type: "mrkdwn", text: "*Sent using* <@U0CLAUDE1A1>" }],
		},
	],
};

describe("toMessageView", () => {
	test("keeps rich_text runs, styles, lists and context from a real post", () => {
		const parsed = messageSchema.parse(standup);
		const view = toMessageView(parsed, {
			known: new Map(),
			appUserId: undefined,
			appName: "Superset",
			readerId: null,
			permalinkBase: null,
			fileUrl: () => null,
		});
		expect(view.blocks[0]).toEqual({
			type: "rich_text",
			elements: [
				{
					kind: "section",
					inline: [
						{ kind: "text", text: "Standup", bold: true },
						{ kind: "text", text: "\n" },
						{ kind: "text", text: "Window: Tue", italic: true },
					],
				},
				{
					kind: "list",
					ordered: false,
					indent: 0,
					items: [
						[
							{ kind: "text", text: "first " },
							{ kind: "link", url: "https://superset.sh", text: "link" },
							{ kind: "user", id: "U0AVERY4C1N" },
							{ kind: "emoji", name: "tada", unicode: "🎉" },
						],
					],
				},
			],
		});
		expect(view.blocks[1]).toEqual({
			type: "context",
			elements: [{ kind: "text", text: "*Sent using* <@U0CLAUDE1A1>" }],
		});
	});
});

describe("viaSlack", () => {
	test("loads app images through Slack's proxy and leaves Slack's own alone", () => {
		expect(
			viaSlack("https://slack.github.com/static/img/favicon-neutral.png"),
		).toBe(
			"https://slack-imgs.com/?c=1&o1=ro&url=https%3A%2F%2Fslack.github.com%2Fstatic%2Fimg%2Ffavicon-neutral.png",
		);
		expect(viaSlack("https://a.slack-edge.com/80588/img/x.png")).toBe(
			"https://a.slack-edge.com/80588/img/x.png",
		);
		expect(viaSlack("not a url")).toBeNull();
		expect(viaSlack(null)).toBeNull();
	});
});

describe("link previews", () => {
	test("a pasted link's preview keeps its site, text and image, and legacy buttons keep their style", () => {
		const parsed = messageSchema.parse({
			type: "message",
			user: "U0AVERY",
			ts: "1790922000.000100",
			text: "<https://www.computesdk.com/|computesdk.com>",
			attachments: [
				{
					from_url: "https://www.computesdk.com/",
					original_url: "https://www.computesdk.com/",
					service_name: "ComputeSDK Benchmarks",
					service_icon: "https://www.computesdk.com/favicon-96x96.png",
					title: "ComputeSDK",
					title_link: "https://www.computesdk.com/",
					text: "Daily independent benchmarks.",
					image_url: "https://www.computesdk.com/og-preview-image.png",
				},
				{
					title: "#8046 Issue",
					actions: [
						{ type: "button", text: "Comment", style: "" },
						{ type: "button", text: "Close", style: "danger" },
					],
				},
			],
		});
		const view = toMessageView(parsed, {
			known: new Map(),
			appUserId: undefined,
			appName: "Superset",
			readerId: null,
			permalinkBase: null,
			fileUrl: () => null,
		});
		expect(view.attachments[0].link).toEqual({
			site: "ComputeSDK Benchmarks",
			icon: viaSlack("https://www.computesdk.com/favicon-96x96.png"),
			title: "ComputeSDK",
			text: "Daily independent benchmarks.",
			url: "https://www.computesdk.com/",
			image: viaSlack("https://www.computesdk.com/og-preview-image.png"),
		});
		expect(view.attachments[1].link).toBeNull();
		expect(view.attachments[1].buttons.map((b) => b.style)).toEqual([
			null,
			"danger",
		]);
	});
});
