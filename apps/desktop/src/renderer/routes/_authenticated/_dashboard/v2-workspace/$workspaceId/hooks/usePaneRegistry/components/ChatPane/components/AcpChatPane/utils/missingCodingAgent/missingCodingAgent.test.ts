import { describe, expect, test } from "bun:test";
import { missingCodingAgent } from "./missingCodingAgent";

const LOCAL = {
	hostUrl: "http://127.0.0.1:1",
	localHostUrl: "http://127.0.0.1:1",
};

describe("missingCodingAgent", () => {
	test("offers the install when the lookup finds no binary", () => {
		const missing = { failed: true, installed: false, ...LOCAL };
		expect(missingCodingAgent({ agentId: "claude", ...missing })).toBe(
			"claude",
		);
		expect(missingCodingAgent({ agentId: "codex", ...missing })).toBe("codex");
	});

	test("keeps the plain error when the binary is there or not yet looked up", () => {
		for (const installed of [true, undefined]) {
			expect(
				missingCodingAgent({
					agentId: "claude",
					failed: true,
					installed,
					...LOCAL,
				}),
			).toBeNull();
		}
	});

	test("offers nothing for a chat that did not fail, another host, or another agent", () => {
		const base = { agentId: "claude", failed: true, installed: false };
		expect(missingCodingAgent({ ...base, ...LOCAL, failed: false })).toBeNull();
		expect(
			missingCodingAgent({
				...base,
				hostUrl: "https://relay.example/host-2",
				localHostUrl: LOCAL.localHostUrl,
			}),
		).toBeNull();
		expect(
			missingCodingAgent({
				...base,
				hostUrl: LOCAL.hostUrl,
				localHostUrl: null,
			}),
		).toBeNull();
		expect(
			missingCodingAgent({ ...base, ...LOCAL, agentId: "gemini" }),
		).toBeNull();
	});
});
