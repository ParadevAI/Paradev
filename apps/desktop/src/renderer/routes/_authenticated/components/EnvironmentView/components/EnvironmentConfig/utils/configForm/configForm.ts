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
	/** The command as it was read; a row whose command is unchanged keeps its original value. */
	originalCommand: string;
	isDefault: boolean;
}

export interface PortRow {
	key: string;
	/** The table it was read from, so what the form does not change is kept. */
	source: string | null;
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
	if (script.trimEnd() === runToScript(original).trimEnd()) return original;
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

/** Writes an edited command where the cloud reads it: the cloud override when there is one. */
function withRun<T extends Phase | Terminal>(
	entry: T | undefined,
	run: CommandValue | undefined,
): T | undefined {
	if (entry?.cloud?.run !== undefined) {
		return { ...entry, cloud: { ...entry.cloud, run: run ?? [] } };
	}
	const next = withoutUndefined({ ...entry, run }) as T;
	return isEmpty(next) ? undefined : next;
}

function withScript(entry: Phase | undefined, script: string) {
	const original = cloudRun(entry);
	const run = scriptToRun(script, original);
	return run === original ? entry : withRun(entry, run);
}

/** One line for the terminal command input: a list or a multi-line script reads as `a && b`. */
function commandText(run: CommandValue | undefined): string {
	const lines = Array.isArray(run) ? run : (run ?? "").split("\n");
	return lines
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" && ");
}

function isCloudDefault(terminal: Terminal): boolean {
	return (terminal.cloud?.default ?? terminal.default) === true;
}

function defaultTerminalName(config: ProjectConfig): string | null {
	return (
		Object.entries(config.terminals ?? {}).find(([, terminal]) =>
			isCloudDefault(terminal),
		)?.[0] ?? null
	);
}

/** Writes a changed default where the cloud reads it, like `withRun`. */
function withDefault(terminal: Terminal, isDefault: boolean): Terminal {
	if (terminal.cloud?.default !== undefined) {
		return { ...terminal, cloud: { ...terminal.cloud, default: isDefault } };
	}
	return withoutUndefined({
		...terminal,
		default: isDefault ? true : undefined,
	});
}

export function toConfigForm(config: ProjectConfig): ConfigForm {
	const terminals = Object.entries(config.terminals ?? {});
	const defaultName = defaultTerminalName(config);
	return {
		install: runToScript(cloudRun(config.install)),
		start: runToScript(cloudRun(config.setup)),
		terminals: terminals.map(([name, terminal]) => {
			const command = commandText(cloudRun(terminal));
			return {
				key: nextRowKey(),
				source: name,
				name,
				command,
				originalCommand: command,
				isDefault: name === defaultName,
			};
		}),
		ports: Object.entries(config.ports ?? {}).map(([name, port]) => ({
			key: nextRowKey(),
			source: name,
			name,
			port: String(port.default),
			label: port.label ?? "",
			preview: port.preview === true,
		})),
		mcpEnabled: config.mcp?.enabled !== false,
		mcpAllow: config.mcp?.allow ?? null,
	};
}

/**
 * The form written over `base`. What the form does not show (cwd, archive)
 * and what it shows but was not changed are kept as they were.
 */
export function fromConfigForm(
	base: ProjectConfig,
	form: ConfigForm,
): ProjectConfig {
	const chosen = form.terminals.find((row) => row.isDefault);
	const defaultChanged =
		chosen === undefined
			? defaultTerminalName(base) !== null
			: chosen.source === null || chosen.source !== defaultTerminalName(base);
	const terminals: Record<string, Terminal> = {};
	for (const row of form.terminals) {
		const original = row.source ? base.terminals?.[row.source] : undefined;
		const command = row.command.trim();
		let terminal =
			(command === row.originalCommand.trim()
				? original
				: withRun(original, command || undefined)) ?? {};
		if (defaultChanged && (row.isDefault || isCloudDefault(terminal))) {
			terminal = withDefault(terminal, row.isDefault);
		}
		terminals[row.name.trim()] = terminal;
	}
	const ports: Record<string, Port> = {};
	for (const row of form.ports) {
		const original = row.source ? base.ports?.[row.source] : undefined;
		const label = row.label.trim();
		ports[row.name.trim()] = withoutUndefined({
			...original,
			default: Number(row.port),
			label:
				original && label === (original.label ?? "").trim()
					? original.label
					: label || undefined,
			preview:
				original && row.preview === (original.preview === true)
					? original.preview
					: row.preview || undefined,
		});
	}
	const mcp = withoutUndefined({
		...base.mcp,
		enabled: form.mcpEnabled ? undefined : false,
		allow: form.mcpAllow ? [...new Set(form.mcpAllow)] : undefined,
	});
	return withoutUndefined({
		...base,
		install: withScript(base.install, form.install),
		setup: withScript(base.setup, form.start),
		terminals: isEmpty(terminals) ? undefined : terminals,
		ports: isEmpty(ports) ? undefined : ports,
		mcp: isEmpty(mcp) ? undefined : mcp,
	});
}

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
		else if (
			!row.command.trim() &&
			(row.source === null || row.command !== row.originalCommand)
		) {
			problems.set(row.key, "command");
		}
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
