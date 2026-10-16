import { describe, expect, test } from "bun:test";
import { linkLabel } from "./linkLabel";

describe("linkLabel matches the label Slack gives a pasted URL", () => {
	test.each([
		["https://superset.sh", "superset.sh"],
		["https://superset.sh/", "superset.sh"],
		["http://localhost:3000/a/", "localhost/a"],
		[
			"https://www.github.com/superset-sh/superset/pull/8050/files?diff=split&w=1#diff-abcdef0123456789abcdef",
			"github.com/superset-sh/superset/pull/8050/files?diff=split&w=1#…",
		],
	])("%s", (url, label) => {
		expect(linkLabel(url)).toBe(label);
	});
});
