import { expect, test } from "bun:test";
import { ForwardTokens } from "./forward-tokens";

const RELAY_HOST = "https://relay.test/hosts/org:machine";
const GATE_HOST = "https://ws1-4879.sandbox.test";

test("a gate host gets only its own ticket, never the relay token", () => {
	const tokens = new ForwardTokens();
	tokens.setRelayToken("jwt");
	expect(tokens.tokenFor(RELAY_HOST)).toBe("jwt");

	tokens.markGateHost(GATE_HOST);
	expect(tokens.tokenFor(GATE_HOST)).toBeNull();
	tokens.setHostToken(GATE_HOST, "ticket");
	expect(tokens.tokenFor(GATE_HOST)).toBe("ticket");
	tokens.setHostToken(GATE_HOST, null);
	expect(tokens.tokenFor(GATE_HOST)).toBeNull();
});

test("after sign-out no previous credential is handed out", () => {
	const tokens = new ForwardTokens();
	tokens.setRelayToken("jwt");
	tokens.setHostToken(GATE_HOST, "ticket");
	tokens.clearCredentials();
	expect(tokens.tokenFor(RELAY_HOST)).toBeNull();
	expect(tokens.tokenFor(GATE_HOST)).toBeNull();
	expect(tokens.getRelayToken()).toBeNull();
});
