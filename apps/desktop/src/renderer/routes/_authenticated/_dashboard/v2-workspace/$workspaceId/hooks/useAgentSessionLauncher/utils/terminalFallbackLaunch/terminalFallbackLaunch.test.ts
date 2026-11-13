import { describe, expect, test } from "bun:test";
import { terminalFallbackLaunch } from "./terminalFallbackLaunch";

describe("terminalFallbackLaunch", () => {
	test("refuses a terminal launch for a Chat request that carries a mode", () => {
		expect(
			terminalFallbackLaunch({
				configId: "claude",
				placement: "new-tab",
				prompt: "hi",
				modeId: "auto",
			}),
		).toEqual({ kind: "chat-unavailable" });
	});

	test("never forwards a mode to the terminal launch", () => {
		expect(
			terminalFallbackLaunch({
				configId: "claude",
				placement: "new-tab",
				prompt: "hi",
				modelId: "opus",
				modeId: "auto",
				forkSessionId: "session-1",
				attachments: [
					{ attachmentId: "att-1", name: "a.png", mimeType: "image/png" },
				],
			}),
		).toEqual({
			kind: "terminal",
			launch: {
				agent: "claude",
				prompt: "hi",
				attachmentIds: ["att-1"],
				model: "opus",
				forkSessionId: "session-1",
			},
		});
	});
});
