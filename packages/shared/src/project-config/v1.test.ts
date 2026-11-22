import { describe, expect, test } from "bun:test";
import { parseProjectConfig } from "./parse";
import { fromV1Json, toTomlText } from "./v1";

describe("fromV1Json", () => {
	test("translates this repository's v1 file", () => {
		const config = fromV1Json({
			setup: ["./.superset/setup.sh"],
			teardown: ["./.superset/teardown.sh"],
			run: ["bun dev"],
			start: ["./.superset/setup.cloud.sh", "./.superset/dev-stack.cloud.sh"],
		});
		expect(config).toEqual({
			setup: {
				run: ["./.superset/setup.sh"],
				cloud: {
					run: ["./.superset/setup.cloud.sh", "./.superset/dev-stack.cloud.sh"],
				},
			},
			archive: { run: ["./.superset/teardown.sh"], cloud: { run: [] } },
			terminals: {
				dev: { run: "bun dev", default: true, cloud: { default: false } },
			},
		});
	});

	test("copies cwd into each table and maps ports", () => {
		const config = fromV1Json({
			cwd: "apps/web",
			setup: ["bun install"],
			ports: [3000, 70000],
		});
		expect(config.setup).toEqual({
			run: ["bun install"],
			cloud: { run: [] },
			cwd: "apps/web",
		});
		expect(config.ports).toEqual({ p3000: { default: 3000, preview: true } });
	});

	test("ignores junk and empty lists", () => {
		expect(fromV1Json({ setup: [], teardown: [1, 2], run: "x" })).toEqual({});
		expect(fromV1Json(null)).toEqual({});
	});

	test("its TOML output parses back to the same config", () => {
		const config = fromV1Json({
			setup: ["a", "b"],
			teardown: ["c"],
			run: ["d", "e"],
		});
		const reparsed = parseProjectConfig(toTomlText(config));
		expect(reparsed.ok && reparsed.config).toEqual(config);
	});

	test("writes a script that spans lines as a literal block and reads it back as typed", () => {
		const script =
			"#!/usr/bin/env bash\nset -euo pipefail\n\nif [ -f x ]; then\n\techo 'a \\ b'\nfi";
		const text = toTomlText({ install: { run: script } });
		expect(text).toContain("run = '''\n#!/usr/bin/env bash");
		const reparsed = parseProjectConfig(text);
		expect(reparsed.ok && reparsed.config.install?.run).toBe(script);
	});
});
