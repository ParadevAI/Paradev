import { describe, expect, test } from "bun:test";
import { deriveWorkspaceStatus } from "./deriveWorkspaceStatus";

describe("deriveWorkspaceStatus", () => {
	test("a cloud box's reported review is unread until the user has seen it", () => {
		const report = { status: "review" as const, at: 100 };
		expect(
			deriveWorkspaceStatus({
				terminalStatuses: [],
				hasManualUnread: false,
				report,
				seenAt: 50,
			}),
		).toEqual({ status: "review", isUnread: true });
		expect(
			deriveWorkspaceStatus({
				terminalStatuses: [],
				hasManualUnread: false,
				report,
				seenAt: 100,
			}),
		).toEqual({ status: null, isUnread: false });
	});

	test("a working terminal shows a status but is not unread", () => {
		expect(
			deriveWorkspaceStatus({
				terminalStatuses: ["working", "idle"],
				hasManualUnread: false,
				seenAt: undefined,
			}),
		).toEqual({ status: "working", isUnread: false });
	});

	test("a manual unread mark reads as review", () => {
		expect(
			deriveWorkspaceStatus({
				terminalStatuses: [],
				hasManualUnread: true,
				seenAt: undefined,
			}),
		).toEqual({ status: "review", isUnread: true });
	});
});
