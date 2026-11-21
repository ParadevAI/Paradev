// The `listed` terminal:lifecycle event, against a real pty-daemon and host DB.
// Same harness as terminal.initial-command.node-test.ts.

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import type { EventBus, TerminalLifecycleEvent } from "../events/index.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-listed-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-listed-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let workspaceId: string;

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-listed-e2e",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-listed-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/sh");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? TEST_HOME,
		SHELL: "/bin/sh",
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	const projectId = randomUUID();
	workspaceId = randomUUID();
	db.insert(projects).values({ id: projectId, repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath,
			branch: "main",
		})
		.run();
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	await server.close();
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

function recordingEventBus() {
	const events: TerminalLifecycleEvent[] = [];
	const eventBus = {
		broadcastTerminalLifecycle: (message: TerminalLifecycleEvent) =>
			events.push(message),
	} as unknown as EventBus;
	const listedIds = () =>
		events
			.filter((event) => event.eventType === "listed")
			.map((event) => event.terminalId);
	return { eventBus, listedIds };
}

describe("terminal listed lifecycle event", () => {
	test("a new listed terminal is announced once, so renderers see it without polling", async () => {
		const terminalId = `e2e-listed-${randomUUID().slice(0, 8)}`;
		const { eventBus, listedIds } = recordingEventBus();
		const create = () =>
			createTerminalSessionInternal({ terminalId, workspaceId, db, eventBus });
		const session = await create();
		assert.ok(!("error" in session), "error" in session ? session.error : "");
		await create();
		assert.deepEqual(listedIds(), [terminalId]);
		await disposeSessionAndWait(terminalId, db);
	});

	test("an unlisted terminal is announced when it joins the list", async () => {
		const terminalId = `e2e-unlisted-${randomUUID().slice(0, 8)}`;
		const { eventBus, listedIds } = recordingEventBus();
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			eventBus,
			listed: false,
		});
		assert.ok(!("error" in session), "error" in session ? session.error : "");
		assert.deepEqual(listedIds(), []);
		await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			eventBus,
		});
		assert.deepEqual(listedIds(), [terminalId]);
		await disposeSessionAndWait(terminalId, db);
	});
});
