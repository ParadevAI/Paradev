import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgvCommand } from "@superset/shared/agent-prompt-launch";
import type { ResolvedHostAgentConfig } from "../../../terminal-agents/agent-config";
import {
	readAccountIdentity,
	type SessionAccount,
} from "../usage/session-account/session-account";
import {
	accountLaunchUnsupportedReason,
	listLaunchAccounts,
	pinnedAccountCommandPrefix,
	resolveLaunchAccount,
	validatePinnedLaunchAccount,
} from "./launch-account";

const config: ResolvedHostAgentConfig = {
	id: "agent",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: [],
	promptTransport: "argv" as const,
	promptArgs: [],
	resumeArgs: ["--resume"],
	forkArgs: [],
	env: {},
};
const account = {
	agent: "claude",
	selection: "/profiles/work",
	directory: "/profiles/work",
	identity: "a".repeat(64),
	credentialKind: "subscription",
	email: "work@example.test",
} satisfies SessionAccount;
const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("explicit terminal account selection", () => {
	test("lists subscription metadata only and does not expose API credentials", async () => {
		const result = await listLaunchAccounts(config, async () => [
			account,
			{ ...account, credentialKind: "api_key" },
		]);
		expect(result.accounts).toEqual([
			{
				selection: account.selection,
				identity: account.identity,
				email: account.email,
				label: account.selection,
			},
		]);
	});

	test("rejects undiscovered paths, stale identities and terminal control characters", async () => {
		const discover = async () => [account];
		await expect(
			resolveLaunchAccount(
				config,
				{ selection: "/not/discovered", identity: account.identity },
				discover,
			),
		).rejects.toThrow("no longer available");
		await expect(
			resolveLaunchAccount(
				config,
				{ selection: account.selection, identity: "changed" },
				discover,
			),
		).rejects.toThrow("no longer available");
		const unsafe = {
			...account,
			selection: "/profile\ncommand",
			directory: "/profile\ncommand",
		};
		await expect(
			resolveLaunchAccount(config, unsafe, async () => [unsafe]),
		).rejects.toThrow("no longer available");
	});

	test("keeps explicit system selection distinct from inheriting a default", async () => {
		const system = {
			...account,
			selection: null,
			directory: "/home/test/.claude",
		};
		expect(
			await resolveLaunchAccount(config, system, async () => [system]),
		).toEqual({ ...system, pinned: true });
		const prefix = pinnedAccountCommandPrefix({ ...system, pinned: true }, {});
		expect(prefix).toContain("'-u' 'CLAUDE_CONFIG_DIR'");
		expect(prefix).not.toContain("'CLAUDE_CONFIG_DIR=");
	});

	test("rejects custom commands, config flags and per-agent authentication overrides", () => {
		const overrides: Partial<ResolvedHostAgentConfig>[] = [
			{ command: "custom-claude" },
			{ args: ["--settings=/other/settings.json"] },
			{ args: ["--resume", "old-session"] },
			{ args: ["resume"] },
			{ args: ["--remote", "other-server"] },
			{ args: ["--oss"] },
			{ args: ["-C", "/other"] },
			{ args: ["--cd=/other"] },
			{ args: ["-cmodel_provider=other"] },
			{ promptArgs: ["--continue"] },
			{ resumeArgs: ["--resume", "--settings", "/other"] },
			{ env: { HOME: "/other" } },
			{ env: { PATH: "/other/bin" } },
			{ env: { ANTHROPIC_API_KEY: "synthetic" } },
			{ env: { CLAUDE_CONFIG_DIR: "/other" } },
		];
		for (const changed of overrides)
			expect(
				accountLaunchUnsupportedReason({ ...config, ...changed }),
			).toBeDefined();
		expect(accountLaunchUnsupportedReason(config)).toBeUndefined();
	});

	test("accepts stock Claude and Codex arguments and exact native resume paths", () => {
		expect(
			accountLaunchUnsupportedReason({
				...config,
				args: ["--dangerously-skip-permissions"],
			}),
		).toBeUndefined();
		const codex = {
			...config,
			presetId: "codex",
			command: "codex",
			args: [
				"--dangerously-bypass-approvals-and-sandbox",
				"--dangerously-bypass-hook-trust",
			],
			promptArgs: ["--"],
			resumeArgs: ["resume"],
		};
		expect(accountLaunchUnsupportedReason(codex)).toBeUndefined();
		expect(
			accountLaunchUnsupportedReason({
				...codex,
				resumeArgs: ["resume", "--config", "model_provider=other"],
			}),
		).toBeDefined();
	});

	test("validates saved profile identity again before recovery", async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-launch-account-"));
		directories.push(dir);
		const file = join(dir, ".claude.json");
		await writeFile(
			file,
			JSON.stringify({
				oauthAccount: {
					accountUuid: "first",
					emailAddress: "first@example.test",
				},
			}),
		);
		const identity = await readAccountIdentity("claude", dir);
		if (!identity) throw new Error("Expected fixture identity");
		const pinned = {
			...account,
			...identity,
			selection: dir,
			directory: dir,
			pinned: true as const,
		};
		await validatePinnedLaunchAccount(config, pinned, {
			discover: async () => [pinned],
		});
		await writeFile(
			file,
			JSON.stringify({
				oauthAccount: {
					accountUuid: "second",
					emailAddress: "second@example.test",
				},
			}),
		);
		await expect(
			validatePinnedLaunchAccount(config, pinned, {
				discover: async () => [pinned],
			}),
		).rejects.toThrow("sign-in changed");
	});

	test("refuses recovery after a hook reported conflicting account metadata", async () => {
		await expect(
			validatePinnedLaunchAccount(
				config,
				{ ...account, pinned: true, conflict: true },
				{ validate: async () => true },
			),
		).rejects.toThrow("Nothing was launched");
	});

	test("isolates command env and retains quoted paths", () => {
		const pinned = {
			...account,
			directory: "/profiles/space 'quote $literal",
			pinned: true as const,
		};
		const script =
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable syntax
			'printf \'%s|%s|%s\' "$CLAUDE_CONFIG_DIR" "${ANTHROPIC_API_KEY-unset}" "$SUPERSET_PINNED_ACCOUNT"';
		const command =
			pinnedAccountCommandPrefix(pinned, {}) +
			buildArgvCommand(["bash", "-c", script]);
		const result = execFileSync("bash", ["-c", command], {
			encoding: "utf8",
			env: {
				PATH: process.env.PATH,
				CLAUDE_CONFIG_DIR: "/wrong",
				ANTHROPIC_API_KEY: "synthetic",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/wrong",
			},
		});
		expect(result).toBe(`${pinned.directory}|unset|CLAUDE_CONFIG_DIR`);
	});
});
