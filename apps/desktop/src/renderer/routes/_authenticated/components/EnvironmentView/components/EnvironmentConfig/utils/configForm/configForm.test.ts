import { describe, expect, test } from "bun:test";
import { parseProjectConfig } from "@superset/shared/project-config";
import {
	configText,
	fromConfigForm,
	portProblems,
	terminalProblems,
	toConfigForm,
} from "./configForm";

function parse(text: string) {
	const parsed = parseProjectConfig(text);
	if (!parsed.ok) throw new Error(parsed.errors[0]?.message);
	return parsed.config;
}

describe("configForm", () => {
	test("keeps a script as typed and keeps what the form does not show", () => {
		const base = parse(`
[install]
run = "npm ci"
cwd = "web"

[archive]
run = "./teardown.sh"

[terminals.dev]
run = "npm run dev"
cwd = "web"
default = true
`);
		const form = toConfigForm(base);
		form.install = "bun install\n\n  bun run build  ";
		form.start = "cp .env.example .env";
		const [dev] = form.terminals;
		if (!dev) throw new Error("expected the dev terminal");
		dev.name = "web";

		expect(fromConfigForm(base, form)).toEqual({
			install: { run: "bun install\n\n  bun run build", cwd: "web" },
			setup: { run: "cp .env.example .env" },
			archive: { run: "./teardown.sh" },
			terminals: { web: { run: "npm run dev", cwd: "web", default: true } },
		});
	});

	test("an empty [mcp] allow allows no plugin and stays in the file; clearing it allows all", () => {
		const base = parse('[mcp]\nallow = ["linear@superset"]\n');
		const form = toConfigForm(base);
		expect(form.mcpAllow).toEqual(["linear@superset"]);
		form.mcpAllow = [];
		expect(configText(fromConfigForm(base, form))).toBe("[mcp]\nallow = []\n");
		form.mcpAllow = null;
		expect(configText(fromConfigForm(base, form))).toBeNull();
	});

	test("edits the cloud override, which is what runs in the cloud", () => {
		const base = parse(`
[setup]
run = "./local-setup.sh"

[setup.cloud]
run = "./cloud-setup.sh"
cwd = "app"
`);
		const form = toConfigForm(base);
		expect(form.start).toBe("./cloud-setup.sh");
		form.start = "./setup.sh";
		expect(fromConfigForm(base, form).setup).toEqual({
			run: "./setup.sh",
			cloud: { cwd: "app" },
		});
	});

	test("an unedited script keeps its command list, so its commands still stop at the first failure", () => {
		const base = parse(`[setup]\nrun = ["bun install", "bun run db:seed"]\n`);
		const form = toConfigForm(base);
		expect(form.start).toBe("bun install\nbun run db:seed");
		expect(fromConfigForm(base, form).setup?.run).toEqual([
			"bun install",
			"bun run db:seed",
		]);
	});

	test("disabling MCP keeps the allowlist for when it is turned back on", () => {
		const base = parse('[mcp]\nallow = ["linear@superset"]\n');
		const form = toConfigForm(base);
		expect(form.mcpEnabled).toBe(true);
		form.mcpEnabled = false;
		expect(fromConfigForm(base, form).mcp).toEqual({
			enabled: false,
			allow: ["linear@superset"],
		});
	});

	test("an emptied form stores nothing", () => {
		const base = parse(`[install]\nrun = "bun install"\n`);
		const form = toConfigForm(base);
		form.install = "  ";
		expect(configText(fromConfigForm(base, form))).toBeNull();
	});

	test("flags names the config would refuse, duplicates, and bad ports", () => {
		const terminals = terminalProblems([
			{ key: "a", source: null, name: "Dev", command: "x", isDefault: false },
			{ key: "b", source: null, name: "dev", command: "x", isDefault: false },
			{ key: "c", source: null, name: "dev", command: "x", isDefault: false },
			{ key: "d", source: null, name: "api", command: " ", isDefault: false },
		]);
		expect([...terminals]).toEqual([
			["a", "name"],
			["c", "duplicate"],
			["d", "command"],
		]);
		const ports = portProblems([
			{ key: "a", name: "web", port: "70000", label: "", preview: false },
		]);
		expect(ports.get("a")).toBe("port");
	});
});
