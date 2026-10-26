import { expect, test } from "bun:test";
import { hasVerifiedWidgetIdentity } from "./appearance-identity";

const identity = "a".repeat(64);
const verified = {
	id: `claude:${identity}`,
	quotaIdentity: identity,
	status: "ok",
};

test("appearance writes require the exact healthy provider identity, not a display label or credential slot", () => {
	expect(hasVerifiedWidgetIdentity(verified)).toBe(true);
	for (const patch of [
		{ id: "claude:/fixture/profile" },
		{ id: `grok:${"b".repeat(64)}` },
		{ id: `unknown:${identity}` },
		{ quotaIdentity: undefined },
		{ quotaIdentity: "display@example.test" },
		{ status: "unavailable" },
		{ status: "token_expired" },
		{ identityChanged: true },
		{ historical: true },
	])
		expect(hasVerifiedWidgetIdentity({ ...verified, ...patch })).toBe(false);
	for (const provider of ["grok", "agy"])
		expect(
			hasVerifiedWidgetIdentity({ ...verified, id: `${provider}:${identity}` }),
		).toBe(true);
});
