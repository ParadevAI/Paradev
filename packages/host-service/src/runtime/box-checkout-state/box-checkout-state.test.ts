import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	boxCheckoutStatesFromLog,
	readBoxCheckoutStates,
} from "./box-checkout-state";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

describe("readBoxCheckoutStates", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "box-checkout-state-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("reports the current boot's missing base and failed clone per checkout folder", async () => {
		const logPath = join(dir, "boot.log");
		writeFileSync(
			logPath,
			[
				"1789000000000 boot.start pid=1",
				"1789000000100 checkout.base.missing api superset/old",
				"1789000005000 boot.start pid=2",
				"1789000005100 checkout.start",
				"1789000005200 checkout.base.missing api superset/moved",
				"1789000005300 checkout.clone.failed web https://github.com/o/web.git",
				"1789000005400 checkout.cloned docs https://github.com/o/docs.git",
				"1789000005500 checkout.end",
				"",
			].join("\n"),
		);
		const state = await readBoxCheckoutStates(WORKSPACE_ID, {
			SUPERSET_HOST_RUN_MODE: "sandbox",
			SUPERSET_SANDBOX_WORKSPACE_ID: WORKSPACE_ID,
			SUPERSET_SANDBOX_WORKSPACE_PATH: "/workspace",
			SUPERSET_SANDBOX_BOOT_LOG: logPath,
		});
		expect(state("/workspace/api")).toEqual({
			state: "failed",
			reason: "base_missing",
			baseBranch: "superset/moved",
		});
		expect(state("/workspace/web")).toEqual({
			state: "failed",
			reason: "clone_failed",
		});
		expect(state("/workspace/docs")).toBeUndefined();
	});
});

describe("boxCheckoutStatesFromLog", () => {
	it("calls a checkout with no outcome yet cloning until the checkout phase ends", () => {
		const running = boxCheckoutStatesFromLog(
			"1789000005000 boot.start pid=2\n1789000005100 checkout.start\n",
			"/workspace",
		);
		expect(running("/workspace")).toEqual({ state: "cloning" });
		expect(
			boxCheckoutStatesFromLog("", "/workspace")("/workspace"),
		).toBeUndefined();
	});
});
