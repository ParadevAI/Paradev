import { expect, test } from "bun:test";

import { campaignProperties } from "./campaign";

test("keeps campaign parameters and masks ad click IDs", () => {
	expect(
		campaignProperties(
			"?utm_source=google&utm_id=42&matchtype=e&gclid=abc&ref=x&fbclid=",
		),
	).toEqual({
		utm_source: "google",
		utm_id: "42",
		matchtype: "e",
		gclid: "<masked>",
	});
});
