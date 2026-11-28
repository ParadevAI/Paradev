import { readFile } from "node:fs/promises";
import path from "node:path";
import { SUPERSET_MANAGED_SKILLS } from "@superset/shared/plugins";

const MCP_SKILL_URL =
	"https://raw.githubusercontent.com/paradevai/skills/main/skills/superset-mcp/SKILL.md";
const MCP_SKILL_NAME = "superset-mcp";

export const BUNDLED_SKILLS_DIR = path.join(
	process.cwd(),
	"../../plugins/superset/skills",
);

/** Bundled skills first published as `superset-<name>`; those URLs must keep their names. */
const LEGACY_PREFIXED_SKILLS: ReadonlySet<string> = new Set([
	"10x",
	"automate",
	"contribute",
	"doctor",
	"feedback",
	"orchestrate",
	"setup",
	"standup",
]);

const LEGACY_PREFIX = "superset-";

function publishedName(skill: string): string {
	return LEGACY_PREFIXED_SKILLS.has(skill) ? `${LEGACY_PREFIX}${skill}` : skill;
}

export const SKILL_NAMES: readonly string[] = [
	...SUPERSET_MANAGED_SKILLS.map((skill) => publishedName(skill.name)),
	MCP_SKILL_NAME,
];

const BUNDLED_BY_PUBLISHED_NAME = new Map(
	SUPERSET_MANAGED_SKILLS.map((skill) => [
		publishedName(skill.name),
		skill.name,
	]),
);

export function isSkillName(value: string): boolean {
	return SKILL_NAMES.includes(value);
}

function withName(content: string, name: string): string {
	const end = content.indexOf("\n---\n", 4);
	if (!content.startsWith("---\n") || end === -1) return content;
	return (
		content.slice(0, end).replace(/^name:[^\n]*$/m, `name: ${name}`) +
		content.slice(end)
	);
}

export async function fetchSkill(name: string): Promise<string | null> {
	const bundled = BUNDLED_BY_PUBLISHED_NAME.get(name);
	if (bundled) {
		const content = await readFile(
			path.join(BUNDLED_SKILLS_DIR, bundled, "SKILL.md"),
			"utf-8",
		).catch(() => null);
		return content === null ? null : withName(content, name);
	}
	if (name !== MCP_SKILL_NAME) return null;
	const response = await fetch(MCP_SKILL_URL, { next: { revalidate: 3600 } });
	if (!response.ok) {
		return null;
	}
	return response.text();
}
