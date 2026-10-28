import { describe, expect, it } from "bun:test";
import { signFileTicket } from "@superset/shared/usercontent";
import {
	signTurnToken,
	TURN_TOKEN_TTL_SECONDS,
	verifyTurnToken,
} from "./turn-token";

const SECRET = "test-agent-turn-signing-secret-0123456789";
const claims = {
	turnId: "turn-1",
	sessionId: "session-1",
	agentId: "agent-1",
	organizationId: "org-1",
	actingUserId: "user-1",
};

describe("turn tokens", () => {
	it("round-trips the claims the API signed", async () => {
		const token = await signTurnToken(SECRET, claims, 1_000_000);
		const verified = await verifyTurnToken(SECRET, token, 1_000_000);
		expect(verified).toEqual({
			...claims,
			exp: Math.floor(1_000_000 / 1000) + TURN_TOKEN_TTL_SECONDS,
		});
	});

	it("rejects a token signed with another secret, or edited", async () => {
		const token = await signTurnToken(SECRET, claims);
		expect(
			await verifyTurnToken("another-secret-0123456789abcdef", token),
		).toBeNull();
		const [payload, signature] = token.split(".");
		const forged = `${payload?.slice(0, -2)}xx.${signature}`;
		expect(await verifyTurnToken(SECRET, forged)).toBeNull();
	});

	it("rejects an expired token", async () => {
		const token = await signTurnToken(SECRET, claims, 0);
		expect(
			await verifyTurnToken(SECRET, token, (TURN_TOKEN_TTL_SECONDS + 1) * 1000),
		).toBeNull();
	});

	it("never accepts another kind of ticket signed with the same secret", async () => {
		const file = await signFileTicket(SECRET, {
			fileId: "f",
			contentType: "text/plain",
			exp: Math.floor(Date.now() / 1000) + 60,
		});
		expect(await verifyTurnToken(SECRET, file)).toBeNull();
	});
});
