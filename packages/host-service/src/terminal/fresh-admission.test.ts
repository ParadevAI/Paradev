import { expect, test } from "bun:test";
import {
	invalidateFreshAdmission,
	readFreshAdmission,
	registerFreshAdmission,
} from "./fresh-admission";

test("only an owned fresh, complete, untouched terminal stream admits attachment", () => {
	const session = {};
	let data: Uint8Array | null = new Uint8Array([1, 2]);
	expect(readFreshAdmission(session, "terminal", "workspace")).toBeNull();
	registerFreshAdmission(session, {
		terminalId: "terminal",
		workspaceId: "workspace",
		read: () => data,
	});
	expect(readFreshAdmission(session, "terminal", "other")).toBeNull();
	const result = readFreshAdmission(session, "terminal", "workspace");
	expect(result).toEqual(data);
	expect(result).not.toBe(data);
	data = new Uint8Array(16 * 1024 + 1);
	expect(readFreshAdmission(session, "terminal", "workspace")).toBeNull();
	data = new Uint8Array([3]);
	invalidateFreshAdmission(session);
	expect(readFreshAdmission(session, "terminal", "workspace")).toBeNull();
});
