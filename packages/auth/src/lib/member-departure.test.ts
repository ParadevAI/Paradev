import { describe, expect, test } from "bun:test";
import { APIError } from "better-auth/api";
import {
	afterMemberDeparted,
	type DepartedMember,
	departedMemberFrom,
} from "./member-departure";

const MEMBER: DepartedMember = { userId: "user-1", organizationId: "org-1" };

function recorder() {
	const ran: string[] = [];
	const failures: { step: string; message: string }[] = [];
	return {
		ran,
		failures,
		step: (name: string) => async (departed: DepartedMember) => {
			expect(departed).toEqual(MEMBER);
			ran.push(name);
		},
		reportFailure: (step: string, _member: DepartedMember, error: unknown) => {
			failures.push({ step, message: (error as Error).message });
		},
	};
}

describe("afterMemberDeparted", () => {
	test("reports a failed step and still runs the rest in order", async () => {
		const { ran, failures, step, reportFailure } = recorder();

		await afterMemberDeparted(MEMBER, {
			removeShares: step("remove shares"),
			cleanUp: async () => {
				throw new Error("database unavailable");
			},
			notifyMember: step("notify member"),
			syncSeats: step("sync seats"),
			reportFailure,
		});

		expect(ran).toEqual(["remove shares", "notify member", "sync seats"]);
		expect(failures).toEqual([
			{ step: "clean up", message: "database unavailable" },
		]);
	});

	test("skips the member email when there is no notify step, as for a leave", async () => {
		const { ran, failures, step, reportFailure } = recorder();

		await afterMemberDeparted(MEMBER, {
			removeShares: step("remove shares"),
			cleanUp: step("clean up"),
			syncSeats: step("sync seats"),
			reportFailure,
		});

		expect(ran).toEqual(["remove shares", "clean up", "sync seats"]);
		expect(failures).toEqual([]);
	});
});

describe("departedMemberFrom", () => {
	test("reads the member from the row the leave route returns, and nothing else", () => {
		expect(
			departedMemberFrom({ id: "member-1", role: "member", ...MEMBER }),
		).toEqual(MEMBER);
		expect(departedMemberFrom(new APIError("BAD_REQUEST"))).toBeNull();
		expect(departedMemberFrom(null)).toBeNull();
		expect(departedMemberFrom({ userId: "user-1" })).toBeNull();
	});
});
