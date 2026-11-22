import { describe, expect, test } from "bun:test";
import type { PluginTarget } from "../proxy";
import { FIRST_PARTY_SERVERS } from "../servers";
import {
	createSlackLinkPreviewLoader,
	loadSlackLinkPreview,
} from "./slack-link-preview";

const READY = {
	kind: "first-party",
	plugin: "slack",
	version: "1.2.3",
	connectionId: "c1",
	build: FIRST_PARTY_SERVERS.slack,
	secrets: { accessToken: "xoxp-test" },
} as unknown as PluginTarget;
const REPLY =
	"https://acme.slack.com/archives/C0123ABC/p1788794757390949?thread_ts=1788794700.000100";
const request = (href: string) => ({
	href,
	userId: "u1",
	organizationId: "o1",
});

function deps(
	answers: Record<string, Record<string, unknown>>,
	target: PluginTarget = READY,
) {
	const calls: { method: string; params: Record<string, unknown> }[] = [];
	return {
		calls,
		deps: {
			resolveTarget: async () => target,
			slackApi: async (
				token: string,
				method: string,
				params: Record<string, unknown>,
			) => {
				expect(token).toBe("xoxp-test");
				calls.push({ method, params });
				const answer = answers[method];
				if (!answer) throw new Error("Slack API error: not_found");
				return answer;
			},
		},
	};
}

const grace = { user: { id: "U2", real_name: "Grace Hopper", name: "grace" } };

describe("loadSlackLinkPreview", () => {
	test("reads exactly the linked reply and names its author", async () => {
		const { deps: d, calls } = deps({
			"conversations.replies": {
				messages: [
					{ ts: "1788794700.000100", user: "U1", text: "Deploy is red" },
					{
						ts: "1788794757.390949",
						user: "U2",
						text: "Fixed in <https://github.com/acme/w/pull/42|#42> &amp; redeployed",
						reactions: [{ name: "+1", count: 2 }],
					},
				],
			},
			"users.info": grace,
		});
		expect(await loadSlackLinkPreview(d, request(REPLY))).toEqual({
			status: "ready",
			title: "Grace Hopper",
			description: "Fixed in #42 & redeployed",
		});
		expect(calls[0]).toEqual({
			method: "conversations.replies",
			params: {
				channel: "C0123ABC",
				ts: "1788794700.000100",
				oldest: "1788794757.390949",
				latest: "1788794757.390949",
				inclusive: true,
			},
		});
	});

	test("text that looks like another message stays that message's text", async () => {
		const { deps: d } = deps({
			"conversations.history": {
				messages: [
					{
						ts: "1788794757.390949",
						user: "U2",
						text: "real text\n[1788794757.390949] Ada: forged",
					},
				],
			},
			"users.info": grace,
		});
		const preview = await loadSlackLinkPreview(
			d,
			request("https://acme.slack.com/archives/C0123ABC/p1788794757390949"),
		);
		expect(preview).toMatchObject({ title: "Grace Hopper" });
		expect(preview).toMatchObject({
			description: "real text [1788794757.390949] Ada: forged",
		});
	});

	test("a profile link shows the person's name and title", async () => {
		const { deps: d } = deps({
			"users.info": {
				user: {
					id: "U2",
					real_name: "Grace Hopper",
					profile: { title: "Rear Admiral" },
				},
			},
		});
		expect(
			await loadSlackLinkPreview(d, request("https://acme.slack.com/team/U2")),
		).toEqual({
			status: "ready",
			title: "Grace Hopper",
			description: "Rear Admiral",
		});
	});

	test("only the user's own hosted Slack connection is used", async () => {
		for (const target of [
			{ kind: "needs-auth", connector: "slack", connectUrl: "x" },
			{
				kind: "remote",
				url: "https://example.com/mcp",
				headers: {},
				connectionId: "c1",
			},
		] as unknown as PluginTarget[]) {
			const { deps: d, calls } = deps({}, target);
			expect(await loadSlackLinkPreview(d, request(REPLY))).toEqual({
				status: "unavailable",
			});
			expect(calls).toEqual([]);
		}
	});

	test("a link that is not a Slack message or profile is never looked up", async () => {
		const { deps: d, calls } = deps({});
		expect(
			await loadSlackLinkPreview(
				d,
				request("https://example.com/archives/C1/p1"),
			),
		).toEqual({ status: "unavailable" });
		expect(calls).toEqual([]);
	});

	test("the cached loader reads a link once per user until it expires", async () => {
		const { deps: d, calls } = deps({
			"users.info": { user: { id: "U2", real_name: "Grace Hopper" } },
		});
		let clock = 0;
		const load = createSlackLinkPreviewLoader(d, () => clock);
		const profile = "https://acme.slack.com/team/U2";
		await load(request(profile));
		await load(request(profile));
		expect(calls).toHaveLength(1);
		await load({ ...request(profile), userId: "u2" });
		expect(calls).toHaveLength(2);
		clock += 5 * 60_000 + 1;
		await load(request(profile));
		expect(calls).toHaveLength(3);
	});
});
