import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	Pty,
	PtyOnData,
	PtyOnExit,
	SpawnOptions,
} from "../src/Pty/index.ts";
import * as ptyModule from "../src/Pty/index.ts";
import type { ProcessInfo } from "../src/process-tree.ts";
import type { SessionMeta } from "../src/protocol/index.ts";
import { Server } from "../src/Server/Server.ts";
import {
	accumulatedOutputAsString,
	connect,
	connectAndHello,
} from "./helpers/client.ts";

let nextPid = 50_000;
let server: Server | null = null;

class FdBackedPty implements Pty {
	readonly pid = nextPid++;
	meta: SessionMeta;
	readonly fd = fs.openSync("/dev/null", "r");
	disposeCalls = 0;
	killSignals: NodeJS.Signals[] = [];
	killTables: Array<ProcessInfo[] | null | undefined> = [];
	private markKilled!: () => void;
	readonly killed = new Promise<void>((resolve) => {
		this.markKilled = resolve;
	});
	private disposed = false;
	private readonly dataCallbacks: PtyOnData[] = [];
	private readonly exitCallbacks: PtyOnExit[] = [];

	constructor(meta: SessionMeta) {
		this.meta = meta;
	}

	write(): void {}
	resize(cols: number, rows: number): void {
		this.meta = { ...this.meta, cols, rows };
	}
	kill(signal: NodeJS.Signals = "SIGHUP", table?: ProcessInfo[] | null): void {
		this.killSignals.push(signal);
		this.killTables.push(table);
		this.markKilled();
	}
	onData(cb: PtyOnData): void {
		this.dataCallbacks.push(cb);
	}
	onExit(cb: PtyOnExit): void {
		this.exitCallbacks.push(cb);
	}
	pause(): void {}
	resume(): void {}
	getMasterFd(): number {
		return this.fd;
	}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.disposeCalls++;
		fs.closeSync(this.fd);
	}
	emitData(data: Buffer): void {
		for (const cb of this.dataCallbacks) cb(data);
	}
	fireExit(): void {
		for (const cb of this.exitCallbacks) cb({ code: 0, signal: null });
	}
}

function fdIsOpen(fd: number): boolean {
	try {
		fs.fstatSync(fd);
		return true;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EBADF") return false;
		throw err;
	}
}

function socketPath(label: string): string {
	return path.join(
		os.tmpdir(),
		`pty-daemon-${label}-${process.pid}-${nextPid}.sock`,
	);
}

async function waitForCondition(
	predicate: () => boolean,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error(`condition timed out after ${timeoutMs}ms`);
		}
		await new Promise((r) => setTimeout(r, 5));
	}
}

async function listenWithFds(
	label: string,
): Promise<{ socket: string; spawned: FdBackedPty[] }> {
	const socket = socketPath(label);
	const spawned: FdBackedPty[] = [];
	server = new Server({
		socketPath: socket,
		daemonVersion: "test",
		spawnPty: ({ meta }: SpawnOptions) => {
			const pty = new FdBackedPty(meta);
			spawned.push(pty);
			return pty;
		},
	});
	await server.listen();
	return { socket, spawned };
}

afterEach(async () => {
	if (server) await server.close();
	server = null;
});

