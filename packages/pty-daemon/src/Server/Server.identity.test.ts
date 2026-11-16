import { afterEach, expect, spyOn, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TERMINAL_VERSION_NAME } from "@superset/shared/constants";
import {
	accumulatedOutputAsString,
	connectAndHello,
} from "../../test/helpers/client.ts";
import type { Pty, PtyOnData, PtyOnExit } from "../Pty/index.ts";
import * as ptyModule from "../Pty/index.ts";
import type { SessionMeta } from "../protocol/index.ts";
import { Server } from "./Server.ts";

const DA2_REPLY = "\x1b[>0;276;0c";
const XTVERSION_REPLY = `\x1bP>|${TERMINAL_VERSION_NAME}\x1b\\`;

class QueryPty implements Pty {
	pid = 12345;
	meta: SessionMeta;
	writes: Buffer[] = [];
	onOutput: PtyOnData = () => {};
	onEnd: PtyOnExit = () => {};
	constructor(meta: SessionMeta) {
		this.meta = meta;
	}
	write(bytes: Buffer) {
		this.writes.push(bytes);
	}
	onData(cb: PtyOnData) {
		this.onOutput = cb;
	}
	onExit(cb: PtyOnExit) {
		this.onEnd = cb;
	}
	resize() {}
	kill() {}
	pause() {}
	resume() {}
	dispose() {}
	getMasterFd() {
		return -1;
	}
}

let server: Server | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

test("answers identity queries before attach and never replays them", async () => {
	const socketPath = join(tmpdir(), `identity-${crypto.randomUUID()}.sock`);
	let pty: QueryPty | undefined;
	server = new Server({
		socketPath,
		daemonVersion: "test",
		spawnPty: ({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	});
	await server.listen();
	const first = await connectAndHello(socketPath);
	const second = await connectAndHello(socketPath);
	try {
		first.send({
			type: "open",
			id: "t",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await first.waitFor((m) => m.type === "open-ok");
		if (!pty) throw new Error("missing pty");
		const queryPty = pty;

		// tmux asks before any renderer has parsed the bytes. The daemon must
		// answer straight to the PTY, before its five-second deadline.
		queryPty.onOutput(Buffer.from("before\x1b[>c\x1b[>qafter"));
		expect(queryPty.writes.map(String)).toEqual([DA2_REPLY, XTVERSION_REPLY]);

		for (const client of [first, second]) {
			client.send({
				type: "subscribe",
				id: "t",
				replay: true,
				modeSnapshot: true,
			});
			await client.waitFor((m) => m.type === "replay-complete");
			// A renderer must never see the query — xterm would answer it a
			// second time and tmux would read the late reply as typed input.
			expect(accumulatedOutputAsString(client, "t")).toBe("beforeafter");
		}
		expect(queryPty.writes).toHaveLength(2);

		const waits = [first, second].map((client) =>
			client.waitForNext((m) => m.type === "output"),
		);
		queryPty.onOutput(Buffer.from("live\x1b[?2026$ptail"));
		await Promise.all(waits);
		expect(queryPty.writes).toHaveLength(3);
		expect(queryPty.writes.at(-1)?.toString()).toBe("\x1b[?2026;2$y");
		for (const client of [first, second])
			expect(accumulatedOutputAsString(client, "t")).toBe(
				"beforeafterlivetail",
			);

		await second.close();
		const reattached = await connectAndHello(socketPath);
		try {
			reattached.send({
				type: "subscribe",
				id: "t",
				replay: true,
				modeSnapshot: true,
			});
			await reattached.waitFor((m) => m.type === "replay-complete");
			expect(accumulatedOutputAsString(reattached, "t")).toBe(
				"beforeafterlivetail",
			);
			expect(queryPty.writes).toHaveLength(3);
		} finally {
			await reattached.close();
		}
	} finally {
		await first.close();
		await second.close();
	}
});

test("legacy snapshots are stripped without replies on adoption or replay", async () => {
	const socketPath = join(
		tmpdir(),
		`identity-legacy-${crypto.randomUUID()}.sock`,
	);
	let pty: QueryPty | undefined;
	const adopt = spyOn(ptyModule, "adoptFromFd").mockImplementation(
		({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	);
	server = new Server({ socketPath, daemonVersion: "test" });
	try {
		server.adoptSnapshot({
			version: 1,
			writtenAt: Date.now(),
			sessions: [
				{
					id: "legacy",
					pid: 12345,
					fdIndex: 3,
					meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
					buffer: Buffer.from("history\x1b[>c\x1b[>q\x1b[?2026$ptail"),
				},
			],
		});
		if (!pty) throw new Error("missing adopted PTY");
		expect(pty.writes).toHaveLength(0);
		await server.listen();
		for (let observer = 0; observer < 2; observer++) {
			const client = await connectAndHello(socketPath);
			try {
				client.send({
					type: "subscribe",
					id: "legacy",
					replay: true,
					modeSnapshot: true,
				});
				await client.waitFor((m) => m.type === "replay-complete");
				expect(accumulatedOutputAsString(client, "legacy")).toBe("historytail");
				expect(pty.writes).toHaveLength(0);
			} finally {
				await client.close();
			}
		}
	} finally {
		adopt.mockRestore();
	}
});

test("a write failure on the reply cannot break PTY output", async () => {
	const socketPath = join(
		tmpdir(),
		`identity-write-${crypto.randomUUID()}.sock`,
	);
	let pty: QueryPty | undefined;
	server = new Server({
		socketPath,
		daemonVersion: "test",
		spawnPty: ({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	});
	await server.listen();
	const client = await connectAndHello(socketPath);
	try {
		client.send({
			type: "open",
			id: "t",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((m) => m.type === "open-ok");
		if (!pty) throw new Error("missing pty");
		const original = pty.write.bind(pty);
		pty.write = (bytes: Buffer) => {
			if (bytes.toString().includes("xterm.js")) throw new Error("exited");
			original(bytes);
		};
		expect(() =>
			pty?.onOutput(Buffer.from("still\x1b[>q\ndelivered")),
		).not.toThrow();
		client.send({
			type: "subscribe",
			id: "t",
			replay: true,
			modeSnapshot: true,
		});
		await client.waitFor((m) => m.type === "replay-complete");
		expect(accumulatedOutputAsString(client, "t")).toBe("still\ndelivered");
	} finally {
		await client.close();
	}
});
