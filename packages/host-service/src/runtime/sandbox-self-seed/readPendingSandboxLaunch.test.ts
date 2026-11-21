import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPendingSandboxLaunch } from "./sandbox-self-seed";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TERMINAL_ID = "33333333-3333-4333-8333-333333333333";

let dir: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pending-launch-test-"));
	env = {
		SUPERSET_HOST_RUN_MODE: "sandbox",
		SUPERSET_SANDBOX_WORKSPACE_ID: WORKSPACE_ID,
		SUPERSET_SANDBOX_WORKSPACE_PATH: "/workspace",
		SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
			{ url: "https://github.com/acme/app", branch: "main", path: "." },
		]),
		HOST_DB_PATH: join(dir, "host.db"),
		SUPERSET_SANDBOX_AGENT: "claude",
		SUPERSET_SANDBOX_AGENT_PROMPT: "fix the login bug",
		SUPERSET_SANDBOX_AGENT_TERMINAL_ID: TERMINAL_ID,
	};
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

test("describes the launch until the box claims it", async () => {
	expect(await readPendingSandboxLaunch(WORKSPACE_ID, env)).toMatchObject({
		agent: "claude",
		surface: "terminal",
		terminalId: TERMINAL_ID,
		prompt: "fix the login bug",
	});
	writeFileSync(join(dir, "agent-launched"), "claude now\n");
	expect(await readPendingSandboxLaunch(WORKSPACE_ID, env)).toBeNull();
});

test("keeps a chat launch's surface", async () => {
	env.SUPERSET_SANDBOX_AGENT_SURFACE = "chat";
	expect(await readPendingSandboxLaunch(WORKSPACE_ID, env)).toMatchObject({
		surface: "chat",
	});
});

test("is null outside sandbox mode", async () => {
	env.SUPERSET_HOST_RUN_MODE = "local";
	expect(await readPendingSandboxLaunch(WORKSPACE_ID, env)).toBeNull();
});

test("is null for another workspace, an idle box, or a launch with no promised terminal", async () => {
	expect(await readPendingSandboxLaunch("other-workspace", env)).toBeNull();
	const { SUPERSET_SANDBOX_AGENT_TERMINAL_ID: _id, ...unpromised } = env;
	expect(await readPendingSandboxLaunch(WORKSPACE_ID, unpromised)).toBeNull();
	const { SUPERSET_SANDBOX_AGENT: _agent, ...idle } = env;
	expect(await readPendingSandboxLaunch(WORKSPACE_ID, idle)).toBeNull();
});
