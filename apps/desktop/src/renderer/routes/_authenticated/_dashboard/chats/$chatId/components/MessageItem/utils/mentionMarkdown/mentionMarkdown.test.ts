import { expect, test } from "bun:test";
import { mentionMarkdown } from "./mentionMarkdown";

const id = "11111111-1111-4111-8111-111111111111";

test("a mention token becomes a link named after who it points at", () => {
	expect(mentionMarkdown(`hi <@dev:${id}>!`, () => "Sc[o]ut")).toBe(
		`hi [@Sc\\[o\\]ut](#mention/dev/${id})!`,
	);
});
