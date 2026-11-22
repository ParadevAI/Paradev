import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Sentry from "@sentry/node";
import {
	bootPhaseLogger,
	readBootStamps,
	recordBootStamp,
} from "./boot-stamps";

describe("recordBootStamp", () => {
	let dir: string;
	const previous = process.env.SUPERSET_SANDBOX_BOOT_LOG;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "boot-stamps-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		if (previous === undefined) delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
		else process.env.SUPERSET_SANDBOX_BOOT_LOG = previous;
	});

	it("appends to the boot log the script started and reads it back", () => {
		const path = join(dir, "boot.log");
		process.env.SUPERSET_SANDBOX_BOOT_LOG = path;
		recordBootStamp("boot.start", 1789000000000);
		recordBootStamp("host.listening", 1789000004321);
		expect(readFileSync(path, "utf8")).toBe(
			"1789000000000 boot.start\n1789000004321 host.listening\n",
		);
		expect(readBootStamps()).toEqual([
			{ phase: "boot.start", at: 1789000000000 },
			{ phase: "host.listening", at: 1789000004321 },
		]);
	});

	it("records nothing without a boot log", () => {
		delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
		recordBootStamp("host.listening");
		expect(readBootStamps()).toEqual([]);
	});
});

it("bootPhaseLogger logs each stamp of the current boot once, as phase and times only", () => {
	const dir = mkdtempSync(join(tmpdir(), "boot-phases-"));
	const path = join(dir, "boot.log");
	const info = spyOn(Sentry.logger, "info").mockImplementation(() => {});
	appendFileSync(
		path,
		"1789000000000 boot.start pid=1\nGet:1 http://archive.ubuntu.com noble\n1789000000200 checkout.cloned /home/ubuntu/acme https://github.com/acme/secret.git\n",
	);
	const log = bootPhaseLogger(path);
	log();
	log();
	appendFileSync(path, "1789000009000 boot.start pid=2\n");
	log();
	expect(info.mock.calls.map(([, attributes]) => attributes)).toEqual([
		{
			"log.source": "boot",
			"boot.phase": "boot.start",
			"boot.at": 1789000000000,
			"boot.ms": 0,
		},
		{
			"log.source": "boot",
			"boot.phase": "checkout.cloned",
			"boot.at": 1789000000200,
			"boot.ms": 200,
		},
		{
			"log.source": "boot",
			"boot.phase": "boot.start",
			"boot.at": 1789000009000,
			"boot.ms": 0,
		},
	]);
	info.mockRestore();
	rmSync(dir, { recursive: true, force: true });
});
