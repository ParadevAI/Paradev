import { describe, expect, test } from "bun:test";
import type { cloudWorkspaces } from "@superset/db/schema";
import { listedWorkspace } from "./session";

const NOW = Date.parse("2026-10-18T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function row(
	fields: Partial<typeof cloudWorkspaces.$inferSelect>,
): typeof cloudWorkspaces.$inferSelect {
	return {
		agentStatus: "working",
		agentStatusAt: new Date(NOW - HOUR),
		sessionEndsAt: new Date(NOW + HOUR),
		...fields,
	} as typeof cloudWorkspaces.$inferSelect;
}

describe("listedWorkspace", () => {
	test("a turn cut off by the session ending shows no status", () => {
		for (const agentStatus of ["working", "permission"] as const) {
			const listed = listedWorkspace(
				row({ agentStatus, sessionEndsAt: new Date(NOW - 1) }),
				NOW,
			);
			expect(listed.agentStatus).toBeNull();
		}
	});

	test("a finished or failed turn keeps its status after the session ends", () => {
		for (const agentStatus of ["review", "failed"] as const) {
			const listed = listedWorkspace(
				row({ agentStatus, sessionEndsAt: new Date(NOW - 1) }),
				NOW,
			);
			expect(listed.agentStatus).toBe(agentStatus);
		}
	});

	test("a running session keeps working", () => {
		expect(listedWorkspace(row({}), NOW).agentStatus).toBe("working");
	});

	test("without a recorded session end, a status older than the session cap is cut off", () => {
		const unrecorded = { sessionEndsAt: null };
		expect(
			listedWorkspace(
				row({ ...unrecorded, agentStatusAt: new Date(NOW - 25 * HOUR) }),
				NOW,
			).agentStatus,
		).toBeNull();
		expect(
			listedWorkspace(
				row({ ...unrecorded, agentStatusAt: new Date(NOW - 2 * HOUR) }),
				NOW,
			).agentStatus,
		).toBe("working");
	});

	test("does not list the session end", () => {
		expect("sessionEndsAt" in listedWorkspace(row({}), NOW)).toBe(false);
	});
});
