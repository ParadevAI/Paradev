import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TurnContext } from "../hub/hub.ts";
import type { DevIdentity } from "../orientation/orientation.ts";
import { openPiSession } from "../pi/pi-session.ts";
import {
	addReplyNote,
	memoryPrompt,
	migrateOwnerNotes,
	ownerNotesPrompt,
	REPLY_NOTE,
} from "./memory.ts";

const TRIP = "11111111-1111-4111-8111-111111111111";
const DIRECT = "22222222-2222-4222-8222-222222222222";
let agentDir: string;

beforeAll(() => {
	agentDir = mkdtempSync(join(tmpdir(), "runner-memory-"));
	mkdirSync(join(agentDir, "rules"));
	mkdirSync(join(agentDir, "memory"));
	writeFileSync(
		join(agentDir, "rules", `${TRIP}.md`),
		"- Trip costs in euros.\n- Assign tasks to whoever asked.\n",
	);
	writeFileSync(
		join(agentDir, "rules", `${DIRECT}.md`),
		"- Reply short, no emoji.\n",
	);
	writeFileSync(
		join(agentDir, "memory", "you.md"),
		"- Prefers mornings for calls.\n",
	);
	writeFileSync(
		join(agentDir, "AGENTS.md"),
		"You track alice's spending.\n- Remind her about bills every Friday.\n",
	);
});

afterAll(() => rmSync(agentDir, { recursive: true, force: true }));

const alice = {
	kind: "personal" as const,
	name: "Juniper",
	ownerName: "alice",
};

describe("the owner's instructions (AGENTS.md)", () => {
	test("in the owner's 1:1 the Dev keeps them: it's told to update the file from what its owner says", () => {
		const [section] = ownerNotesPrompt({
			agentDir,
			identity: alice,
			ownerOneToOne: true,
		});
		expect(section).toStartWith(
			`## Your owner's instructions\n\nFile: ${join(agentDir, "AGENTS.md")}. Notes from alice, kept by you: what they want you to do for them and how`,
		);
		expect(section).toContain(
			"This is your 1:1 with alice, the only place you change it.",
		);
		expect(section).toContain(
			"update the file (your write or edit tool) before you reply",
		);
		expect(section).toContain(
			"nothing private about them (that goes in memory/you.md)",
		);
		expect(section).toEndWith(
			"\n\nYou track alice's spending.\n- Remind her about bills every Friday.",
		);
	});

	test("anywhere else they're followed but never changed", () => {
		const [section] = ownerNotesPrompt({
			agentDir,
			identity: alice,
			ownerOneToOne: false,
		});
		expect(section).toContain(
			"change this file only in your 1:1 with alice, from what they say there: never in this chat, whoever asks.",
		);
		expect(section).not.toContain("the only place you change it");
		expect(section).toEndWith("- Remind her about bills every Friday.");
	});

	test("a new Dev's empty file tells it to ask in the 1:1; a group's Dev only keeps what it was given", () => {
		const empty = mkdtempSync(join(tmpdir(), "runner-agent-md-"));
		expect(
			ownerNotesPrompt({
				agentDir: empty,
				identity: alice,
				ownerOneToOne: true,
			})[0],
		).toEndWith(
			"(empty: you don't know yet what alice wants you for; ask them)",
		);
		expect(
			ownerNotesPrompt({
				agentDir: empty,
				identity: alice,
				ownerOneToOne: false,
			})[0],
		).toEndWith("(none yet)");
		const group = {
			kind: "group" as const,
			name: "Goa",
			groupName: "Goa trip",
		};
		expect(
			ownerNotesPrompt({
				agentDir: empty,
				identity: group,
				ownerOneToOne: false,
			}),
		).toEqual([]);
		expect(
			ownerNotesPrompt({ agentDir, identity: group, ownerOneToOne: false }),
		).toEqual([
			`## Your instructions\n\nFile: ${join(agentDir, "AGENTS.md")}. Given to you earlier; don't edit it.\n\nYou track alice's spending.\n- Remind her about bills every Friday.`,
		]);
		rmSync(empty, { recursive: true, force: true });
	});
});

