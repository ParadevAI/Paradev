import { describe, expect, test } from "bun:test";
import {
	type CustomerChannelClient,
	openCustomerChannel,
} from "./open-customer-channel";

function slackError(code: string) {
	return Object.assign(new Error(code), { data: { error: code } });
}

function fakeClient({
	existingChannelId,
	inviteSharedError,
}: {
	existingChannelId?: string;
	inviteSharedError?: string;
} = {}) {
	const calls: { method: string; args: unknown }[] = [];
	const record =
		(method: string, run: (args: unknown) => unknown) =>
		async (args: unknown) => {
			calls.push({ method, args });
			return run(args);
		};
	const client = {
		conversations: {
			create: record("create", () => {
				if (existingChannelId) throw slackError("name_taken");
				return { ok: true, channel: { id: "C_NEW" } };
			}),
			list: record("list", () => ({
				ok: true,
				channels: [
					{ id: "C_OTHER", name: "ext-other-paradev" },
					{ id: existingChannelId, name: "ext-acme-paradev" },
				],
			})),
			invite: record("invite", () => ({ ok: true })),
			inviteShared: record("inviteShared", () => {
				if (inviteSharedError) throw slackError(inviteSharedError);
				return { ok: true };
			}),
		},
		chat: { postMessage: record("postMessage", () => ({ ok: true })) },
	} as unknown as CustomerChannelClient;
	return { client, calls };
}

const input = {
	name: "ext-acme-paradev",
	teammateIds: ["U1", "U2"],
	customerEmail: "founder@acme.com",
	welcomeText: "Welcome",
};

describe("openCustomerChannel", () => {
	test("creates the channel, loops in teammates and the customer, and says hello", async () => {
		const { client, calls } = fakeClient();
		const result = await openCustomerChannel({ client, ...input });

		expect(result).toEqual({
			channelId: "C_NEW",
			created: true,
			teammatesInvited: 2,
			teammateInviteError: null,
			customerInvite: { status: "sent", email: "founder@acme.com" },
		});
		expect(calls.map((call) => call.method)).toEqual([
			"create",
			"invite",
			"inviteShared",
			"postMessage",
		]);
		expect(calls[1]?.args).toMatchObject({ channel: "C_NEW", users: "U1,U2" });
	});

	test("reuses an existing channel on retry without posting the welcome again", async () => {
		const { client, calls } = fakeClient({ existingChannelId: "C_EXISTING" });
		const result = await openCustomerChannel({ client, ...input });

		expect(result.channelId).toBe("C_EXISTING");
		expect(result.created).toBe(false);
		expect(calls.some((call) => call.method === "postMessage")).toBe(false);
	});

	test("reports a failed Slack Connect invite instead of throwing", async () => {
		const { client } = fakeClient({ inviteSharedError: "missing_scope" });
		const result = await openCustomerChannel({ client, ...input });

		expect(result.customerInvite).toEqual({
			status: "failed",
			email: "founder@acme.com",
			error: "missing_scope",
		});
	});
});
