import { describe, expect, test } from "bun:test";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { resolvePhase } from "./resolvePhase";

describe("resolvePhase", () => {
	test("shows nothing while the app is up to date or the status is unknown", () => {
		expect(resolvePhase(undefined, false, false)).toBeNull();
		expect(resolvePhase(AUTO_UPDATE_STATUS.IDLE, false, false)).toBeNull();
		expect(resolvePhase(AUTO_UPDATE_STATUS.CHECKING, false, false)).toBeNull();
	});

	test("a ready update turns into installing once the install starts", () => {
		expect(resolvePhase(AUTO_UPDATE_STATUS.READY, false, false)).toBe("ready");
		expect(resolvePhase(AUTO_UPDATE_STATUS.READY, true, false)).toBe(
			"installing",
		);
	});

	test("an install flag left set does not hide a download or an error", () => {
		expect(resolvePhase(AUTO_UPDATE_STATUS.DOWNLOADING, true, false)).toBe(
			"downloading",
		);
		expect(resolvePhase(AUTO_UPDATE_STATUS.ERROR, true, false)).toBe("error");
	});

	test("the updated confirmation shows until it is done", () => {
		expect(resolvePhase(AUTO_UPDATE_STATUS.UPDATED, false, false)).toBe(
			"updated",
		);
		expect(resolvePhase(AUTO_UPDATE_STATUS.UPDATED, false, true)).toBeNull();
	});
});
