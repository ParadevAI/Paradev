import { describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
	appendSetupSucceededMarker,
	createSetupSucceededScanner,
	SETUP_SUCCEEDED_COMMAND,
} from "./setup-succeeded-marker";

const encode = (text: string) => new TextEncoder().encode(text);

describe("createSetupSucceededScanner", () => {
	it("matches the bytes the command prints", () => {
		const output = execFileSync("sh", ["-c", SETUP_SUCCEEDED_COMMAND]);
		expect(createSetupSucceededScanner()(output)).toBe(true);
	});

	it("matches a marker split across chunks", () => {
		const scan = createSetupSucceededScanner();
		expect(scan(encode("done\r\n\x1b]777;superset-se"))).toBe(false);
		expect(scan(encode("tup-succeeded\x07$ "))).toBe(true);
	});

	it("ignores the echoed command line", () => {
		expect(
			createSetupSucceededScanner()(
				encode(`bun install && ${SETUP_SUCCEEDED_COMMAND}\r\n`),
			),
		).toBe(false);
	});

	it("ignores other OSC 777 sequences", () => {
		expect(
			createSetupSucceededScanner()(
				encode("\x1b]777;superset-shell-ready\x07\x1b]133;A\x07"),
			),
		).toBe(false);
	});
});

describe("appendSetupSucceededMarker", () => {
	const printsMarker = (shell: string, setup: string) =>
		createSetupSucceededScanner()(
			spawnSync(shell, ["-c", appendSetupSucceededMarker(setup, shell)]).stdout,
		);

	for (const shell of ["bash", "sh"]) {
		it(`prints the marker after a successful setup in ${shell}`, () => {
			expect(printsMarker(shell, "true")).toBe(true);
			expect(printsMarker(shell, "true\n")).toBe(true);
			expect(printsMarker(shell, "true # install deps")).toBe(true);
			expect(printsMarker(shell, "echo one\necho two # done\n")).toBe(true);
		});

		it(`does not print the marker after a failed setup in ${shell}`, () => {
			expect(printsMarker(shell, "false")).toBe(false);
			expect(printsMarker(shell, "false\n")).toBe(false);
			expect(printsMarker(shell, "false # install deps")).toBe(false);
		});
	}

	it("keeps a plain one-line setup unwrapped", () => {
		expect(appendSetupSucceededMarker("bun install\n", "zsh")).toBe(
			`bun install && ${SETUP_SUCCEEDED_COMMAND}`,
		);
	});

	it("groups with begin/end in fish", () => {
		expect(appendSetupSucceededMarker("bun install # deps", "fish")).toBe(
			`begin; bun install # deps\nend && ${SETUP_SUCCEEDED_COMMAND}`,
		);
	});
});
