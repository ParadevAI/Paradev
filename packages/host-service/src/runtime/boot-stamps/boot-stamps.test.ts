import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Sentry from "@sentry/node";
import {
	readBootStamps,
	recordBootStamp,
	startSandboxBootPhaseLog,
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

describe("startSandboxBootPhaseLog", () => {
	let dir: string;
	let path: string;
	let info: ReturnType<typeof spyOn<typeof Sentry.logger, "info">>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "boot-phases-"));
		path = join(dir, "boot.log");
		info = spyOn(Sentry.logger, "info").mockImplementation(() => {});
	});

	afterEach(() => {
		info.mockRestore();
		rmSync(dir, { recursive: true, force: true });
	});

	function start(): () => void {
		let tick = () => {};
		startSandboxBootPhaseLog({
			path,
			every: (run) => {
				tick = run;
				return () => {};
			},
		});
		return tick;
	}

	const phases = () =>
		info.mock.calls.map(([, attributes]) => {
			const { "boot.phase": phase, "boot.ms": ms } = attributes as Record<
				string,
				unknown
			>;
			return [phase, ms];
		});

	it("logs each stamp once, as the phase and its times only", () => {
		appendFileSync(
			path,
			"1789000000000 boot.start pid=1 bundle=98926af3b551\n1789000000200 checkout.cloned /home/ubuntu/workspace/acme https://github.com/acme/private.git\n",
		);
		const tick = start();
		tick();
		tick();
		appendFileSync(path, "1789000009000 checkout.end\n");
		tick();
		expect(info.mock.calls.map(([, attributes]) => attributes)).toEqual([
			{
				"log.source": "boot",
				"box.event": true,
				"boot.phase": "boot.start",
				"boot.at": 1789000000000,
				"boot.ms": 0,
			},
			{
				"log.source": "boot",
				"box.event": true,
				"boot.phase": "checkout.cloned",
				"boot.at": 1789000000200,
				"boot.ms": 200,
			},
			{
				"log.source": "boot",
				"box.event": true,
				"boot.phase": "checkout.end",
				"boot.at": 1789000009000,
				"boot.ms": 9000,
			},
		]);
	});

	it("sends no step-output line that only looks like a stamp", () => {
		appendFileSync(
			path,
			[
				"1789000000000 boot.start pid=1",
				"1789000000100 registry.npmjs.org GET 200",
				`1789000000200 host.${"x".repeat(10_000)}`,
				"1789000000300 rootfs.end",
				"",
			].join("\n"),
		);
		start()();
		expect(phases()).toEqual([
			["boot.start", 0],
			["rootfs.end", 300],
		]);
	});

	it("a boot.start in step output does not send the boot's stamps again", () => {
		appendFileSync(
			path,
			"1789000000000 boot.start pid=1\n1789000000100 rootfs.start\n",
		);
		const tick = start();
		tick();
		appendFileSync(
			path,
			"1789000000150 boot.start\n1789000000900 rootfs.end\n",
		);
		tick();
		expect(phases().map(([phase]) => phase)).toEqual([
			"boot.start",
			"rootfs.start",
			"boot.start",
			"rootfs.end",
		]);
	});
});
