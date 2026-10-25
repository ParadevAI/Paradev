import { describe, expect, test } from "bun:test";
import { AUTUMN_API_VERSION, autumnClient } from "./autumn";

describe("autumnClient", () => {
	test("is pinned to the API version whose track waits until recorded", () => {
		expect(AUTUMN_API_VERSION).toBe("2.4.0");
		expect(
			(autumnClient as unknown as { _options: { xApiVersion?: string } })
				._options.xApiVersion,
		).toBe("2.4.0");
	});
});
