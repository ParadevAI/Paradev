import { expect, test } from "bun:test";
import { emphasizeWorkspaceRowName } from "./emphasizeWorkspaceRowName";

const base = {
	needsAttention: false,
	isActive: false,
	isSelected: false,
	isCreatePending: false,
};

test("a row needing attention is emphasized; a quiet one is not", () => {
	expect(emphasizeWorkspaceRowName({ ...base, needsAttention: true })).toBe(
		true,
	);
	expect(emphasizeWorkspaceRowName(base)).toBe(false);
});

test("the open, selected or still-creating row is never emphasized", () => {
	for (const guard of ["isActive", "isSelected", "isCreatePending"] as const) {
		expect(
			emphasizeWorkspaceRowName({
				...base,
				needsAttention: true,
				[guard]: true,
			}),
		).toBe(false);
	}
});
