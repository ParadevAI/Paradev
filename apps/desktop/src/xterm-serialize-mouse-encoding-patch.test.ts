import { describe, expect, test } from "bun:test";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/xterm";

// Guards the bun patches on @xterm/xterm and @xterm/addon-serialize that carry
// upstream xterm.js PR #6174 (see patches/README.md). Unpatched, a serialized
// terminal comes back with mouse tracking but the default encoding; the mobile
// page repaints a pooled session that way and Codex, which arms SGR once at
// startup, stopped scrolling after a tab switch. patchedDependencies is keyed
// to an exact version, so a bump silently drops the patch. If this fails after
// a bump, regenerate the patches per patches/README.md; do NOT delete the test.

const write = (terminal: Terminal, data: string) =>
	new Promise<void>((resolve) => terminal.write(data, resolve));

async function roundTrip(modes: string): Promise<Terminal> {
	const source = new Terminal({ cols: 40, rows: 10 });
	const serializer = new SerializeAddon();
	source.loadAddon(serializer);
	await write(source, `${modes}text`);
	const target = new Terminal({ cols: 40, rows: 10 });
	await write(target, serializer.serialize());
	return target;
}

describe("@xterm mouse encoding serialize patch", () => {
	test("SGR mouse encoding survives serialize", async () => {
		const target = await roundTrip("\x1b[?1049h\x1b[?1003h\x1b[?1006h");
		expect(target.modes.mouseTrackingMode).toBe("any");
		expect(target.modes.mouseEncoding).toBe("sgr");
	});

	test("SGR-pixels mouse encoding survives serialize", async () => {
		const target = await roundTrip("\x1b[?1000h\x1b[?1016h");
		expect(target.modes.mouseEncoding).toBe("sgr-pixels");
	});

	test("the default encoding stays default", async () => {
		const target = await roundTrip("\x1b[?1000h");
		expect(target.modes.mouseEncoding).toBe("default");
	});
});
