import { expect, test } from "bun:test";
import { workspaceRowNeedsAttention } from "./workspaceRowNeedsAttention";

const base = {
	isUnread: false,
	workspaceStatus: null,
	isActive: false,
	isSelected: false,
	isCreatePending: false,
};

test("an unread row, or one whose agent waits on an answer, needs attention", () => {
	expect(workspaceRowNeedsAttention({ ...base, isUnread: true })).toBe(true);
	expect(
		workspaceRowNeedsAttention({ ...base, workspaceStatus: "permission" }),
	).toBe(true);
});

test("a working or quiet row does not", () => {
	expect(
		workspaceRowNeedsAttention({ ...base, workspaceStatus: "working" }),
	).toBe(false);
	expect(workspaceRowNeedsAttention(base)).toBe(false);
});

test("the open, selected or still-creating row never does", () => {
	expect(
		workspaceRowNeedsAttention({ ...base, isUnread: true, isActive: true }),
	).toBe(false);
	expect(
		workspaceRowNeedsAttention({ ...base, isUnread: true, isSelected: true }),
	).toBe(false);
	expect(
		workspaceRowNeedsAttention({
			...base,
			workspaceStatus: "permission",
			isCreatePending: true,
		}),
	).toBe(false);
});
