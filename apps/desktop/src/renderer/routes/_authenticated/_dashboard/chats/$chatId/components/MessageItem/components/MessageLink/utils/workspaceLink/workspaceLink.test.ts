import { expect, test } from "bun:test";
import { workspaceIdFromLink } from "./workspaceLink";

const ID = "4debd8ae-b855-4fe0-b66b-f502bc2e72c2";

test("a web or app link to a workspace gives its id; other links give none", () => {
	expect(workspaceIdFromLink(`https://app.example.com/workspaces/${ID}`)).toBe(
		ID,
	);
	expect(
		workspaceIdFromLink(`superset://v2-workspace/${ID}?sessionId=s1`),
	).toBe(ID);
	expect(workspaceIdFromLink(`https://app.example.com/page/${ID}`)).toBeNull();
	expect(
		workspaceIdFromLink("https://example.com/workspaces/not-an-id"),
	).toBeNull();
	expect(workspaceIdFromLink(undefined)).toBeNull();
});
