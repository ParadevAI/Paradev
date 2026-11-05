import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	resetManagedEnvForTests,
	setManagedEnv,
} from "../runtime/sandbox-managed-env";
import { buildV2TerminalEnv } from "./env";

const params = {
	baseEnv: { HOME: "/home/ubuntu", PATH: "/usr/bin", SHELL: "/bin/bash" },
	shell: "/bin/bash",
	supersetHomeDir: "/home/ubuntu/.superset",
	organizationId: "org-1",
	cwd: "/workspace",
	terminalId: "term-1",
	workspaceId: "ws-1",
	workspacePath: "/workspace",
	rootPath: "/workspace",
	supersetEnv: "production" as const,
	agentHookPort: "51741",
	agentHookVersion: "2",
};

describe("terminal env in a sandbox", () => {
	let runMode: string | undefined;
	beforeEach(() => {
		runMode = process.env.SUPERSET_HOST_RUN_MODE;
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		resetManagedEnvForTests();
	});
	afterEach(() => {
		if (runMode === undefined) delete process.env.SUPERSET_HOST_RUN_MODE;
		else process.env.SUPERSET_HOST_RUN_MODE = runMode;
		resetManagedEnvForTests();
	});

	test("a terminal opened before the first push carries no variables, only the sandbox marker", () => {
		const env = buildV2TerminalEnv(params);
		expect(env.IS_SANDBOX).toBe("1");
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
	});

	test("a push reaches the next terminal, and a later push does not rewrite an earlier one", () => {
		setManagedEnv({ ANTHROPIC_API_KEY: "placeholder", FOO: "one" });
		const first = buildV2TerminalEnv(params);
		expect(first.ANTHROPIC_API_KEY).toBe("placeholder");
		expect(first.FOO).toBe("one");

		setManagedEnv({ FOO: "two" });
		const second = buildV2TerminalEnv(params);
		expect(second.FOO).toBe("two");
		expect(second.ANTHROPIC_API_KEY).toBeUndefined();
		expect(first.FOO).toBe("one");
	});

	test("a terminal reads as remote, so TUIs copy to the user's clipboard over OSC 52", () => {
		const env = buildV2TerminalEnv(params);
		expect(env.SSH_CONNECTION).toBe("127.0.0.1 0 127.0.0.1 0");
	});

	test("an environment's own SSH_CONNECTION wins", () => {
		setManagedEnv({ SSH_CONNECTION: "10.0.0.1 5000 10.0.0.2 22" });
		const env = buildV2TerminalEnv(params);
		expect(env.SSH_CONNECTION).toBe("10.0.0.1 5000 10.0.0.2 22");
	});

	test("outside a sandbox the managed set is ignored", () => {
		process.env.SUPERSET_HOST_RUN_MODE = "local";
		setManagedEnv({ FOO: "one" });
		const env = buildV2TerminalEnv(params);
		expect(env.FOO).toBeUndefined();
		expect(env.IS_SANDBOX).toBeUndefined();
		expect(env.SSH_CONNECTION).toBeUndefined();
	});
});
