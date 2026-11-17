import { describe, expect, test } from "bun:test";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import {
	CODEX_AUTH_PATH,
	deriveSandboxCredentials,
} from "../../../../lib/sandbox/credentials";
import { type SignInRow, signInsFromRows } from "./sign-ins";

type Row = SignInRow & { value: string };

const manual = (agent: string): Row => ({
	agent,
	kind: "api_key",
	baseUrl: null,
	provider: "manual",
	value: "",
});

const idToken = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(
	JSON.stringify({
		email: "ada@example.com",
		"https://api.openai.com/auth": { chatgpt_account_id: "acct_1" },
	}),
).toString("base64url")}.sig`;

const neverRead = {
	value: (): string => {
		throw new Error("a Manual row must not be decrypted");
	},
	chatgptTokens: async (): Promise<never> => {
		throw new Error("a Manual row must not renew a ChatGPT session");
	},
};

const claimFor = async (rows: Row[]) =>
	deriveSandboxCredentials({
		workspaceId: "11111111-2222-4333-8444-555555555555",
		environmentEnv: {},
		...(await signInsFromRows(rows, neverRead).then((signIns) => ({
			userAgentEnv: signIns.env,
			codexChatgpt: signIns.codexChatgpt,
		}))),
		githubToken: null,
		gitAuthor: { name: "Ada", email: "ada@example.com" },
	});

describe("signInsFromRows", () => {
	test("Manual gives the box nothing to write: no variable, no rule, no login file", async () => {
		const claim = await claimFor([manual("claude"), manual("codex")]);
		expect(claim.managedEnv.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
		expect(claim.managedEnv.ANTHROPIC_API_KEY).toBeUndefined();
		expect(claim.managedEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(claim.managedEnv.OPENAI_API_KEY).toBeUndefined();
		expect(claim.files.map((file) => file.path)).not.toContain(CODEX_AUTH_PATH);
		const allow =
			claim.networkPolicy === "allow-all"
				? {}
				: (claim.networkPolicy as { allow: Record<string, unknown> }).allow;
		expect(allow["api.anthropic.com"]).toBeUndefined();
		expect(allow["api.openai.com"]).toBeUndefined();
		expect(allow["chatgpt.com"]).toBeUndefined();
	});

	test("Manual is the same answer on every wake and refresh, so nothing is rewritten or renewed", async () => {
		const first = await signInsFromRows([manual("claude")], neverRead);
		const again = await signInsFromRows([manual("claude")], neverRead);
		expect(first).toEqual({ env: {}, codexChatgpt: null });
		expect(again).toEqual(first);
	});

	test("Manual for one agent leaves the other agent's sign-in as it was", async () => {
		const signIns = await signInsFromRows(
			[
				manual("claude"),
				{
					agent: "codex",
					kind: "api_key",
					baseUrl: null,
					provider: null,
					value: "sk-openai",
				},
			],
			{ ...neverRead, value: (row) => row.value },
		);
		expect(signIns.env).toEqual({ OPENAI_API_KEY: "sk-openai" });
	});

	test("a stored sign-in still reaches the box as before", async () => {
		const signIns = await signInsFromRows(
			[
				{
					agent: "claude",
					kind: "subscription",
					baseUrl: null,
					provider: null,
					value: "oat-mine",
				},
				{
					agent: "codex",
					kind: "subscription",
					baseUrl: null,
					provider: "chatgpt",
					value: "",
				},
			],
			{
				value: (row) => row.value,
				chatgptTokens: async () => ({
					accessToken: "at",
					refreshToken: "rt",
					idToken,
					accountId: "acct_1",
				}),
			},
		);
		expect(signIns.env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "oat-mine" });
		expect(signIns.codexChatgpt?.accessToken).toBe("at");

		const claim = await deriveSandboxCredentials({
			workspaceId: "11111111-2222-4333-8444-555555555555",
			environmentEnv: {},
			userAgentEnv: signIns.env,
			codexChatgpt: signIns.codexChatgpt,
			githubToken: null,
			gitAuthor: { name: "Ada", email: "ada@example.com" },
		});
		expect(claim.managedEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe(
			SANDBOX_CREDENTIAL_PLACEHOLDER,
		);
		expect(claim.files.map((file) => file.path)).toContain(CODEX_AUTH_PATH);
	});
});
