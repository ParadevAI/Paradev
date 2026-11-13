import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ContextCheckout,
	listSkillFolderLeftovers,
	removeWorkspaceContextFiles,
	writeWorkspaceContextFiles,
} from "./workspace-context-files";

let root: string;
let warn: ReturnType<typeof spyOn>;

beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "context-files-")));
	warn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
	rmSync(root, { recursive: true, force: true });
});

function checkout(name: string, isPrimary = false): ContextCheckout {
	const path = join(root, name);
	mkdirSync(path, { recursive: true });
	return { name, path, branch: "feature/x", isPrimary };
}

function addSkill(repo: ContextCheckout, folder: string, name: string) {
	const dir = join(repo.path, folder, "skills", name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "SKILL.md"), `# ${name}\n`);
}

const linkAt = (folder: string, name: string) =>
	join(root, folder, "skills", name);

test("AGENTS.md lists each repository and points at the instruction files it has", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	writeFileSync(join(web.path, "AGENTS.md"), "web rules");
	writeFileSync(join(web.path, "CLAUDE.md"), "@AGENTS.md");

	writeWorkspaceContextFiles(root, [api, web]);

	const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
	expect(agents).toContain(`| web | ${web.path} | feature/x |`);
	expect(agents).toContain(
		`- web: ${join(web.path, "AGENTS.md")}, ${join(web.path, "CLAUDE.md")}`,
	);
	expect(agents).toContain("- api: no AGENTS.md or CLAUDE.md at its root");
	expect(agents).not.toContain("@");
	expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
});

test("each repository's skills are linked at the root, relative to it", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".agents", "deploy");
	addSkill(api, ".claude", "migrate");

	writeWorkspaceContextFiles(root, [api, web]);

	expect(readlinkSync(linkAt(".agents", "deploy"))).toBe(
		"../../web/.agents/skills/deploy",
	);
	expect(readlinkSync(linkAt(".claude", "migrate"))).toBe(
		"../../api/.claude/skills/migrate",
	);
	expect(existsSync(linkAt(".claude", "deploy"))).toBe(false);
});

test("a .claude/skills that links to .agents/skills gives one link per folder", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".agents", "deploy");
	mkdirSync(join(web.path, ".claude"));
	symlinkSync("../.agents/skills", join(web.path, ".claude", "skills"));

	writeWorkspaceContextFiles(root, [api, web]);

	expect(
		readFileSync(join(linkAt(".agents", "deploy"), "SKILL.md"), "utf8"),
	).toBe("# deploy\n");
	expect(
		readFileSync(join(linkAt(".claude", "deploy"), "SKILL.md"), "utf8"),
	).toBe("# deploy\n");
	expect(warn).not.toHaveBeenCalled();
});

test("on a name clash the primary repository's skill wins and the other is logged", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(api, ".agents", "review");
	addSkill(web, ".agents", "review");

	writeWorkspaceContextFiles(root, [api, web]);

	expect(readlinkSync(linkAt(".agents", "review"))).toBe(
		"../../web/.agents/skills/review",
	);
	expect(String(warn.mock.calls[0]?.[0])).toContain(
		"skipped .agents/skills/review of api",
	);
});

test("a skill file the host did not make is never replaced", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".agents", "deploy");
	mkdirSync(join(root, ".agents", "skills", "deploy"), { recursive: true });
	writeFileSync(join(root, ".agents", "skills", "deploy", "SKILL.md"), "mine");

	writeWorkspaceContextFiles(root, [api, web]);

	expect(lstatSync(linkAt(".agents", "deploy")).isDirectory()).toBe(true);
	expect(
		readFileSync(join(linkAt(".agents", "deploy"), "SKILL.md"), "utf8"),
	).toBe("mine");
});

test("links to skills that are gone are reaped; links elsewhere are kept", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".agents", "deploy");
	addSkill(web, ".agents", "old");
	writeWorkspaceContextFiles(root, [api, web]);
	const elsewhere = join(root, "elsewhere");
	mkdirSync(elsewhere);
	symlinkSync(elsewhere, linkAt(".agents", "mine"));
	rmSync(join(web.path, ".agents", "skills", "old"), { recursive: true });

	writeWorkspaceContextFiles(root, [api, web]);

	expect(existsSync(linkAt(".agents", "deploy"))).toBe(true);
	expect(lstatSync(join(root, ".agents", "skills")).isDirectory()).toBe(true);
	expect(() => lstatSync(linkAt(".agents", "old"))).toThrow();
	expect(readlinkSync(linkAt(".agents", "mine"))).toBe(elsewhere);
});

test("removing takes the files and the host's links, and leaves what a user put there", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".agents", "deploy");
	addSkill(api, ".claude", "migrate");
	writeWorkspaceContextFiles(root, [api, web]);
	writeFileSync(join(root, ".claude", "settings.local.json"), "{}");
	const paths = [api.path, web.path];

	expect(listSkillFolderLeftovers(root, paths)).toEqual([
		".claude/settings.local.json",
	]);
	removeWorkspaceContextFiles(root, paths);

	expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
	expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
	expect(existsSync(join(root, ".agents"))).toBe(false);
	expect(existsSync(join(root, ".claude", "skills"))).toBe(false);
	expect(existsSync(join(root, ".claude", "settings.local.json"))).toBe(true);
});

test("without skills no agent folders are made at the root", () => {
	writeWorkspaceContextFiles(root, [checkout("web", true), checkout("api")]);

	expect(existsSync(join(root, ".agents"))).toBe(false);
	expect(existsSync(join(root, ".claude"))).toBe(false);
});
