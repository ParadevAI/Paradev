import { expect, spyOn, test } from "bun:test";
import { afterMemberLeft, type LeftMember } from "./member-left";

test("syncs seats after a member leaves, even when removing their shares fails", async () => {
	const member: LeftMember = { userId: "user-1", organizationId: "org-1" };
	const synced: LeftMember[] = [];
	const logged = spyOn(console, "error").mockImplementation(() => {});

	try {
		await afterMemberLeft(member, {
			removeShares: async () => {
				throw new Error("database unavailable");
			},
			syncSeats: async (left) => {
				synced.push(left);
			},
		});

		expect(synced).toEqual([member]);
		expect(logged).toHaveBeenCalledTimes(1);
	} finally {
		logged.mockRestore();
	}
});
