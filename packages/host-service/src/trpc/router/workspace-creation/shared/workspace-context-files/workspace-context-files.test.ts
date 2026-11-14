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
	listAgentFolderLeftovers,
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

test("a | in a branch name does not break the repository table", () => {
	const web = { ...checkout("web", true), branch: "fix|pipe" };

	writeWorkspaceContextFiles(root, [web]);

	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		`| web | ${web.path} | fix\\|pipe |`,
	);
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

test("removing takes the files and the host's links, and leaves what a user put there", async () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".agents", "deploy");
	addSkill(api, ".claude", "migrate");
	writeWorkspaceContextFiles(root, [api, web]);
	writeFileSync(join(root, ".claude", "settings.local.json"), "{}");
	const paths = [api.path, web.path];

	expect(listAgentFolderLeftovers(root, paths)).toEqual([
		".claude/settings.local.json",
	]);
	await removeWorkspaceContextFiles(root, paths);

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

function addFile(repo: ContextCheckout, path: string, content = "{}") {
	mkdirSync(join(repo.path, path, ".."), { recursive: true });
	writeFileSync(join(repo.path, path), content);
}

test("the primary repository's agent config is linked at the root, only where it has it", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addFile(web, ".mcp.json");
	addFile(web, ".claude/settings.json");
	addFile(web, ".claude/settings.local.json");
	mkdirSync(join(web.path, ".cursor", "rules"), { recursive: true });
	addFile(api, ".codex/config.toml", "");

	writeWorkspaceContextFiles(root, [api, web]);

	expect(readlinkSync(join(root, ".mcp.json"))).toBe("web/.mcp.json");
	expect(readlinkSync(join(root, ".claude", "settings.json"))).toBe(
		"../web/.claude/settings.json",
	);
	expect(readlinkSync(join(root, ".cursor", "rules"))).toBe(
		"../web/.cursor/rules",
	);
	expect(existsSync(join(root, ".claude", "settings.local.json"))).toBe(false);
	expect(existsSync(join(root, ".codex"))).toBe(false);
	expect(existsSync(join(root, ".cursor", "mcp.json"))).toBe(false);
	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		"MCP servers and settings come from the primary repository (web).",
	);
});

test("without agent config the root AGENTS.md does not mention it", () => {
	writeWorkspaceContextFiles(root, [checkout("web", true), checkout("api")]);

	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).not.toContain(
		"MCP servers",
	);
});

test("a root config file the host did not make is never replaced or touched", async () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addFile(web, ".mcp.json");
	addFile(web, ".claude/settings.json");
	writeFileSync(join(root, ".mcp.json"), "mine");
	mkdirSync(join(root, ".claude"));
	writeFileSync(join(root, ".claude", "settings.local.json"), "approvals");
	const paths = [api.path, web.path];

	writeWorkspaceContextFiles(root, [api, web]);

	expect(readFileSync(join(root, ".mcp.json"), "utf8")).toBe("mine");
	expect(lstatSync(join(root, ".mcp.json")).isSymbolicLink()).toBe(false);
	expect(listAgentFolderLeftovers(root, paths)).toEqual([
		".mcp.json",
		".claude/settings.local.json",
	]);
	await removeWorkspaceContextFiles(root, paths);
	expect(readFileSync(join(root, ".mcp.json"), "utf8")).toBe("mine");
	expect(
		readFileSync(join(root, ".claude", "settings.local.json"), "utf8"),
	).toBe("approvals");
	expect(existsSync(join(root, ".claude", "settings.json"))).toBe(false);
});

test("config links follow the primary and are reaped when its file is gone", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addFile(web, ".mcp.json");
	addFile(web, ".codex/config.toml", "");
	addFile(api, ".mcp.json");
	writeWorkspaceContextFiles(root, [api, web]);

	writeWorkspaceContextFiles(root, [
		{ ...api, isPrimary: true },
		{ ...web, isPrimary: false },
	]);

	expect(readlinkSync(join(root, ".mcp.json"))).toBe("api/.mcp.json");
	expect(existsSync(join(root, ".codex"))).toBe(false);
	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		"primary repository (api)",
	);

	rmSync(join(api.path, ".mcp.json"));
	writeWorkspaceContextFiles(root, [{ ...api, isPrimary: true }, web]);

	expect(() => lstatSync(join(root, ".mcp.json"))).toThrow();
	expect(listAgentFolderLeftovers(root, [api.path, web.path])).toEqual([]);
});

