import { describe, expect, it } from "bun:test";
import { buildAcquisitionSourceProperties } from "./acquisitionSource";

describe("buildAcquisitionSourceProperties", () => {
	it("records an AI assistant by its key and clears a stale Other answer", () => {
		expect(
			buildAcquisitionSourceProperties({
				source: "chatgpt",
				otherText: "ignored",
			}),
		).toEqual({
			source: "chatgpt",
			is_ai_assistant: true,
			$set: { acquisition_source: "chatgpt" },
			$unset: ["acquisition_source_other"],
		});
	});

	it("adds the trimmed free text only when Other is chosen", () => {
		expect(
			buildAcquisitionSourceProperties({
				source: "other",
				otherText: "  a meetup  ",
			}),
		).toEqual({
			source: "other",
			is_ai_assistant: false,
			other_text: "a meetup",
			$set: {
				acquisition_source: "other",
				acquisition_source_other: "a meetup",
			},
		});
	});

	it("returns nothing to send when the question is skipped", () => {
		expect(
			buildAcquisitionSourceProperties({ source: null, otherText: "" }),
		).toBeNull();
	});
});
