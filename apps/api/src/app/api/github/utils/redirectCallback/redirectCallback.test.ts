import { expect, test } from "bun:test";
import { createSignedState } from "@/lib/oauth-state";
import { redirectCallback } from "./redirectCallback";

const legacy = "https://api.superset.sh";
const current = "https://api.paradev.com";
const identity = { organizationId: "org-1", userId: "user-1" };

function callback(state: string, origin = legacy) {
	const url = new URL("/api/github/callback", origin);
	url.searchParams.set("state", state);
	url.searchParams.set("installation_id", "123");
	return new Request(url);
}

test.each([
	[legacy, current],
	[current, legacy],
])("routes a signed callback from %s to %s without a redirect loop", (from, to) => {
	const state = createSignedState({ ...identity, callbackOrigin: to });
	const response = redirectCallback(callback(state, from), from);
	expect(response?.status).toBe(302);
	const destination = response?.headers.get("location") ?? "";
	expect(new URL(destination).origin).toBe(to);
	expect(redirectCallback(new Request(destination), to)).toBeNull();
});

test.each([
	"https://evil.test",
	"https://api.paradev.com.evil.test",
	"https://api.paradev.com@evil.test",
	"https://api.paradev.com/path",
	"http://api.paradev.com",
	"https://api.paradev.com:444",
])("does not redirect even signed state to an untrusted origin: %s", (origin) => {
	const state = createSignedState({ ...identity, callbackOrigin: origin });
	expect(redirectCallback(callback(state), legacy)).toBeNull();
});

test("does not route tampered state", () => {
	const state = createSignedState({ ...identity, callbackOrigin: current });
	const [payload] = state.split(".");
	expect(redirectCallback(callback(`${payload}.invalid`), legacy)).toBeNull();
});

test("leaves in-flight state without an origin to normal callback validation", () => {
	expect(
		redirectCallback(callback(createSignedState(identity)), legacy),
	).toBeNull();
});