test("a root without the primary's checkout links the config of its first repository by name", () => {
	const web = checkout("web");
	const api = checkout("api");
	addFile(web, ".mcp.json");
	addFile(api, ".mcp.json");

	writeWorkspaceContextFiles(root, [web, api]);

	expect(readlinkSync(join(root, ".mcp.json"))).toBe("api/.mcp.json");
	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		"MCP servers and settings come from api, as this workspace has no checkout of the primary repository.",
	);
});

test("removing takes the config links and the folders made for them", async () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addFile(web, ".mcp.json");
	addFile(web, ".cursor/mcp.json");
	mkdirSync(join(web.path, ".cursor", "rules"));
	const paths = [api.path, web.path];
	writeWorkspaceContextFiles(root, [api, web]);

	expect(listAgentFolderLeftovers(root, paths)).toEqual([]);
	await removeWorkspaceContextFiles(root, paths);

	expect(() => lstatSync(join(root, ".mcp.json"))).toThrow();
	expect(existsSync(join(root, ".cursor"))).toBe(false);
	expect(existsSync(join(web.path, ".cursor", "rules"))).toBe(true);
});

test("a root CLAUDE.md that links into a checkout is replaced, not written through", () => {
	const web = checkout("web", true);
	const api = checkout("api");
	writeFileSync(join(web.path, "CLAUDE.md"), "web rules");
	symlinkSync(join(web.path, "CLAUDE.md"), join(root, "CLAUDE.md"));

	writeWorkspaceContextFiles(root, [api, web]);

	expect(readFileSync(join(web.path, "CLAUDE.md"), "utf8")).toBe("web rules");
	expect(lstatSync(join(root, "CLAUDE.md")).isFile()).toBe(true);
	expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
});

test("nothing is written or removed through a root agent folder that is a symlink", async () => {
	const web = checkout("web", true);
	const api = checkout("api");
	addSkill(web, ".claude", "deploy");
	addFile(web, ".claude/settings.json");
	const outside = join(root, "home-claude");
	mkdirSync(join(outside, "skills"), { recursive: true });
	symlinkSync(
		join(web.path, ".claude", "skills", "deploy"),
		join(outside, "skills", "mine"),
	);
	symlinkSync(outside, join(root, ".claude"));
	const paths = [api.path, web.path];

	writeWorkspaceContextFiles(root, [api, web]);
	await removeWorkspaceContextFiles(root, paths);

	expect(lstatSync(join(root, ".claude")).isSymbolicLink()).toBe(true);
	expect(existsSync(join(outside, "skills", "deploy"))).toBe(false);
	expect(existsSync(join(outside, "settings.json"))).toBe(false);
	expect(lstatSync(join(outside, "skills", "mine")).isSymbolicLink()).toBe(
		true,
	);
});

test("a checkout at a root entry's name is never written, linked into or removed", async () => {
	const web = checkout("web", true);
	const claude = checkout(".claude");
	const agents = checkout("AGENTS.md");
	const app = checkout(".paradev");
	addSkill(web, ".claude", "deploy");
	addFile(web, ".claude/settings.json", "web");
	addSkill(claude, "", "own");
	symlinkSync("own", join(claude.path, "skills", "alias"));
	addFile(claude, "settings.json", "claude repo");
	addFile(app, "attachments/notes.txt", "kept");
	const all = [web, claude, agents, app];
	const paths = all.map((repo) => repo.path);

	writeWorkspaceContextFiles(root, all);

	expect(lstatSync(join(root, "AGENTS.md")).isDirectory()).toBe(true);
	expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toContain(
		`| web | ${web.path} | feature/x |`,
	);
	expect(existsSync(linkAt(".claude", "deploy"))).toBe(false);
	expect(listAgentFolderLeftovers(root, paths)).toEqual([]);

	await removeWorkspaceContextFiles(root, paths);

	expect(lstatSync(join(root, "AGENTS.md")).isDirectory()).toBe(true);
	expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
	expect(readlinkSync(linkAt(".claude", "alias"))).toBe("own");
	expect(readFileSync(join(claude.path, "settings.json"), "utf8")).toBe(
		"claude repo",
	);
	expect(readFileSync(join(app.path, "attachments", "notes.txt"), "utf8")).toBe(
		"kept",
	);
});
