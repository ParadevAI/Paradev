import { describe, expect, it } from "bun:test";
import { parseAgyTranscriptLine } from "./agy";

describe("parseAgyTranscriptLine", () => {
	it("parses Gemini-style usage metadata", () => {
		const entry = parseAgyTranscriptLine(
			JSON.stringify({
				created_at: "2026-08-28T12:00:00Z",
				model: { id: "gemini-3.1-pro" },
				response: {
					usageMetadata: {
						promptTokenCount: 100,
						cachedContentTokenCount: 25,
						candidatesTokenCount: 30,
						thoughtsTokenCount: 10,
					},
				},
			}),
			"session-1",
			"/repo",
		);
		expect(entry).toMatchObject({
			agent: "agy",
			model: "gemini-3.1-pro",
			uncachedInput: 75,
			cachedInput: 25,
			output: 30,
			reasoningOutput: 10,
		});
	});

	it("parses agy step lines with top-level token counts", () => {
		const entry = parseAgyTranscriptLine(
			JSON.stringify({
				step_index: 3,
				source: "MODEL",
				type: "PLANNER_RESPONSE",
				status: "DONE",
				created_at: "2026-10-14T03:03:40Z",
				input_tokens: 3013,
				cache_read_tokens: 14973,
				output_tokens: 1518,
			}),
			"session-1",
			"/repo",
		);
		expect(entry).toMatchObject({
			agent: "agy",
			model: "antigravity",
			timestampMs: Date.parse("2026-10-14T03:03:40Z"),
			uncachedInput: 3013,
			cachedInput: 14973,
			output: 1518,
		});
	});

	it("skips steps without token counts", () => {
		expect(
			parseAgyTranscriptLine(
				JSON.stringify({
					source: "USER",
					type: "USER_INPUT",
					created_at: "2026-10-14T03:03:00Z",
					content: "fix the bug",
				}),
				"session-1",
				"/repo",
			),
		).toBeNull();
	});

	it("prefers top-level agy tokens over a nested usage object", () => {
		const entry = parseAgyTranscriptLine(
			JSON.stringify({
				type: "PLANNER_RESPONSE",
				created_at: "2026-10-14T03:03:40Z",
				input_tokens: 100,
				output_tokens: 20,
				tool_calls: [{ args: { usage: { input_tokens: 9999 } } }],
			}),
			"session-1",
			"/repo",
		);
		expect(entry).toMatchObject({ uncachedInput: 100, output: 20 });
	});

	it("reads nested usage when top-level token fields are zero", () => {
		const entry = parseAgyTranscriptLine(
			JSON.stringify({
				created_at: "2026-10-14T03:03:40Z",
				output_tokens: 0,
				usage: { input_tokens: 50, output_tokens: 7 },
			}),
			"session-1",
			"/repo",
		);
		expect(entry).toMatchObject({ uncachedInput: 50, output: 7 });
	});
});
