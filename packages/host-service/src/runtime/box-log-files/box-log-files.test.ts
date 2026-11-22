import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
	BOX_LOG_FILES,
	type BoxLogSource,
	createBoxLogFiles,
} from "./box-log-files";

const BOOT_STARTED_AT = 1795306593806;
let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "box-log-files-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function follow() {
	const sent: Array<[BoxLogSource, string]> = [];
	const files = BOX_LOG_FILES.map((file) => ({
		source: file.source,
		path: join(dir, basename(file.path)),
	}));
	const follower = await createBoxLogFiles({
		files,
		bootStartedAt: BOOT_STARTED_AT,
		emit: (source, line) => sent.push([source, line]),
	});
	return { sent, poll: follower.poll };
}

describe("createBoxLogFiles", () => {
	it("names boot.log, memguard.log and desktop.log and nothing else", () => {
		expect(
			BOX_LOG_FILES.map((file) => [file.source, basename(file.path)]),
		).toEqual([
			["boot", "boot.log"],
			["memguard", "memguard.log"],
			["desktop", "desktop.log"],
		]);
	});

	it("sends the current boot's lines and none of an earlier boot's", async () => {
		await writeFile(
			join(dir, "boot.log"),
			[
				"1795305352322 boot.start pid=799 bundle=98926af3b551",
				"1795305353868 host.ready",
				"1795306593806 boot.start pid=801 bundle=98926af3b551",
				"1795306593917 setup apply-rootfs installed=0 skipped=29",
				"",
			].join("\n"),
		);
		await writeFile(
			join(dir, "memguard.log"),
			[
				"1795305352812 memguard start floor=8% user=ubuntu(1000)",
				"/usr/local/bin/superset-memguard: line 51: /proc/1146/status: No such file or directory",
				"1795306594390 memguard start floor=8% user=ubuntu(1000)",
				"",
			].join("\n"),
		);
		const { sent, poll } = await follow();
		await poll();
		expect(sent).toEqual([
			["boot", "1795306593806 boot.start pid=801 bundle=98926af3b551"],
			["boot", "1795306593917 setup apply-rootfs installed=0 skipped=29"],
			["memguard", "1795306594390 memguard start floor=8% user=ubuntu(1000)"],
		]);
	});

	it("sends lines as they are appended, a file that appears later included, and holds a line until it ends", async () => {
		await writeFile(
			join(dir, "boot.log"),
			"1795305352322 boot.start pid=799\n",
		);
		const { sent, poll } = await follow();
		await poll();
		expect(sent).toEqual([]);

		await appendFile(
			join(dir, "boot.log"),
			"1795306593806 boot.start pid=801\n1795306595210 host.re",
		);
		await writeFile(
			join(dir, "desktop.log"),
			"1795306594600 desktop X ready pid=1596\n",
		);
		await poll();
		await appendFile(join(dir, "boot.log"), "ady\n");
		await poll();
		await poll();
		expect(sent).toEqual([
			["boot", "1795306593806 boot.start pid=801"],
			["desktop", "1795306594600 desktop X ready pid=1596"],
			["boot", "1795306595210 host.ready"],
		]);
	});
});
