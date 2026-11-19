import { afterAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { resolveCommand } from "./resolve-command";

const root = mkdtempSync(join(tmpdir(), "resolve-command-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function dir(name: string): string {
	const path = join(root, name);
	mkdirSync(path, { recursive: true });
	return path;
}

function executable(path: string): string {
	writeFileSync(path, "#!/bin/sh\n");
	chmodSync(path, 0o755);
	return path;
}

describe.skipIf(process.platform === "win32")("resolveCommand", () => {
	it("returns the first executable match on PATH", () => {
		const empty = dir("a-empty");
		const notExecutable = dir("a-plain");
		writeFileSync(join(notExecutable, "tool-a"), "");
		const hit = executable(join(dir("a-hit"), "tool-a"));
		executable(join(dir("a-later"), "tool-a"));
		const PATH = [
			empty,
			notExecutable,
			hit.replace("/tool-a", ""),
			join(root, "a-later"),
		].join(delimiter);

		expect(resolveCommand("tool-a", { env: { PATH } })).toBe(hit);
	});

	it("prefers a listed absolute path over PATH", () => {
		const preferred = executable(join(dir("b-preferred"), "tool-b"));
		executable(join(dir("b-path"), "tool-b"));

		expect(
			resolveCommand("tool-b", {
				env: { PATH: join(root, "b-path") },
				preferred: [join(root, "missing", "tool-b"), preferred],
			}),
		).toBe(preferred);
	});

	it("falls back to the bare name when nothing matches", () => {
		expect(resolveCommand("tool-c", { env: { PATH: dir("c-empty") } })).toBe(
			"tool-c",
		);
	});

	it("leaves relative PATH entries to the spawn", () => {
		executable(join(dir("d-hit"), "tool-d"));
		const PATH = ["relative/bin", join(root, "d-hit")].join(delimiter);

		expect(resolveCommand("tool-d", { env: { PATH } })).toBe("tool-d");
	});

	it("resolves again when the cached file is gone", () => {
		const first = executable(join(dir("e-first"), "tool-e"));
		const second = executable(join(dir("e-second"), "tool-e"));
		const env = {
			PATH: [join(root, "e-first"), join(root, "e-second")].join(delimiter),
		};
		expect(resolveCommand("tool-e", { env })).toBe(first);

		rmSync(first);

		expect(resolveCommand("tool-e", { env })).toBe(second);
	});

	it("searches the given env's PATH, not process.env", () => {
		const hit = executable(join(dir("f-hit"), "tool-f"));

		expect(
			resolveCommand("tool-f", { env: { PATH: join(root, "f-hit") } }),
		).toBe(hit);
		expect(resolveCommand("tool-f", { env: {} })).toBe("tool-f");
	});
});
