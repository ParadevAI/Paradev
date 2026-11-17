import { expect, test } from "bun:test";
import { pageSlugFromLink } from "./pageLink";

test("a link to a page gives its slug; other links give none", () => {
	expect(
		pageSlugFromLink("https://app.example.com/page/q3-pipeline-ab12cd"),
	).toBe("q3-pipeline-ab12cd");
	expect(
		pageSlugFromLink("https://app.example.com/page/q3-pipeline-ab12cd?v=2"),
	).toBe("q3-pipeline-ab12cd");
	expect(pageSlugFromLink("https://app.example.com/pages")).toBeNull();
	expect(pageSlugFromLink("https://app.example.com/workspaces/x")).toBeNull();
	expect(pageSlugFromLink(undefined)).toBeNull();
});
