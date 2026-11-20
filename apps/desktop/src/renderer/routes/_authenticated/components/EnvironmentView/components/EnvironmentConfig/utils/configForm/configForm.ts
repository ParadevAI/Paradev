import {
	CONFIG_NAME_PATTERN,
	type ProjectConfig,
	toTomlText,
} from "@superset/shared/project-config";

type CommandValue = string | string[];
type Phase = NonNullable<ProjectConfig["install"]>;
type Terminal = NonNullable<ProjectConfig["terminals"]>[string];
type Port = NonNullable<ProjectConfig["ports"]>[string];

export interface TerminalRow {
	key: string;
	/** The table it was read from, so its other keys (cwd) survive a rename. */
	source: string | null;
	name: string;
	command: string;
	isDefault: boolean;
}

export interface PortRow {
	key: string;
	name: string;
	port: string;
	label: string;
	preview: boolean;
}

export interface ConfigForm {
	install: string;
	start: string;
	terminals: TerminalRow[];
	ports: PortRow[];
	mcpEnabled: boolean;
	/** `[mcp] allow`; null allows every plugin. */
	mcpAllow: string[] | null;
}

let rowCounter = 0;
export function nextRowKey(): string {
	rowCounter += 1;
	return `row-${rowCounter}`;
}

function runToScript(run: CommandValue | undefined): string {
	if (run === undefined) return "";
	return Array.isArray(run) ? run.join("\n") : run;
}

/** The script as typed, run by bash as one script; an unedited script keeps the value it came from. */
function scriptToRun(
	script: string,
	original: CommandValue | undefined,
): CommandValue | undefined {
	if (script === runToScript(original)) return original;
	const text = script.trimEnd();
	return text.trim() ? text : undefined;
}

function withoutUndefined<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as T;
}

function isEmpty(value: object | undefined): boolean {
	return value === undefined || Object.keys(value).length === 0;
}

/** A cloud override wins in the cloud, so the form shows and edits that value. */
function cloudRun(
	entry: { run?: CommandValue; cloud?: { run?: CommandValue } } | undefined,
) {
	return entry?.cloud?.run ?? entry?.run;
}

function withRun<T extends Phase | Terminal>(
	entry: T | undefined,
	run: CommandValue | undefined,
): T | undefined {
	const cloud = entry?.cloud
		? withoutUndefined({ ...entry.cloud, run: undefined })
		: undefined;
	const next = withoutUndefined({
		...entry,
		run,
		cloud: isEmpty(cloud) ? undefined : cloud,
	}) as T;
	return isEmpty(next) ? undefined : next;
}

export function toConfigForm(config: ProjectConfig): ConfigForm {
	const terminals = Object.entries(config.terminals ?? {});
	const defaultName =
		terminals.find(
			([, terminal]) => (terminal.cloud?.default ?? terminal.default) === true,
		)?.[0] ?? null;
	return {
		install: runToScript(cloudRun(config.install)),
		start: runToScript(cloudRun(config.setup)),
		terminals: terminals.map(([name, terminal]) => {
			const run = cloudRun(terminal);
			return {
				key: nextRowKey(),
				source: name,
				name,
				command: Array.isArray(run) ? run.join(" && ") : (run ?? ""),
				isDefault: name === defaultName,
			};
		}),
		ports: Object.entries(config.ports ?? {}).map(([name, port]) => ({
			key: nextRowKey(),
			name,
			port: String(port.default),
			label: port.label ?? "",
			preview: port.preview === true,
		})),
		mcpEnabled: config.mcp?.enabled !== false,
		mcpAllow: config.mcp?.allow ?? null,
	};
}

/** The form written over `base`, keeping what the form does not show (cwd, archive). */
export function fromConfigForm(
	base: ProjectConfig,
	form: ConfigForm,
): ProjectConfig {
	const terminals: Record<string, Terminal> = {};
	for (const row of form.terminals) {
		const original = row.source ? base.terminals?.[row.source] : undefined;
		const cloud = original?.cloud
			? withoutUndefined({ ...original.cloud, default: undefined })
			: undefined;
		terminals[row.name.trim()] = withoutUndefined({
			...withRun(original, row.command.trim() || undefined),
			default: row.isDefault ? true : undefined,
			cloud: isEmpty(cloud) ? undefined : cloud,
		});
	}
	const ports: Record<string, Port> = {};
	for (const row of form.ports) {
		ports[row.name.trim()] = withoutUndefined({
			default: Number(row.port),
			label: row.label.trim() || undefined,
			preview: row.preview ? true : undefined,
		});
	}
	const mcp = withoutUndefined({
		...base.mcp,
		enabled: form.mcpEnabled ? undefined : false,
		allow: form.mcpAllow ? [...new Set(form.mcpAllow)] : undefined,
	});
	return withoutUndefined({
		...base,
		install: withRun(
			base.install,
			scriptToRun(form.install, cloudRun(base.install)),
		),
		setup: withRun(base.setup, scriptToRun(form.start, cloudRun(base.setup))),
		terminals: isEmpty(terminals) ? undefined : terminals,
		ports: isEmpty(ports) ? undefined : ports,
		mcp: isEmpty(mcp) ? undefined : mcp,
	});
}

/** The text to store; null when there is nothing left to store. */
export function configText(config: ProjectConfig): string | null {
	return isEmpty(config) ? null : toTomlText(config);
}

export type RowProblem = "name" | "duplicate" | "command" | "port";

export function terminalProblems(rows: TerminalRow[]): Map<string, RowProblem> {
	const problems = new Map<string, RowProblem>();
	const seen = new Set<string>();
	for (const row of rows) {
		const name = row.name.trim();
		if (!CONFIG_NAME_PATTERN.test(name)) problems.set(row.key, "name");
		else if (seen.has(name)) problems.set(row.key, "duplicate");
		else if (!row.command.trim()) problems.set(row.key, "command");
		seen.add(name);
	}
	return problems;
}

export function portProblems(rows: PortRow[]): Map<string, RowProblem> {
	const problems = new Map<string, RowProblem>();
	const seen = new Set<string>();
	for (const row of rows) {
		const name = row.name.trim();
		const port = Number(row.port);
		if (!CONFIG_NAME_PATTERN.test(name)) problems.set(row.key, "name");
		else if (seen.has(name)) problems.set(row.key, "duplicate");
		else if (!Number.isInteger(port) || port < 1 || port > 65535) {
			problems.set(row.key, "port");
		}
		seen.add(name);
	}
	return problems;
}