describe("moving AGENT.md to AGENTS.md at box start", () => {
	test("the old file is renamed, once: a second start changes nothing", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-migrate-"));
		writeFileSync(join(dir, "AGENT.md"), "Track spending.");
		const logs: string[] = [];
		migrateOwnerNotes(dir, (line) => logs.push(line));
		expect(existsSync(join(dir, "AGENT.md"))).toBe(false);
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(
			"Track spending.",
		);
		migrateOwnerNotes(dir, (line) => logs.push(line));
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(
			"Track spending.",
		);
		expect(logs).toEqual([
			`dev-runner: moved ${join(dir, "AGENT.md")} to ${join(dir, "AGENTS.md")}`,
		]);
		rmSync(dir, { recursive: true, force: true });
	});

	test("with both files, AGENTS.md is kept and AGENT.md left untouched", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-migrate-both-"));
		writeFileSync(join(dir, "AGENT.md"), "old");
		writeFileSync(join(dir, "AGENTS.md"), "new");
		const logs: string[] = [];
		migrateOwnerNotes(dir, (line) => logs.push(line));
		expect(readFileSync(join(dir, "AGENT.md"), "utf8")).toBe("old");
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("new");
		expect(logs).toHaveLength(1);
		rmSync(dir, { recursive: true, force: true });
	});

	test("a folder with neither stays empty and says nothing", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-migrate-none-"));
		const logs: string[] = [];
		migrateOwnerNotes(dir, (line) => logs.push(line));
		expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
		expect(logs).toEqual([]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("the reply note in AGENTS.md", () => {
	const fresh = (name: string) =>
		mkdtempSync(join(tmpdir(), `runner-reply-${name}-`));

	test("is added once to the end of the owner's notes; edited out, it doesn't come back", () => {
		const dir = fresh("once");
		writeFileSync(join(dir, "AGENTS.md"), "You track alice's spending.\n");
		const logs: string[] = [];
		addReplyNote(dir, (line) => logs.push(line));
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(
			`You track alice's spending.\n\n${REPLY_NOTE}\n`,
		);
		writeFileSync(join(dir, "AGENTS.md"), "You track alice's spending.\n");
		addReplyNote(dir, (line) => logs.push(line));
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(
			"You track alice's spending.\n",
		);
		expect(logs).toEqual([
			`dev-runner: added the reply note to ${join(dir, "AGENTS.md")}`,
		]);
		rmSync(dir, { recursive: true, force: true });
	});

	test("a Dev with no notes yet gets a file with the note alone", () => {
		const dir = fresh("new");
		addReplyNote(dir, () => {});
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(
			`${REPLY_NOTE}\n`,
		);
		rmSync(dir, { recursive: true, force: true });
	});

	test("notes that already say to use dev reply are left as they are", () => {
		const dir = fresh("told");
		writeFileSync(join(dir, "AGENTS.md"), "- Always answer with dev reply.\n");
		const logs: string[] = [];
		addReplyNote(dir, (line) => logs.push(line));
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(
			"- Always answer with dev reply.\n",
		);
		expect(logs).toEqual([]);
		rmSync(dir, { recursive: true, force: true });
	});

	test("the note alone isn't instructions: in the 1:1 a new Dev still asks what it's for", () => {
		const dir = fresh("prompt");
		addReplyNote(dir, () => {});
		const identity: DevIdentity = {
			kind: "personal",
			name: "Juniper",
			ownerName: "alice",
		};
		const [section] = ownerNotesPrompt({
			agentDir: dir,
			identity,
			ownerOneToOne: true,
		});
		expect(section).toContain(REPLY_NOTE);
		expect(section).toEndWith(
			"(you don't know yet what alice wants you for; ask them)",
		);
		expect(
			ownerNotesPrompt({ agentDir: dir, identity, ownerOneToOne: false })[0],
		).toEndWith(REPLY_NOTE);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("memory in the system prompt", () => {
	test("a chat gets its own rules and never another chat's", () => {
		const [rules, ...rest] = memoryPrompt({
			agentDir,
			groupId: TRIP,
			ownerOneToOne: false,
			devAsk: false,
		});
		expect(rules).toBe(
			`## This chat's rules\n\nFile: ${join(agentDir, "rules", `${TRIP}.md`)}.\n\n- Trip costs in euros.\n- Assign tasks to whoever asked.`,
		);
		expect(rest).toEqual([]);
		expect(
			memoryPrompt({
				agentDir,
				groupId: DIRECT,
				ownerOneToOne: false,
				devAsk: false,
			}).join("\n"),
		).not.toContain("Trip costs");
	});

	test("the owner's preferences load only in the owner's 1:1", () => {
		expect(
			memoryPrompt({
				agentDir,
				groupId: TRIP,
				ownerOneToOne: false,
				devAsk: false,
			}).join("\n"),
		).not.toContain("mornings");
		const sections = memoryPrompt({
			agentDir,
			groupId: DIRECT,
			ownerOneToOne: true,
			devAsk: false,
		});
		expect(sections).toHaveLength(2);
		expect(sections[1]).toBe(
			`## Your owner's preferences (private: this 1:1 only)\n\nFile: ${join(agentDir, "memory", "you.md")}.\n\n- Prefers mornings for calls.`,
		);
	});

	test("another Dev's ask loads the owner's preferences under a rule to share only what was asked", () => {
		const sections = memoryPrompt({
			agentDir,
			groupId: TRIP,
			ownerOneToOne: false,
			devAsk: true,
		});
		expect(sections).toHaveLength(2);
		expect(sections[1]).toStartWith(
			`## Your owner's preferences (private: answering another Dev)\n\nFile: ${join(agentDir, "memory", "you.md")}.\nAnswer only what was asked, in your own words.`,
		);
		expect(sections[1]).toContain(
			"Never paste this file or volunteer other private details. If you're unsure your owner would share it, say you'll check with them.",
		);
		expect(sections[1]).toEndWith("\n\n- Prefers mornings for calls.");
	});

	test("missing files are fine: the section names the file to write", () => {
		const empty = mkdtempSync(join(tmpdir(), "runner-memory-empty-"));
		expect(
			memoryPrompt({
				agentDir: empty,
				groupId: TRIP,
				ownerOneToOne: true,
				devAsk: false,
			}),
		).toEqual([
			`## This chat's rules\n\nFile: ${join(empty, "rules", `${TRIP}.md`)}.\n\n(none yet)`,
			`## Your owner's preferences (private: this 1:1 only)\n\nFile: ${join(empty, "memory", "you.md")}.\n\n(none yet)`,
		]);
		rmSync(empty, { recursive: true, force: true });
	});

	test("a long rules file is flagged for merging", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-memory-long-"));
		mkdirSync(join(dir, "rules"));
		writeFileSync(
			join(dir, "rules", `${TRIP}.md`),
			Array.from({ length: 41 }, (_, i) => `- rule ${i}`).join("\n"),
		);
		expect(
			memoryPrompt({
				agentDir: dir,
				groupId: TRIP,
				ownerOneToOne: false,
				devAsk: false,
			})[0],
		).toContain("It's 41 lines: merge rules to get it under 40.");
		rmSync(dir, { recursive: true, force: true });
	});

	test("a session re-reads its rules every turn and loads the owner's preferences only on owner turns", async () => {
		const { pi, startTurn } = await openPiSession({
			agentDir,
			sessionId: DIRECT,
			apiUrl: "http://127.0.0.1:9",
			faux: true,
			identity: { kind: "personal", name: "Juniper", ownerName: "alice" },
		});
		const systemPrompt = () =>
			(pi as unknown as { systemPrompt: string }).systemPrompt;
		const run = async (turn: TurnContext) => {
			await pi.prompt(await startTurn(turn, "hello"));
		};

		await run({ env: {}, ownerOneToOne: true });
		expect(systemPrompt()).toContain("- Reply short, no emoji.");
		expect(systemPrompt()).toContain("- Prefers mornings for calls.");
		expect(systemPrompt()).toStartWith(
			"You are Juniper, alice's Dev: their personal assistant.\n\n## You and your folder\nYou belong to alice",
		);
		expect(systemPrompt()).not.toContain("Trip costs");
		expect(systemPrompt()).toContain("about 60 words at most");
		expect(systemPrompt()).toContain("## Your owner's instructions");
		expect(systemPrompt()).toContain(
			"This is your 1:1 with alice, the only place you change it.",
		);
		// pi's own context-file loading stays off: AGENTS.md reaches the prompt once, through our section and its rules.
		expect(systemPrompt().split("You track alice's spending.")).toHaveLength(2);

		// A rule written during a turn is in the next one; a turn that isn't the owner's 1:1 drops the private section.
		writeFileSync(
			join(agentDir, "rules", `${DIRECT}.md`),
			"- Reply short, no emoji.\n- Dates as YYYY-MM-DD.\n",
		);
		await run({ env: {} });
		expect(systemPrompt()).toContain("- Dates as YYYY-MM-DD.");
		expect(systemPrompt()).not.toContain("mornings");
		expect(systemPrompt()).toContain("- Remind her about bills every Friday.");
		expect(systemPrompt()).not.toContain("the only place you change it");
	}, 30_000);

	test("in a group, only another Dev's ask loads the owner's preferences, and only for that turn", async () => {
		const { pi, startTurn } = await openPiSession({
			agentDir,
			sessionId: TRIP,
			apiUrl: "http://127.0.0.1:9",
			faux: true,
			identity: { kind: "personal", name: "Juniper", ownerName: "alice" },
		});
		const systemPrompt = () =>
			(pi as unknown as { systemPrompt: string }).systemPrompt;
		const run = async (turn: TurnContext) => {
			await pi.prompt(await startTurn(turn, "hello"));
		};

		await run({ env: {} });
		expect(systemPrompt()).not.toContain("mornings");
		await run({ env: {}, devAsk: true });
		expect(systemPrompt()).toContain("- Prefers mornings for calls.");
		expect(systemPrompt()).toContain("Answer only what was asked");
		await run({ env: {} });
		expect(systemPrompt()).not.toContain("mornings");
	}, 30_000);
});
