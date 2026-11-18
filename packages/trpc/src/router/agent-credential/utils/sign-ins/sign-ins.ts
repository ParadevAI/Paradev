import {
	agentCredentialToEnv,
	CHATGPT_PROVIDER,
	isManualSignIn,
} from "@superset/shared/agent-credentials";
import { type ChatgptTokens, chatgptIdentity } from "../chatgpt";

/**
 * A ChatGPT sign-in as a box needs it: the access token for the firewall and
 * who it is. Never the refresh token, and never the id token itself, which
 * OpenAI would trade for more.
 */
export interface CodexChatgptSignIn {
	accessToken: string;
	accountId: string;
	identity: ReturnType<typeof chatgptIdentity>;
}

export interface AgentSignIns {
	/** What each signed-in agent reads from its environment. */
	env: Record<string, string>;
	codexChatgpt: CodexChatgptSignIn | null;
}

export interface SignInRow {
	agent: string;
	kind: "subscription" | "api_key";
	baseUrl: string | null;
	provider: string | null;
}

export async function signInsFromRows<Row extends SignInRow>(
	rows: Row[],
	deps: {
		value: (row: Row) => string;
		chatgptTokens: (row: Row) => Promise<ChatgptTokens | null>;
	},
): Promise<AgentSignIns> {
	const env: Record<string, string> = {};
	let codexChatgpt: CodexChatgptSignIn | null = null;
	for (const row of rows) {
		if (isManualSignIn(row)) continue;
		if (row.agent === "codex" && row.provider === CHATGPT_PROVIDER) {
			const tokens = await deps.chatgptTokens(row);
			if (!tokens) continue;
			codexChatgpt = {
				accessToken: tokens.accessToken,
				accountId: tokens.accountId,
				identity: chatgptIdentity(tokens.idToken),
			};
			continue;
		}
		Object.assign(
			env,
			agentCredentialToEnv({
				agent: row.agent,
				kind: row.kind,
				value: deps.value(row),
				baseUrl: row.baseUrl,
				provider: row.provider,
			}),
		);
	}
	return { env, codexChatgpt };
}
