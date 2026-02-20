import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export function safeReadFile(path: string, maxBytes = 8_000): string | null {
	try {
		if (!existsSync(path)) return null;
		const stat = statSync(path);
		if (!stat.isFile() || stat.size > maxBytes) return null;
		return readFileSync(path, "utf-8");
	} catch {
		return null;
	}
}

export async function safeExec(
	cmd: string,
	cwd: string,
	timeoutMs = 3_000,
): Promise<string> {
	try {
		const { stdout } = await execAsync(cmd, { cwd, timeout: timeoutMs });
		return stdout.trim();
	} catch {
		return "";
	}
}

export function buildFileTree(
	cwd: string,
	maxDepth = 2,
	prefix = "",
): string[] {
	const lines: string[] = [];
	try {
		const entries = readdirSync(cwd, { withFileTypes: true })
			.filter(
				(e) =>
					!e.name.startsWith(".") &&
					e.name !== "node_modules" &&
					e.name !== "dist" &&
					e.name !== "build",
			)
			.sort((a, b) => {
				if (a.isDirectory() && !b.isDirectory()) return -1;
				if (!a.isDirectory() && b.isDirectory()) return 1;
				return a.name.localeCompare(b.name);
			})
			.slice(0, 40);

		for (const entry of entries) {
			const isDir = entry.isDirectory();
			lines.push(`${prefix}${isDir ? `${entry.name}/` : entry.name}`);
			if (isDir && maxDepth > 1) {
				lines.push(
					...buildFileTree(join(cwd, entry.name), maxDepth - 1, `${prefix}  `),
				);
			}
		}
	} catch {}
	return lines;
}

export async function gatherProjectContext(cwd: string): Promise<string> {
	const sections: string[] = [];

	const conventionFiles = [
		"AGENTS.md",
		"CLAUDE.md",
		".claude/CLAUDE.md",
		".cursorrules",
	];
	for (const file of conventionFiles) {
		const content = safeReadFile(join(cwd, file));
		if (content) {
			sections.push(
				`<project-conventions file="${file}">\n${content}\n</project-conventions>`,
			);
		}
	}

	const pkgContent = safeReadFile(join(cwd, "package.json"));
	if (pkgContent) {
		try {
			const pkg = JSON.parse(pkgContent);
			const summary = {
				name: pkg.name,
				description: pkg.description,
				scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
				dependencies: pkg.dependencies
					? Object.keys(pkg.dependencies).length
					: 0,
				devDependencies: pkg.devDependencies
					? Object.keys(pkg.devDependencies).length
					: 0,
			};
			sections.push(
				`<package-info>\n${JSON.stringify(summary, null, 2)}\n</package-info>`,
			);
		} catch {}
	}

	const tree = buildFileTree(cwd);
	if (tree.length > 0) {
		sections.push(
			`<file-tree root="${basename(cwd)}">\n${tree.join("\n")}\n</file-tree>`,
		);
	}

	const gitBranch = await safeExec("git branch --show-current", cwd);
	if (gitBranch) {
		const gitStatus = await safeExec("git status --short", cwd);
		const gitLog = await safeExec("git log --oneline -5 --no-decorate", cwd);
		const gitParts = [`Branch: ${gitBranch}`];
		if (gitStatus) gitParts.push(`Dirty files:\n${gitStatus}`);
		if (gitLog) gitParts.push(`Recent commits:\n${gitLog}`);
		sections.push(`<git-state>\n${gitParts.join("\n")}\n</git-state>`);
	}

	if (sections.length === 0) return "";

	return `\n\n# Project context (auto-injected)\n\nThe following is automatically gathered context about the current project workspace at \`${cwd}\`. Use this to understand the project without needing to explore from scratch.\n\n${sections.join("\n\n")}`;
}
