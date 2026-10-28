import { accessSync, constants, existsSync } from "node:fs";
import type { AgentCliInstallSource } from "@superset/shared/agent-cli-status";

export type LatestVersionSource =
	| { kind: "npm"; name: string; tag: string }
	| { kind: "homebrew"; name: string; homebrewKind: "cask" | "formula" };

export type AgentCliUpdate = {
	source: AgentCliInstallSource;
	command: string | null;
	latest: LatestVersionSource | null;
};

/** The binary the Superset wrapper runs, and where that resolves to. */
export type AgentCliBinary = { path: string; realPath: string };

type CliPackage = {
	npm: string;
	casks: string[];
	formulae: string[];
	native?: {
		matches: (binary: AgentCliBinary) => boolean;
		args: string[];
		latest: LatestVersionSource;
	};
};

const AGENT_CLI_PACKAGES: Record<string, CliPackage> = {
	claude: {
		npm: "@anthropic-ai/claude-code",
		casks: ["claude-code", "claude-code@latest"],
		formulae: [],
		native: {
			matches: ({ path, realPath }) =>
				path.endsWith("/.local/bin/claude") ||
				realPath.includes("/.local/share/claude/") ||
				realPath.includes("/.claude/local/"),
			args: ["update"],
			// The native installer follows the stable or the latest channel, and
			// `stable` is never ahead of either.
			latest: { kind: "npm", name: "@anthropic-ai/claude-code", tag: "stable" },
		},
	},
	codex: { npm: "@openai/codex", casks: ["codex"], formulae: [] },
};

export function hasAgentCliUpdates(binary: string): boolean {
	return binary in AGENT_CLI_PACKAGES;
}

const SHELL_SAFE = /^[\w@%+=:,./-]+$/;

function shellQuote(value: string): string {
	return SHELL_SAFE.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWritable(path: string): boolean {
	try {
		accessSync(path, constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Picks the update for one install from where its binary lives, and never
 * runs one package manager over another's install: a source it cannot read
 * gets no command.
 */
export function resolveAgentCliUpdate(options: {
	binary: string;
	found: AgentCliBinary | null;
	runMode?: string | undefined;
	exists?: (path: string) => boolean;
	writable?: (path: string) => boolean;
}): AgentCliUpdate | null {
	const pkg = AGENT_CLI_PACKAGES[options.binary];
	if (!pkg) return null;
	if (options.runMode === "sandbox") {
		return { source: "managed", command: null, latest: null };
	}
	const npmLatest: LatestVersionSource = {
		kind: "npm",
		name: pkg.npm,
		tag: "latest",
	};
	const found = options.found;
	if (!found) return { source: "unknown", command: null, latest: null };
	const exists = options.exists ?? existsSync;
	const writable = options.writable ?? isWritable;
	const { path, realPath } = found;
	const tool = (candidate: string, fallback: string) =>
		exists(candidate) ? shellQuote(candidate) : fallback;

	if (pkg.native?.matches(found)) {
		return {
			source: "native",
			command: [shellQuote(path), ...pkg.native.args].join(" "),
			latest: pkg.native.latest,
		};
	}

	const brew = /^(.*)\/(Caskroom|Cellar)\/([^/]+)\//.exec(realPath);
	if (brew) {
		const [, prefix = "", dir, token = ""] = brew;
		const cask = dir === "Caskroom";
		if (!(cask ? pkg.casks : pkg.formulae).includes(token)) {
			return { source: "unknown", command: null, latest: npmLatest };
		}
		const brewBin = tool(`${prefix}/bin/brew`, "brew");
		return {
			source: "homebrew",
			command: cask
				? `${brewBin} upgrade --cask ${token}`
				: `${brewBin} upgrade ${token}`,
			latest: {
				kind: "homebrew",
				name: token,
				homebrewKind: cask ? "cask" : "formula",
			},
		};
	}

	const inPackage = `/node_modules/${escapeRegExp(pkg.npm)}[-/]`;
	const bun = new RegExp(`^(.*)/install/global${inPackage}`).exec(realPath);
	if (bun && path === `${bun[1]}/bin/${options.binary}`) {
		return {
			source: "bun",
			command: `${tool(`${bun[1]}/bin/bun`, "bun")} add -g ${pkg.npm}@latest`,
			latest: npmLatest,
		};
	}
	if (
		realPath.includes("/pnpm/global/") &&
		new RegExp(inPackage).test(realPath)
	) {
		return {
			source: "pnpm",
			command: `pnpm add -g ${pkg.npm}@latest`,
			latest: npmLatest,
		};
	}
	const npm = new RegExp(`^(.*)/lib${inPackage}`).exec(realPath);
	if (npm?.[1]) {
		const prefix = npm[1];
		const sudo = writable(`${prefix}/lib/node_modules`) ? "" : "sudo ";
		return {
			source: "npm",
			command: `${sudo}npm install -g --prefix ${shellQuote(prefix)} ${pkg.npm}@latest`,
			latest: npmLatest,
		};
	}
	return { source: "unknown", command: null, latest: npmLatest };
}
