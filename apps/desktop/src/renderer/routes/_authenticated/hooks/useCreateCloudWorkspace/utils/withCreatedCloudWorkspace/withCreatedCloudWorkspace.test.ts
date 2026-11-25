import { expect, test } from "bun:test";
import { withCreatedCloudWorkspace } from "./withCreatedCloudWorkspace";

const created = { id: "new", status: "provisioning" };

test("prepends the new workspace to the cached list", () => {
	expect(
		withCreatedCloudWorkspace([{ id: "old", status: "ready" }], created),
	).toEqual([created, { id: "old", status: "ready" }]);
	expect(withCreatedCloudWorkspace(undefined, created)).toEqual([created]);
});

test("keeps a row the list already fetched, which is newer than the create snapshot", () => {
	const fetched = [{ id: "new", status: "ready" }];
	expect(withCreatedCloudWorkspace(fetched, created)).toBe(fetched);
});
