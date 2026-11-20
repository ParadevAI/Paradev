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
			run: "./local-setup.sh",
			cloud: { run: "./setup.sh", cwd: "app" },
		});
	});

	test("a terminal's edited command and default go where the cloud reads them", () => {
		const base = parse(`
[terminals.dev]
run = "bun dev"
default = true

[terminals.dev.cloud]
run = "bun dev:cloud"
default = false

[terminals.web]
run = "bun web"
`);
		const form = toConfigForm(base);
		const [dev, web] = form.terminals;
		if (!dev || !web) throw new Error("expected two terminals");
		dev.command = "bun start";
		dev.isDefault = true;
		expect(fromConfigForm(base, form).terminals).toEqual({
			dev: {
				run: "bun dev",
				default: true,
				cloud: { run: "bun start", default: true },
			},
			web: { run: "bun web" },
		});
	});

	test("fields the user did not change stay as they were, cloud overrides included", () => {
		const base = parse(`
[install]
run = "bun install"

[install.cloud]
run = []

[setup]
run = "./local.sh"

[setup.cloud]
run = "./cloud.sh"

[terminals.dev]
run = "bun dev"
default = true

[terminals.dev.cloud]
default = false
`);
		const form = toConfigForm(base);
		form.ports.push({
			key: "new",
			source: null,
			name: "web",
			port: "3000",
			label: "",
			preview: true,
		});
		expect(fromConfigForm(base, form)).toEqual({
			...base,
			ports: { web: { default: 3000, preview: true } },
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
		const row = (key: string, name: string, command: string) => ({
			key,
			source: null,
			name,
			command,
			originalCommand: "",
			isDefault: false,
		});
		const terminals = terminalProblems([
			row("a", "Dev", "x"),
			row("b", "dev", "x"),
			row("c", "dev", "x"),
			row("d", "api", " "),
		]);
		expect([...terminals]).toEqual([
			["a", "name"],
			["c", "duplicate"],
			["d", "command"],
		]);
		const ports = portProblems([
			{
				key: "a",
				source: null,
				name: "web",
				port: "70000",
				label: "",
				preview: false,
			},
		]);
		expect(ports.get("a")).toBe("port");
	});

	test("picking another default terminal clears every other default the cloud reads", () => {
		const base = parse(`
[terminals.a]
run = "a"
default = true

[terminals.b]
run = "b"
default = true

[terminals.c]
run = "c"
`);
		const form = toConfigForm(base);
		form.terminals = form.terminals.map((row) => ({
			...row,
			isDefault: row.name === "c",
		}));
		expect(fromConfigForm(base, form).terminals).toEqual({
			a: { run: "a" },
			b: { run: "b" },
			c: { run: "c", default: true },
		});
	});

	test("an unchanged default keeps every terminal's defaults as they were", () => {
		const base = parse(`
[terminals.a]
run = "a"
default = true

[terminals.b]
run = "b"
default = true
`);
		const form = toConfigForm(base);
		const [, b] = form.terminals;
		if (!b) throw new Error("expected two terminals");
		b.command = "b2";
		expect(fromConfigForm(base, form).terminals).toEqual({
			a: { run: "a", default: true },
			b: { run: "b2", default: true },
		});
	});

	test("a multi-line terminal command reads as one line and is kept unless edited", () => {
		const base = parse('[terminals.dev]\nrun = """\nbun i\nbun dev\n"""\n');
		const form = toConfigForm(base);
		const [dev] = form.terminals;
		if (!dev) throw new Error("expected the dev terminal");
		expect(dev.command).toBe("bun i && bun dev");
		expect(fromConfigForm(base, form).terminals).toEqual(base.terminals);
		dev.command = "bun i && bun start";
		expect(fromConfigForm(base, form).terminals?.dev?.run).toBe(
			"bun i && bun start",
		);
	});

	test("an unedited terminal with no cloud command does not block saving", () => {
		const base = parse(
			'[terminals.dev]\nrun = "bun dev"\n\n[terminals.dev.cloud]\nrun = []\n',
		);
		const form = toConfigForm(base);
		expect(terminalProblems(form.terminals).size).toBe(0);
		const [dev] = form.terminals;
		if (!dev) throw new Error("expected the dev terminal");
		dev.command = " ";
		expect([...terminalProblems(form.terminals).values()]).toEqual(["command"]);
	});

	test("a script that only gained trailing whitespace keeps its command list", () => {
		const base = parse('[setup]\nrun = ["bun install", "bun run seed"]\n');
		const form = toConfigForm(base);
		form.start = `${form.start}\n\n  `;
		expect(fromConfigForm(base, form).setup?.run).toEqual([
			"bun install",
			"bun run seed",
		]);
	});

	test("an unchanged port keeps its own keys, an empty label and preview = false included", () => {
		const base = parse(
			'[ports.web]\ndefault = 3000\nlabel = ""\npreview = false\n',
		);
		const form = toConfigForm(base);
		form.start = "echo";
		expect(fromConfigForm(base, form).ports).toEqual({
			web: { default: 3000, label: "", preview: false },
		});
		const [web] = form.ports;
		if (!web) throw new Error("expected the web port");
		web.port = "3001";
		expect(fromConfigForm(base, form).ports).toEqual({
			web: { default: 3001, label: "", preview: false },
		});
	});
});
