import { describe, expect, test } from "bun:test";
import type { SelectChannel, SelectChannelMember } from "@superset/db/schema";
import {
	type ChannelAccess,
	canManage,
	canPost,
	canRead,
	canRemoveMessage,
} from "./access";

const channel = (overrides: Partial<SelectChannel> = {}) =>
	({ visibility: "public", archivedAt: null, ...overrides }) as SelectChannel;
const member = (role: "member" | "admin" = "member") =>
	({ role }) as SelectChannelMember;
const access = (overrides: Partial<ChannelAccess> = {}): ChannelAccess => ({
	channel: channel(),
	membership: null,
	orgRole: "member",
	...overrides,
});

describe("channel access", () => {
	test("private channels are readable only by members", () => {
		expect(canRead(channel(), null)).toBe(true);
		expect(canRead(channel({ visibility: "private" }), null)).toBe(false);
		expect(canRead(channel({ visibility: "private" }), member())).toBe(true);
	});

	test("posting needs membership in a live channel", () => {
		expect(canPost(access())).toBe(false);
		expect(canPost(access({ membership: member() }))).toBe(true);
		expect(
			canPost(
				access({
					membership: member(),
					channel: channel({ archivedAt: new Date() }),
				}),
			),
		).toBe(false);
	});

	test("channel admins and org admins manage; members do not", () => {
		expect(canManage(access({ membership: member() }))).toBe(false);
		expect(canManage(access({ membership: member("admin") }))).toBe(true);
		expect(canManage(access({ orgRole: "owner" }))).toBe(true);
	});

	test("authors and managers can delete a message", () => {
		const plain = access({ membership: member() });
		expect(canRemoveMessage(plain, "me", "me")).toBe(true);
		expect(canRemoveMessage(plain, "other", "me")).toBe(false);
		expect(
			canRemoveMessage(access({ membership: member("admin") }), "other", "me"),
		).toBe(true);
	});
});