describe("PTY master-fd ownership", () => {
	test("natural exits do not leak real fds across high churn", async () => {
		const { socket, spawned } = await listenWithFds("natural-churn");
		const client = await connectAndHello(socket);
		try {
			for (let i = 0; i < 128; i++) {
				const id = `churn-${i}`;
				const opened = client.waitForNext(
					(m) => m.type === "open-ok" && m.id === id,
				);
				client.send({
					type: "open",
					id,
					meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
				});
				await opened;
				const pty = spawned[i];
				if (!pty) throw new Error(`missing PTY ${i}`);
				expect(fdIsOpen(pty.fd)).toBe(true);
				pty.fireExit();
				expect(fdIsOpen(pty.fd)).toBe(false);
				pty.dispose();
				expect(pty.disposeCalls).toBe(1);
			}
		} finally {
			await client.close();
		}
	});

	test("explicit close signals before disposing the master fd", async () => {
		const { socket, spawned } = await listenWithFds("explicit-close");
		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "close-me",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor((m) => m.type === "open-ok" && m.id === "close-me");
			const pty = spawned[0];
			if (!pty) throw new Error("missing PTY");
			client.send({ type: "close", id: "close-me" });
			await client.waitFor((m) => m.type === "closed" && m.id === "close-me");
			expect(pty.killSignals).toEqual(["SIGHUP"]);
			expect(fdIsOpen(pty.fd)).toBe(false);
			pty.fireExit();
		} finally {
			await client.close();
		}
	});

	test("a stale exit cannot delete a replacement with the same id", async () => {
		const { socket, spawned } = await listenWithFds("recycled-id");
		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "recycled",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor((m) => m.type === "open-ok" && m.id === "recycled");
			const original = spawned[0];
			if (!original) throw new Error("missing original PTY");

			client.send({ type: "close", id: "recycled" });
			await client.waitFor((m) => m.type === "closed" && m.id === "recycled");

			const replacementOpened = client.waitForNext(
				(m) => m.type === "open-ok" && m.id === "recycled",
			);
			client.send({
				type: "open",
				id: "recycled",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await replacementOpened;
			const replacement = spawned[1];
			if (!replacement) throw new Error("missing replacement PTY");

			original.fireExit();
			const listed = client.waitForNext((m) => m.type === "list-reply");
			client.send({ type: "list" });
			const reply = await listed;
			expect(reply.type).toBe("list-reply");
			if (reply.type === "list-reply") {
				expect(reply.sessions).toEqual([
					expect.objectContaining({
						id: "recycled",
						pid: replacement.pid,
						alive: true,
					}),
				]);
			}
			expect(fdIsOpen(replacement.fd)).toBe(true);
		} finally {
			await client.close();
		}
	});

	test("normal daemon shutdown disposes every owned master fd", async () => {
		const { socket, spawned } = await listenWithFds("shutdown");
		const client = await connectAndHello(socket);
		client.send({
			type: "open",
			id: "shutdown-me",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((m) => m.type === "open-ok" && m.id === "shutdown-me");
		const pty = spawned[0];
		if (!pty) throw new Error("missing PTY");
		await server?.close();
		server = null;
		expect(pty.killSignals).toEqual(["SIGKILL"]);
		expect(fdIsOpen(pty.fd)).toBe(false);
	});

	test("successful handoff close leaves predecessor descriptors untouched", async () => {
		const { socket, spawned } = await listenWithFds("handoff");
		const client = await connectAndHello(socket);
		client.send({
			type: "open",
			id: "handoff-me",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((m) => m.type === "open-ok" && m.id === "handoff-me");
		const pty = spawned[0];
		if (!pty) throw new Error("missing PTY");
		await server?.close({ killSessions: false });
		server = null;
		expect(pty.killSignals).toEqual([]);
		expect(pty.disposeCalls).toBe(0);
		expect(fdIsOpen(pty.fd)).toBe(true);
		pty.dispose();
	});

	test("close does not stall concurrent hello/list probes while process table read is pending", async () => {
		let markReadStarted!: () => void;
		const readStarted = new Promise<void>((resolve) => {
			markReadStarted = resolve;
		});
		let resolveTable!: (table: ProcessInfo[] | null) => void;
		const tablePromise = new Promise<ProcessInfo[] | null>((resolve) => {
			resolveTable = resolve;
		});
		const socket = socketPath("nonblocking-close");
		const spawned: FdBackedPty[] = [];
		server = new Server({
			socketPath: socket,
			daemonVersion: "test",
			spawnPty: ({ meta }: SpawnOptions) => {
				const pty = new FdBackedPty(meta);
				spawned.push(pty);
				return pty;
			},
			readProcessTable: () => {
				markReadStarted();
				return tablePromise;
			},
		});
		await server.listen();

		const client = await connectAndHello(socket);
		let probe: Awaited<ReturnType<typeof connectAndHello>> | null = null;
		try {
			client.send({
				type: "open",
				id: "slow-close",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor(
				(m) => m.type === "open-ok" && m.id === "slow-close",
			);
			const pty = spawned[0];
			if (!pty) throw new Error("missing PTY");

			client.send({ type: "close", id: "slow-close" });
			await readStarted;
			expect(pty.killSignals).toEqual([]);
			expect(fdIsOpen(pty.fd)).toBe(true);

			// Another client must still complete hello + list immediately while
			// close's process-table read has not resolved yet.
			probe = await connectAndHello(socket);
			const listed = probe.waitForNext((m) => m.type === "list-reply", 500);
			probe.send({ type: "list" });
			await listed;

			resolveTable([]);
			await client.waitFor(
				(m) => m.type === "closed" && m.id === "slow-close",
				500,
			);
			expect(pty.killSignals).toEqual(["SIGHUP"]);
			expect(fdIsOpen(pty.fd)).toBe(false);
			pty.fireExit();
		} finally {
			resolveTable([]);
			await probe?.close();
			await client.close();
		}
	});

	test("output from a closing replaced session cannot reach subscribers to its replacement", async () => {
		let resolveTable!: (table: ProcessInfo[] | null) => void;
		const tablePromise = new Promise<ProcessInfo[] | null>((resolve) => {
			resolveTable = resolve;
		});
		const socket = socketPath("replaced-output");
		const spawned: FdBackedPty[] = [];
		server = new Server({
			socketPath: socket,
			daemonVersion: "test",
			spawnPty: ({ meta }: SpawnOptions) => {
				const pty = new FdBackedPty(meta);
				spawned.push(pty);
				return pty;
			},
			readProcessTable: () => tablePromise,
		});
		await server.listen();

		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "recycled-output",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor(
				(m) => m.type === "open-ok" && m.id === "recycled-output",
			);
			const original = spawned[0];
			if (!original) throw new Error("missing original PTY");

			// Start close (sets exited=true immediately while awaiting tablePromise),
			// then recycle the same session id before original's PTY is disposed.
			client.send({ type: "close", id: "recycled-output" });
			const replacementOpened = client.waitForNext(
				(m) => m.type === "open-ok" && m.id === "recycled-output",
			);
			client.send({
				type: "open",
				id: "recycled-output",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await replacementOpened;
			const replacement = spawned[1];
			if (!replacement) throw new Error("missing replacement PTY");

			const subscribed = client.waitForNext((m) => m.type === "list-reply");
			client.send({
				type: "subscribe",
				id: "recycled-output",
				replay: true,
			});
			client.send({ type: "list" });
			await subscribed;

			const replacementOutput = client.waitForNext(
				(m) => m.type === "output" && m.id === "recycled-output",
			);
			original.emitData(Buffer.from("stale-from-old"));
			replacement.emitData(Buffer.from("fresh-from-replacement"));
			await replacementOutput;

			expect(accumulatedOutputAsString(client, "recycled-output")).toBe(
				"fresh-from-replacement",
			);

			resolveTable([]);
			await client.waitFor(
				(m) => m.type === "closed" && m.id === "recycled-output",
				500,
			);
			expect(original.killSignals).toEqual(["SIGHUP"]);
			expect(fdIsOpen(original.fd)).toBe(false);
			expect(fdIsOpen(replacement.fd)).toBe(true);
		} finally {
			resolveTable([]);
			await client.close();
		}
	});

	test("Server.close stops accepting new connections before awaiting process table", async () => {
		let markReadStarted!: () => void;
		const readStarted = new Promise<void>((resolve) => {
			markReadStarted = resolve;
		});
		let resolveTable!: (table: ProcessInfo[] | null) => void;
		const tablePromise = new Promise<ProcessInfo[] | null>((resolve) => {
			resolveTable = resolve;
		});
		const socket = socketPath("shutdown-reject");
		const spawned: FdBackedPty[] = [];
		server = new Server({
			socketPath: socket,
			daemonVersion: "test",
			spawnPty: ({ meta }: SpawnOptions) => {
				const pty = new FdBackedPty(meta);
				spawned.push(pty);
				return pty;
			},
			readProcessTable: () => {
				markReadStarted();
				return tablePromise;
			},
		});
		await server.listen();

		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "shutting-down",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor(
				(m) => m.type === "open-ok" && m.id === "shutting-down",
			);
			const pty = spawned[0];
			if (!pty) throw new Error("missing PTY");

			const closePromise = server.close();
			await readStarted;
			expect(pty.killSignals).toEqual([]);

			const sentinelTable: ProcessInfo[] = [
				{ pid: 99_999, ppid: 1, pgid: 99_999, tty: null },
			];
			// New connections arriving while readProcessTable is pending must not keep
			// the server open or stall server.close().
			try {
				await expect(connect(socket)).rejects.toThrow();
			} finally {
				resolveTable(sentinelTable);
			}

			await closePromise;
			server = null;
			expect(pty.killSignals).toEqual(["SIGKILL"]);
			expect(pty.killTables).toEqual([sentinelTable]);
			expect(fdIsOpen(pty.fd)).toBe(false);
		} finally {
			resolveTable([]);
			await client.close();
		}
	});

	test("Server.close awaits pending close operations for replaced sessions", async () => {
		let markCloseReadStarted!: () => void;
		const closeReadStarted = new Promise<void>((resolve) => {
			markCloseReadStarted = resolve;
		});
		let markShutdownReadStarted!: () => void;
		const shutdownReadStarted = new Promise<void>((resolve) => {
			markShutdownReadStarted = resolve;
		});
		let resolveCloseTable!: (table: ProcessInfo[] | null) => void;
		const closeTablePromise = new Promise<ProcessInfo[] | null>((resolve) => {
			resolveCloseTable = resolve;
		});
		let calls = 0;
		const socket = socketPath("shutdown-pending-close");
		const spawned: FdBackedPty[] = [];
		server = new Server({
			socketPath: socket,
			daemonVersion: "test",
			spawnPty: ({ meta }: SpawnOptions) => {
				const pty = new FdBackedPty(meta);
				spawned.push(pty);
				return pty;
			},
			readProcessTable: () => {
				calls += 1;
				if (calls === 1) {
					markCloseReadStarted();
					return closeTablePromise;
				}
				markShutdownReadStarted();
				return Promise.resolve([]);
			},
		});
		await server.listen();

		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "reopened",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor((m) => m.type === "open-ok" && m.id === "reopened");
			const original = spawned[0];
			if (!original) throw new Error("missing original PTY");

			client.send({ type: "close", id: "reopened" });
			await closeReadStarted;

			// Replace the id while the original close is still reading the process table.
			const replacementOpened = client.waitForNext(
				(m) => m.type === "open-ok" && m.id === "reopened",
			);
			client.send({
				type: "open",
				id: "reopened",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await replacementOpened;
			const replacement = spawned[1];
			if (!replacement) throw new Error("missing replacement PTY");

			let shutdownSettled = false;
			const shutdownPromise = server.close().then(() => {
				shutdownSettled = true;
			});
			await shutdownReadStarted;
			await replacement.killed;
			expect(shutdownSettled).toBe(false);
			expect(replacement.killSignals).toEqual(["SIGKILL"]);
			expect(original.killSignals).toEqual([]);

			resolveCloseTable([]);
			await shutdownPromise;
			server = null;
			expect(original.killSignals).toEqual(["SIGHUP"]);
			expect(fdIsOpen(original.fd)).toBe(false);
		} finally {
			resolveCloseTable([]);
			await client.close();
		}
	});

	test("finalizeHandoff awaits pending close operations and pending kill escalations before exiting", async () => {
		let markReadStarted!: () => void;
		const readStarted = new Promise<void>((resolve) => {
			markReadStarted = resolve;
		});
		let resolveTable!: (table: ProcessInfo[] | null) => void;
		const tablePromise = new Promise<ProcessInfo[] | null>((resolve) => {
			resolveTable = resolve;
		});
		let markDrainStarted!: () => void;
		const drainStarted = new Promise<void>((resolve) => {
			markDrainStarted = resolve;
		});
		let resolveDrain!: () => void;
		const drainPromise = new Promise<void>((resolve) => {
			resolveDrain = resolve;
		});
		const socket = socketPath("handoff-pending-close");
		const spawned: FdBackedPty[] = [];
		server = new Server({
			socketPath: socket,
			daemonVersion: "test",
			spawnPty: ({ meta }: SpawnOptions) => {
				const pty = new FdBackedPty(meta);
				spawned.push(pty);
				return pty;
			},
			readProcessTable: () => {
				markReadStarted();
				return tablePromise;
			},
		});
		await server.listen();

		const client = await connectAndHello(socket);
		const closeSpy = spyOn(server, "close");
		const drainSpy = spyOn(ptyModule, "drainPendingKills").mockImplementation(
			() => {
				markDrainStarted();
				return drainPromise;
			},
		);
		let markExitCalled!: (code?: number) => void;
		let exitResolved = false;
		const exitCalled = new Promise<number | undefined>((resolve) => {
			markExitCalled = (code) => {
				exitResolved = true;
				resolve(code);
			};
		});
		const exitSpy = spyOn(process, "exit").mockImplementation(((
			code?: number,
		) => {
			markExitCalled(code);
		}) as never);
		try {
			client.send({
				type: "open",
				id: "closing-before-handoff",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor(
				(m) => m.type === "open-ok" && m.id === "closing-before-handoff",
			);
			const pty = spawned[0];
			if (!pty) throw new Error("missing PTY");

			client.send({ type: "close", id: "closing-before-handoff" });
			await readStarted;
			expect(pty.killSignals).toEqual([]);

			let handoffSettled = false;
			const handoffPromise = (
				server as unknown as { finalizeHandoff: () => Promise<void> }
			)
				.finalizeHandoff()
				.then(() => {
					handoffSettled = true;
				});
			await waitForCondition(() => !fs.existsSync(socket));

			// Must unlink the owned socket via close({ killSessions: false }) right
			// away, yet wait for pendingCloses before draining kills or exiting.
			expect(closeSpy).toHaveBeenCalledWith({ killSessions: false });
			expect(fs.existsSync(socket)).toBe(false);
			expect(drainSpy).not.toHaveBeenCalled();
			expect(handoffSettled).toBe(false);
			expect(exitSpy).not.toHaveBeenCalled();

			resolveTable([]);
			await drainStarted;

			// After pendingCloses finishes, must await drainPendingKills() without a
			// short cutoff before scheduling process.exit(0).
			expect(pty.killSignals).toEqual(["SIGHUP"]);
			expect(fdIsOpen(pty.fd)).toBe(false);
			expect(drainSpy).toHaveBeenCalledWith();
			expect(handoffSettled).toBe(false);
			await new Promise((r) => setTimeout(r, 70));
			expect(exitSpy).not.toHaveBeenCalled();

			resolveDrain();
			await handoffPromise;
			server = null;

			expect(await exitCalled).toBe(0);
		} finally {
			resolveTable([]);
			resolveDrain();
			drainSpy.mockRestore();
			closeSpy.mockRestore();
			await server?.close();
			server = null;
			// Keep exitSpy installed through any pending 50ms timer from finalizeHandoff().
			if (!exitResolved) {
				await Promise.race([exitCalled, new Promise((r) => setTimeout(r, 80))]);
			}
			exitSpy.mockRestore();
			await client.close();
		}
	});

	test("finalizeHandoff releases the socket before awaiting pendingCloses so a successor bind survives", async () => {
		let markReadStarted!: () => void;
		const readStarted = new Promise<void>((resolve) => {
			markReadStarted = resolve;
		});
		let resolveTable!: (table: ProcessInfo[] | null) => void;
		const tablePromise = new Promise<ProcessInfo[] | null>((resolve) => {
			resolveTable = resolve;
		});
		let markDrainStarted!: () => void;
		const drainStarted = new Promise<void>((resolve) => {
			markDrainStarted = resolve;
		});
		let resolveDrain!: () => void;
		const drainPromise = new Promise<void>((resolve) => {
			resolveDrain = resolve;
		});
		const socket = socketPath("rebound-socket");
		const predecessor = new Server({
			socketPath: socket,
			daemonVersion: "predecessor",
			spawnPty: ({ meta }: SpawnOptions) => new FdBackedPty(meta),
			readProcessTable: () => {
				markReadStarted();
				return tablePromise;
			},
		});
		await predecessor.listen();

		const successor = new Server({
			socketPath: socket,
			daemonVersion: "successor",
		});
		const client = await connectAndHello(socket);
		const drainSpy = spyOn(ptyModule, "drainPendingKills").mockImplementation(
			() => {
				markDrainStarted();
				return drainPromise;
			},
		);
		let markExitCalled!: (code?: number) => void;
		let exitResolved = false;
		const exitCalled = new Promise<number | undefined>((resolve) => {
			markExitCalled = (code) => {
				exitResolved = true;
				resolve(code);
			};
		});
		const exitSpy = spyOn(process, "exit").mockImplementation(((
			code?: number,
		) => {
			markExitCalled(code);
		}) as never);
		let probe: Awaited<ReturnType<typeof connectAndHello>> | null = null;
		try {
			client.send({
				type: "open",
				id: "slow-close-before-handoff",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor(
				(m) => m.type === "open-ok" && m.id === "slow-close-before-handoff",
			);

			client.send({ type: "close", id: "slow-close-before-handoff" });
			await readStarted;

			const handoffPromise = (
				predecessor as unknown as { finalizeHandoff: () => Promise<void> }
			).finalizeHandoff();
			await waitForCondition(() => !fs.existsSync(socket));

			// Predecessor already unbound and removed its socket path before
			// pendingCloses finishes, so the successor's 1s fallback can bind now.
			expect(fs.existsSync(socket)).toBe(false);
			await successor.listen();
			const successorStat = fs.lstatSync(socket);

			// Finish pendingCloses + drainPendingKills on the predecessor; it must
			// not unlink the successor's newly bound socket.
			resolveTable([]);
			await drainStarted;
			resolveDrain();
			await handoffPromise;

			expect(fs.existsSync(socket)).toBe(true);
			expect(fs.lstatSync(socket).ino).toBe(successorStat.ino);
			probe = await connectAndHello(socket);
			expect(await exitCalled).toBe(0);
		} finally {
			resolveTable([]);
			resolveDrain();
			drainSpy.mockRestore();
			await probe?.close();
			await client.close();
			await predecessor.close({ killSessions: false });
			await successor.close({ killSessions: false });
			if (!exitResolved) {
				await Promise.race([exitCalled, new Promise((r) => setTimeout(r, 80))]);
			}
			exitSpy.mockRestore();
		}
	});
});
