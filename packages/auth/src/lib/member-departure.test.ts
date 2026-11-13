import { expect, spyOn, test } from "bun:test";
import { afterMemberDeparted, type DepartedMember } from "./member-departure";

test("runs every departure step in order, even when an earlier one fails", async () => {
	const member: DepartedMember = { userId: "user-1", organizationId: "org-1" };
	const ran: string[] = [];
	const step = (name: string) => async (departed: DepartedMember) => {
		expect(departed).toEqual(member);
		ran.push(name);
	};
	const logged = spyOn(console, "error").mockImplementation(() => {});

	try {
		await afterMemberDeparted(member, {
			removeShares: async () => {
				throw new Error("database unavailable");
			},
			cleanUp: step("clean up"),
			notifyMember: step("notify member"),
			syncSeats: step("sync seats"),
		});

		expect(ran).toEqual(["clean up", "notify member", "sync seats"]);
		expect(logged).toHaveBeenCalledTimes(1);
	} finally {
		logged.mockRestore();
	}
});

test("skips the member email when there is no notify step, as for a leave", async () => {
	const ran: string[] = [];
	const step = (name: string) => async () => {
		ran.push(name);
	};

	await afterMemberDeparted(
		{ userId: "user-1", organizationId: "org-1" },
		{
			removeShares: step("remove shares"),
			cleanUp: step("clean up"),
			syncSeats: step("sync seats"),
		},
	);

	expect(ran).toEqual(["remove shares", "clean up", "sync seats"]);
});
