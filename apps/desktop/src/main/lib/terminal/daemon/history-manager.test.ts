import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string | undefined;

afterEach(() => {
	if (home) rmSync(home, { recursive: true, force: true });
	home = undefined;
});

const harness = `
	import { HistoryManager } from ${JSON.stringify(join(import.meta.dir, "history-manager.ts"))};
	import { HistoryReader, HistoryWriter } from ${JSON.stringify(join(import.meta.dir, "../../terminal-history.ts"))};

	const gate = () => {
		let release;
		let fail;
		const promise = new Promise((resolve, reject) => { release = resolve; fail = reject; });
		return { promise, release, fail };
	};
	let closeGate;
	let initGate;
	const closes = [];
	const inits = [];
	const open = new Set();
	const originalClose = HistoryWriter.prototype.close;
	const originalInit = HistoryWriter.prototype.init;
	HistoryWriter.prototype.close = function (...args) {
		open.delete(this);
		const held = closeGate?.promise ?? Promise.resolve();
		const closing = held.then(() => originalClose.apply(this, args));
		closes.push(closing);
		return closing;
	};
	HistoryWriter.prototype.init = function (...args) {
		const held = initGate?.promise ?? Promise.resolve();
		const initializing = held
			.then(() => originalInit.apply(this, args))
			.then(() => { open.add(this); });
		inits.push(initializing);
		return initializing;
	};
	const tick = () => new Promise((resolve) => setImmediate(resolve));

	const manager = new HistoryManager();
	const session = { workspaceId: "ws", cwd: "/tmp", cols: 80, rows: 24 };
	const getSession = () => session;
	await manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "old" });
`;

const report = `
	for (;;) {
		const count = closes.length + inits.length;
		await Promise.allSettled([...closes, ...inits]);
		await tick();
		if (count === closes.length + inits.length) break;
	}
	const reader = new HistoryReader("ws", "pane");
	const meta = await reader.readMetadata();
	await manager.cleanup();
	const history = await reader.readScrollback();
	console.log(JSON.stringify({ history, restorable: !!meta && !meta.endedAt, open: open.size }));
	process.exit(0);
`;

function runScenario(body: string) {
	home = mkdtempSync(join(tmpdir(), "history-manager-"));
	const result = Bun.spawnSync(
		[process.execPath, "-e", harness + body + report],
		{ env: { ...process.env, SUPERSET_HOME_DIR: home }, timeout: 3000 },
	);
	expect(result.stderr.toString()).toBe("");
	expect(result.exitCode).toBe(0);
	const { open, ...outcome } = JSON.parse(result.stdout.toString());
	expect(open).toBe(0);
	return outcome;
}

test("clear scrollback replaces the history once the old writer closes and keeps output from during the close", () => {
	expect(
		runScenario(`
			closeGate = gate();
			manager.writeToHistory("pane", "x\\x1b[3Jafter", getSession);
			await tick();
			await Promise.all(inits);
			manager.writeToHistory("pane", "-during", getSession);
			closeGate.release();
		`),
	).toEqual({ history: "after-during", restorable: true });
});

test("a pane recreated while a clear waits for its close keeps the new history", () => {
	expect(
		runScenario(`
			closeGate = gate();
			manager.writeToHistory("pane", "\\x1b[3Jstale", getSession);
			manager.closeHistoryWriter("pane");
			initGate = gate();
			manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "fresh" });
			manager.writeToHistory("pane", "-next", getSession);
			closeGate.release();
			await Promise.all(closes);
			await tick();
			initGate.release();
		`),
	).toEqual({ history: "fresh-next", restorable: true });
});

test("a history reset while a clear waits for its close keeps the reset history", () => {
	expect(
		runScenario(`
			closeGate = gate();
			manager.writeToHistory("pane", "\\x1b[3Jstale", getSession);
			initGate = gate();
			const reset = manager.resetAll(new Map([["pane", { ...session, isAlive: true }]]));
			await tick();
			manager.writeToHistory("pane", "next", getSession);
			closeGate.release();
			await Promise.all(closes);
			await tick();
			initGate.release();
			await reset;
		`),
	).toEqual({ history: "next", restorable: true });
});

test("a superseded init that fails leaves the newer init's history", () => {
	expect(
		runScenario(`
			console.error = () => {};
			const stale = gate();
			initGate = stale;
			manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "stale" });
			while (inits.length < 2) await tick();
			initGate = undefined;
			const fresh = manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "fresh" });
			manager.writeToHistory("pane", "-next", getSession);
			stale.fail(new Error("disk"));
			await fresh;
		`),
	).toEqual({ history: "fresh-next", restorable: true });
});

test("a superseded init that finishes last leaves the newer init's history", () => {
	expect(
		runScenario(`
			const stale = gate();
			initGate = stale;
			manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "stale" });
			while (inits.length < 2) await tick();
			initGate = undefined;
			const fresh = manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "fresh" });
			await Promise.all(inits.slice(2));
			stale.release();
			await fresh;
			manager.writeToHistory("pane", "-next", getSession);
		`),
	).toEqual({ history: "fresh-next", restorable: true });
});

test("a pane that exits while its history initializes is not restorable", () => {
	expect(
		runScenario(`
			const held = gate();
			initGate = held;
			manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "snap" });
			while (inits.length < 2) await tick();
			manager.closeHistoryWriter("pane", 0);
			held.release();
		`),
	).toEqual({ history: "snap", restorable: false });
});

test("history deleted while it initializes stays deleted", () => {
	expect(
		runScenario(`
			const held = gate();
			initGate = held;
			manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "snap" });
			while (inits.length < 2) await tick();
			const deleting = manager.cleanupHistory("pane", "ws");
			held.release();
			await deleting;
		`),
	).toEqual({ history: null, restorable: false });
});
