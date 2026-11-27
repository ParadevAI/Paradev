import type {
	CliSurface,
	SurfaceArg,
	SurfaceCommand,
	SurfaceOption,
} from "../../scripts/cli-surface";

export interface SurfaceDiff {
	breaking: string[];
	additions: string[];
}

const same = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);
const missing = (before: string[] = [], after: string[] = []) =>
	before.filter((value) => !after.includes(value));
const list = (values: string[]) => values.join(", ");

function diffOptions(
	where: string,
	before: SurfaceOption[],
	after: SurfaceOption[],
	diff: SurfaceDiff,
): void {
	const afterByName = new Map(after.map((option) => [option.name, option]));
	const beforeNames = new Set(before.map((option) => option.name));
	const added = after.filter((option) => !beforeNames.has(option.name));
	const addedNames = list(added.map((option) => `--${option.name}`));

	for (const old of before) {
		const flag = `${where} --${old.name}`;
		const now = afterByName.get(old.name);
		if (!now) {
			diff.breaking.push(
				`${flag}: removed${addedNames ? ` (added on this command: ${addedNames})` : ""}`,
			);
			continue;
		}
		const lostAliases = missing(old.aliases, now.aliases);
		if (lostAliases.length) {
			diff.breaking.push(`${flag}: lost alias ${list(lostAliases)}`);
		}
		if (old.type !== now.type || old.int !== now.int) {
			diff.breaking.push(
				`${flag}: type ${old.type}${old.int ? " (int)" : ""} -> ${now.type}${now.int ? " (int)" : ""}`,
			);
		}
		if (!old.required && now.required) {
			diff.breaking.push(`${flag}: became required`);
		}
		if (old.default !== undefined && !same(old.default, now.default)) {
			diff.breaking.push(
				`${flag}: default ${JSON.stringify(old.default)} -> ${JSON.stringify(now.default)}`,
			);
		}
		if (old.enum) {
			const lost = now.enum ? missing(old.enum, now.enum) : [];
			if (lost.length) diff.breaking.push(`${flag}: lost value ${list(lost)}`);
		} else if (now.enum) {
			diff.breaking.push(`${flag}: now limited to ${list(now.enum)}`);
		}
		if (old.variadic !== now.variadic) {
			diff.breaking.push(`${flag}: variadic changed`);
		}
		if (old.env && old.env !== now.env) {
			diff.breaking.push(`${flag}: env ${old.env} -> ${now.env ?? "none"}`);
		}
		if (old.hidden !== now.hidden) {
			diff.breaking.push(`${flag}: hidden changed`);
		}
	}
	for (const option of added) {
		const flag = `${where} --${option.name}`;
		if (option.required) diff.breaking.push(`${flag}: added as required`);
		else diff.additions.push(`${flag}: added`);
	}
}

function diffArgs(
	where: string,
	before: SurfaceArg[],
	after: SurfaceArg[],
	diff: SurfaceDiff,
): void {
	before.forEach((old, index) => {
		const arg = `${where} <${old.name}> (position ${index + 1})`;
		const now = after[index];
		if (!now) {
			diff.breaking.push(`${arg}: removed`);
			return;
		}
		if (now.name !== old.name) {
			diff.breaking.push(`${arg}: is now <${now.name}>`);
		}
		if (!old.required && now.required) {
			diff.breaking.push(`${arg}: became required`);
		}
		const lost = old.enum && now.enum ? missing(old.enum, now.enum) : [];
		if (lost.length) diff.breaking.push(`${arg}: lost value ${list(lost)}`);
		if (!old.enum && now.enum) {
			diff.breaking.push(`${arg}: now limited to ${list(now.enum)}`);
		}
		if (old.variadic !== now.variadic) {
			diff.breaking.push(`${arg}: variadic changed`);
		}
	});
	for (const [index, arg] of after.slice(before.length).entries()) {
		const label = `${where} <${arg.name}> (position ${before.length + index + 1})`;
		if (arg.required) diff.breaking.push(`${label}: added as required`);
		else diff.additions.push(`${label}: added`);
	}
}

function diffCommand(
	path: string,
	old: SurfaceCommand,
	now: SurfaceCommand,
	diff: SurfaceDiff,
): void {
	const lostAliases = missing(old.aliases, now.aliases);
	if (lostAliases.length) {
		diff.breaking.push(`${path}: lost alias ${list(lostAliases)}`);
	}
	for (const key of ["hidden", "audience", "sandbox"] as const) {
		if (old[key] !== now[key]) {
			diff.breaking.push(
				`${path}: ${key} ${String(old[key] ?? "unset")} -> ${String(now[key] ?? "unset")}`,
			);
		}
	}
	diffOptions(path, old.options, now.options, diff);
	diffArgs(path, old.args, now.args, diff);
}

/** Removals and renames are breaking; anything new is an addition the baseline must record. */
export function diffSurface(
	baseline: CliSurface,
	live: CliSurface,
): SurfaceDiff {
	const diff: SurfaceDiff = { breaking: [], additions: [] };
	diffOptions("(global)", baseline.globalOptions, live.globalOptions, diff);
	const addedCommands = Object.keys(live.commands).filter(
		(path) => !(path in baseline.commands),
	);
	const parent = (path: string) => path.split(" ").slice(0, -1).join(" ");
	for (const [path, old] of Object.entries(baseline.commands)) {
		const now = live.commands[path];
		if (now) {
			diffCommand(path, old, now, diff);
			continue;
		}
		const siblings = addedCommands.filter(
			(added) => parent(added) === parent(path),
		);
		diff.breaking.push(
			`${path}: removed${siblings.length ? ` (added beside it: ${list(siblings)})` : ""}`,
		);
	}
	for (const path of addedCommands) {
		diff.additions.push(`${path}: added`);
	}
	return diff;
}
