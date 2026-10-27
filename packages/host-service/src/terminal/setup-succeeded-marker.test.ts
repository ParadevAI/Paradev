import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
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
