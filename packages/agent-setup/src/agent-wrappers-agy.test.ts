import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	AGY_HOOKS_NAME,
	createAgyHooksJson,
	getAgyHooksJsonPath,
	removeAgyManagedHooks,
} from "./agent-wrappers-agy";

const originalHome = process.env.HOME;
let testHome: string;

beforeEach(() => {
	testHome = mkdtempSync(path.join(tmpdir(), "agy-hooks-"));
	process.env.HOME = testHome;
});

afterEach(() => {
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	rmSync(testHome, { recursive: true, force: true });
});

function readHooks(): Record<string, Record<string, unknown[]>> {
	return JSON.parse(readFileSync(getAgyHooksJsonPath(), "utf-8"));
}

const otherToolHooks = {
	"orca-status": {
		Stop: [{ type: "command", command: "/bin/sh orca-hook.sh", timeout: 10 }],
	},
};

describe("agy hooks.json", () => {
	it("registers PreInvocation and Stop with the event carried in the command", () => {
		createAgyHooksJson();

		const managed = readHooks()[AGY_HOOKS_NAME];
		expect(Object.keys(managed ?? {})).toEqual(["PreInvocation", "Stop"]);
		const [start] = managed?.PreInvocation as Array<{ command: string }>;
		const [stop] = managed?.Stop as Array<{ command: string }>;
		expect(start?.command).toContain(
			"SUPERSET_HOOK_HARNESS=agy SUPERSET_HOOK_EVENT=Start ",
		);
		expect(stop?.command).toContain(
			"SUPERSET_HOOK_HARNESS=agy SUPERSET_HOOK_EVENT=Stop ",
		);
	});

	it("keeps other tools' hook sets and does not duplicate on re-run", () => {
		mkdirSync(path.dirname(getAgyHooksJsonPath()), { recursive: true });
		writeFileSync(getAgyHooksJsonPath(), JSON.stringify(otherToolHooks));

		createAgyHooksJson();
		createAgyHooksJson();

		const hooks = readHooks();
		expect(hooks["orca-status"]).toEqual(otherToolHooks["orca-status"]);
		expect(hooks[AGY_HOOKS_NAME]?.Stop).toHaveLength(1);
	});

	it("teardown removes only the Paradev hook set", () => {
		mkdirSync(path.dirname(getAgyHooksJsonPath()), { recursive: true });
		writeFileSync(getAgyHooksJsonPath(), JSON.stringify(otherToolHooks));
		createAgyHooksJson();

		removeAgyManagedHooks();

		expect(readHooks()).toEqual(otherToolHooks);
	});

	it("never clobbers a hooks.json it cannot parse", () => {
		mkdirSync(path.dirname(getAgyHooksJsonPath()), { recursive: true });
		writeFileSync(getAgyHooksJsonPath(), "{ not json");

		createAgyHooksJson();

		expect(readFileSync(getAgyHooksJsonPath(), "utf-8")).toBe("{ not json");
	});

	it("teardown does not create the file", () => {
		removeAgyManagedHooks();
		expect(existsSync(getAgyHooksJsonPath())).toBe(false);
	});
});
