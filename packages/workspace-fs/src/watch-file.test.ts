import { afterEach, describe, expect, it, spyOn } from "bun:test";
import * as fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FsWatchEvent } from "./types";
import { watchSingleFile } from "./watch-file";

const tempRoots: string[] = [];
const disposers: Array<() => void> = [];

afterEach(async () => {
	for (const dispose of disposers.splice(0)) dispose();
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

async function createTempFile(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "watch-file-"));
	tempRoots.push(dir);
	const file = path.join(dir, "target.env");
	await fs.writeFile(file, "initial");
	return file;
}

async function waitFor(
	events: FsWatchEvent[],
	predicate: (e: FsWatchEvent) => boolean,
	timeoutMs = 8_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!events.some(predicate)) {
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out. seen: ${events.map((e) => e.kind).join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("watchSingleFile", () => {
	it("emits update on in-place writes", async () => {
		const file = await createTempFile();
		const events: FsWatchEvent[] = [];
		disposers.push(
			watchSingleFile(file, (e) => events.push(e), { debounceMs: 25 }),
		);
		await new Promise((r) => setTimeout(r, 150));

		await fs.writeFile(file, "changed");
		await waitFor(events, (e) => e.kind === "update");
	}, 15_000);

	it("emits update on a same-size rewrite that restores the mtime", async () => {
		const file = await createTempFile();
		const before = await fs.stat(file);
		const events: FsWatchEvent[] = [];
		disposers.push(
			watchSingleFile(file, (e) => events.push(e), { debounceMs: 25 }),
		);
		await new Promise((r) => setTimeout(r, 150));

		await fs.writeFile(file, "changed");
		await fs.utimes(file, before.atimeMs / 1000, before.mtimeMs / 1000);
		await waitFor(events, (e) => e.kind === "update", 1_000);
	});

	it("emits update on a watch event even when the file signature is unchanged", async () => {
		const realWatch = fsSync.watch;
		const listeners: Array<() => void> = [];
		const watchSpy = spyOn(fsSync, "watch").mockImplementation(((
			target: string,
			listener: () => void,
		) => {
			listeners.push(listener);
			return realWatch(target, () => {});
		}) as typeof fsSync.watch);
		const file = await createTempFile();
		const events: FsWatchEvent[] = [];
		try {
			disposers.push(
				watchSingleFile(file, (e) => events.push(e), { debounceMs: 5 }),
			);
			await new Promise((r) => setTimeout(r, 50));
			expect(listeners).toHaveLength(1);

			listeners[0]?.();
			await waitFor(events, (e) => e.kind === "update", 1_000);
		} finally {
			watchSpy.mockRestore();
		}
	});

	it("survives an atomic save (write-temp + rename over the path)", async () => {
		const file = await createTempFile();
		const events: FsWatchEvent[] = [];
		disposers.push(
			watchSingleFile(file, (e) => events.push(e), { debounceMs: 25 }),
		);
		await new Promise((r) => setTimeout(r, 150));

		// First atomic replace — swaps the inode out from under the watch.
		const temp1 = `${file}.tmp1`;
		await fs.writeFile(temp1, "v2");
		await fs.rename(temp1, file);
		await waitFor(events, (e) => e.kind === "update");

		// Second replace must still be observed (the watch re-installed).
		events.length = 0;
		const temp2 = `${file}.tmp2`;
		await fs.writeFile(temp2, "v3");
		await fs.rename(temp2, file);
		await waitFor(events, (e) => e.kind === "update");
	}, 15_000);

	it("emits delete, then create when the file reappears", async () => {
		const file = await createTempFile();
		const events: FsWatchEvent[] = [];
		disposers.push(
			watchSingleFile(file, (e) => events.push(e), {
				debounceMs: 25,
				pollMs: 100,
			}),
		);
		await new Promise((r) => setTimeout(r, 150));

		await fs.rm(file);
		await waitFor(events, (e) => e.kind === "delete");

		await fs.writeFile(file, "resurrected");
		await waitFor(events, (e) => e.kind === "create");

		// And the re-installed watch keeps working after resurrection.
		events.length = 0;
		await fs.writeFile(file, "again");
		await waitFor(events, (e) => e.kind === "update");

		// Second full cycle (VS Code's nodejsWatcher suspend/resume tests run
		// the delete→recreate loop twice — resumption must not be one-shot).
		events.length = 0;
		await fs.rm(file);
		await waitFor(events, (e) => e.kind === "delete");
		await fs.writeFile(file, "twice-resurrected");
		await waitFor(events, (e) => e.kind === "create");
	}, 20_000);

	it("survives the path becoming a directory and a file again", async () => {
		const file = await createTempFile();
		const events: FsWatchEvent[] = [];
		disposers.push(
			watchSingleFile(file, (e) => events.push(e), {
				debounceMs: 25,
				pollMs: 100,
			}),
		);
		await new Promise((r) => setTimeout(r, 150));

		// File → directory at the same path.
		await fs.rm(file);
		await waitFor(events, (e) => e.kind === "delete");
		await fs.mkdir(file);
		await waitFor(events, (e) => e.kind === "create" && e.isDirectory === true);

		// Directory → file again: the watch must keep following the path.
		events.length = 0;
		await fs.rmdir(file);
		await waitFor(events, (e) => e.kind === "delete");
		await fs.writeFile(file, "file again");
		await waitFor(events, (e) => e.kind === "create" && !e.isDirectory);
	}, 20_000);

	it("starts against a missing file and emits create when it lands", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "watch-file-"));
		tempRoots.push(dir);
		const file = path.join(dir, "not-yet.env");
		const events: FsWatchEvent[] = [];
		disposers.push(
			watchSingleFile(file, (e) => events.push(e), {
				debounceMs: 25,
				pollMs: 100,
			}),
		);
		await new Promise((r) => setTimeout(r, 150));
		expect(events).toEqual([]);

		await fs.writeFile(file, "born");
		await waitFor(events, (e) => e.kind === "create");
	}, 15_000);

	it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
		"stays silent while polling an unchanged file it cannot watch",
		async () => {
			const file = await createTempFile();
			await fs.chmod(file, 0o000);
			const events: FsWatchEvent[] = [];
			disposers.push(
				watchSingleFile(file, (e) => events.push(e), {
					debounceMs: 5,
					pollMs: 20,
				}),
			);
			await new Promise((r) => setTimeout(r, 150));
			expect(events).toEqual([]);

			await fs.utimes(file, new Date(), new Date(Date.now() + 60_000));
			await waitFor(events, (e) => e.kind === "update");
		},
	);

	it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
		"emits update on a permission change while polling",
		async () => {
			const file = await createTempFile();
			await fs.chmod(file, 0o000);
			const events: FsWatchEvent[] = [];
			disposers.push(
				watchSingleFile(file, (e) => events.push(e), {
					debounceMs: 5,
					pollMs: 20,
				}),
			);
			await new Promise((r) => setTimeout(r, 150));

			await fs.chmod(file, 0o200);
			await waitFor(events, (e) => e.kind === "update", 1_000);
		},
	);
});
