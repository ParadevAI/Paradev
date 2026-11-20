import { describe, expect, test } from "bun:test";
import { containsShellExitMarker } from "./shell-exit-marker";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("containsShellExitMarker", () => {
	test("finds the marker when other output follows it", () => {
		expect(
			containsShellExitMarker(
				bytes("exit\r\n\x1b]777;superset-shell-exit\x07bye\r\n"),
			),
		).toBe(true);
	});

	test("does not match other output or the prompt marker", () => {
		expect(containsShellExitMarker(bytes(""))).toBe(false);
		expect(
			containsShellExitMarker(bytes("\x1b]777;superset-shell-ready\x07$ ")),
		).toBe(false);
	});
});
