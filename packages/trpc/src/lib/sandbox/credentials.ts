/**
 * What a cloud workspace sandbox is allowed to reach and what it presents.
 *
 * No credential enters the box. Every outbound credential is a header rule
 * on the sandbox firewall: the agent sends a placeholder, the firewall swaps
 * the header on the way out, and the value lives only here. The rules are
 * re-derived and re-applied on every wake and keepalive, so a token that
 * expires (the GitHub installation token lasts an hour) is never stale for
 * longer than one keepalive.
 *
 * What does reach the box is the managed environment: the environment's own
 * variables minus any provider credential, which a cloud workspace ignores,
 * and the placeholders the CLIs need to be willing to make a request at all,
 * pushed into host-service after boot and held in memory.
 */
import {
	agentCredentialToEnv,
	CLOUD_WORKSPACE_IGNORED_ENV_NAMES,
} from "@superset/shared/agent-credentials";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import { SANDBOX_PATHS } from "@superset/shared/sandbox-contract";
import {
	SANDBOX_API_CREDENTIAL_HEADER,
	sandboxApiCredential,
} from "@superset/shared/sandbox-gate";
import type { NetworkPolicy, NetworkPolicyRule } from "@vercel/sandbox";
import { env } from "../../env";
import type { CodexChatgptSignIn } from "../../router/agent-credential";

export interface SandboxCredentialInputs {
	/** Which workspace the box is, for the credential it presents to the API. */
	workspaceId: string;
	/** The environment's variables, as the person configured them. */
	environmentEnv: Record<string, string>;
	/** The workspace creator's own agent sign-ins, already decrypted. */
	userAgentEnv: Record<string, string>;
	/** The creator's ChatGPT sign-in for Codex, which is a file rather than a variable. */
	codexChatgpt?: CodexChatgptSignIn | null;
	/**
	 * The GitHub token the box's git and gh requests carry: the workspace
	 * creator's own user token when they have connected GitHub, else the App
	 * installation's, else none.
	 */
	githubToken: string | null;
	/** Who commits made on the box are by. */
	gitAuthor: GitAuthor;
}

export interface GitAuthor {
	name: string;
	email: string;
}

/**
 * The API's own hostname, as the firewall needs it: no scheme, no path. Null
 * where the API URL is not configured, which is a test and not a deployment.
 */
function apiHost(): string | null {
	try {
		return new URL(env.NEXT_PUBLIC_API_URL).host;
	} catch {
		return null;
	}
}

/**
 * A connected GitHub account commits under its no-reply address, which links
 * the commit to the profile and passes GitHub's "block pushes that expose my
 * email" setting; without one, the Superset account's name and email.
 */
export function gitAuthorFor(args: {
	github: { id: string; login: string; name: string | null } | null;
	user: { name: string; email: string };
}): GitAuthor {
	if (args.github) {
		return {
			name: args.github.name || args.github.login,
			email: `${args.github.id}+${args.github.login}@users.noreply.github.com`,
		};
	}
	return { name: args.user.name, email: args.user.email };
}

export interface SandboxFile {
	path: string;
	content: string;
}

export interface SandboxCredentials {
	networkPolicy: NetworkPolicy;
	managedEnv: Record<string, string>;
	/** Written into the box before every boot. */
	files: SandboxFile[];
}

const PDEV_ROUTER_HOST = "router.superset.sh";

export const CODEX_AUTH_PATH = `${SANDBOX_PATHS.home}/.codex/auth.json`;
/** Codex's system config layer: below the person's own `~/.codex/config.toml`. */
export const CODEX_SYSTEM_CONFIG_PATH = "/etc/codex/config.toml";

/**
 * Codex's built-in provider speaks WebSockets to chatgpt.com, and the
 * firewall refuses an upgrade on a host whose headers it rewrites; Codex then
 * spends ~10 s on retries before falling back to HTTPS. The built-in provider
 * cannot be reconfigured, so this is the same endpoint without WebSockets.
 */
const CODEX_CHATGPT_PROVIDER_CONFIG = `model_provider = "chatgpt"

[model_providers.chatgpt]
name = "OpenAI"
base_url = "https://chatgpt.com/backend-api/codex"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false
supports_standalone_web_search = true
`;

function unsignedJwt(claims: Record<string, unknown>): string {
	const part = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.unsigned`;
}

/**
 * Codex's own login file with nothing real in it. The tokens are the
 * placeholder, which the firewall swaps on the way out; the id token is
 * rebuilt unsigned from the claims Codex reads. A last refresh far ahead
 * keeps Codex from ever trying to renew with the placeholder: the API renews
 * the real session and the firewall carries the new token.
 */
function codexChatgptAuthFile(signIn: CodexChatgptSignIn): string {
	return JSON.stringify({
		auth_mode: "chatgpt",
		OPENAI_API_KEY: null,
		tokens: {
			id_token: unsignedJwt({
				email: signIn.identity.email,
				"https://api.openai.com/auth": {
					chatgpt_plan_type: signIn.identity.planType,
					chatgpt_user_id: signIn.identity.userId,
					chatgpt_account_id: signIn.accountId,
				},
			}),
			access_token: SANDBOX_CREDENTIAL_PLACEHOLDER,
			refresh_token: SANDBOX_CREDENTIAL_PLACEHOLDER,
			account_id: signIn.accountId,
		},
		last_refresh: "2099-01-01T00:00:00Z",
	});
}

function rule(headers: Record<string, string>): NetworkPolicyRule[] {
	return [{ transform: [{ headers }] }];
}

/** Sets `header` only on a request that presents the placeholder in it. */
function swap(
	header: string,
	placeholder: string,
	value: string,
): NetworkPolicyRule[] {
	return [
		{
			match: {
				headers: [{ key: { exact: header }, value: { exact: placeholder } }],
			},
			transform: [{ headers: { [header]: value } }],
		},
	];
}

/** A model credential is the person's sign-in and nothing else. */
export async function deriveSandboxCredentials(
	inputs: SandboxCredentialInputs,
): Promise<SandboxCredentials> {
	const allow: Record<string, NetworkPolicyRule[]> = {};
	const managedEnv: Record<string, string> = {};

	// GitHub tokens are dropped too: git and gh on the box speak through the
	// installation rule.
	const ignored = new Set<string>([
		...CLOUD_WORKSPACE_IGNORED_ENV_NAMES,
		"GH_TOKEN",
		"GITHUB_TOKEN",
	]);
	for (const [key, value] of Object.entries(inputs.environmentEnv)) {
		if (!ignored.has(key)) managedEnv[key] = value;
	}
	// git reads these over any user.name in a config file, so a commit on the
	// box is the person's without writing one; set after the environment's
	// variables because authorship belongs to the person, not the environment.
	managedEnv.GIT_AUTHOR_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_AUTHOR_EMAIL = inputs.gitAuthor.email;
	managedEnv.GIT_COMMITTER_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_COMMITTER_EMAIL = inputs.gitAuthor.email;

	const signIn = inputs.userAgentEnv;
	const hostOf = (baseUrl: string | undefined, fallback: string): string => {
		try {
			return baseUrl ? new URL(baseUrl).hostname : fallback;
		} catch {
			return fallback;
		}
	};

	// Anthropic: an OAuth token (a subscription) and a gateway key both
	// authenticate with a bearer, an API key with x-api-key. The CLI decides
	// which header it sends from which placeholder variable is set, so exactly
	// one is set.
	const anthropicHost = hostOf(signIn.ANTHROPIC_BASE_URL, "api.anthropic.com");
	const anthropicBearer =
		signIn.CLAUDE_CODE_OAUTH_TOKEN || signIn.ANTHROPIC_AUTH_TOKEN;
	if (anthropicBearer) {
		allow[anthropicHost] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${anthropicBearer}`,
		);
		if (signIn.CLAUDE_CODE_OAUTH_TOKEN) {
			managedEnv.CLAUDE_CODE_OAUTH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
		} else {
			managedEnv.ANTHROPIC_AUTH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
		}
	} else if (signIn.ANTHROPIC_API_KEY) {
		allow[anthropicHost] = swap(
			"x-api-key",
			SANDBOX_CREDENTIAL_PLACEHOLDER,
			signIn.ANTHROPIC_API_KEY,
		);
		managedEnv.ANTHROPIC_API_KEY = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}
	if (signIn.ANTHROPIC_BASE_URL) {
		managedEnv.ANTHROPIC_BASE_URL = signIn.ANTHROPIC_BASE_URL;
	}

	if (signIn.OPENAI_API_KEY) {
		allow[hostOf(signIn.OPENAI_BASE_URL, "api.openai.com")] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${signIn.OPENAI_API_KEY}`,
		);
		managedEnv.OPENAI_API_KEY = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}
	if (signIn.OPENAI_BASE_URL) {
		managedEnv.OPENAI_BASE_URL = signIn.OPENAI_BASE_URL;
	}

	// Codex on a ChatGPT plan: the sign-in is the login file, and the bearer
	// is swapped on the way out. Codex reads the login file before
	// OPENAI_API_KEY, so an API key rewrites it too, or a box that was signed
	// in with ChatGPT would stay so.
	const files: SandboxFile[] = [];
	if (inputs.codexChatgpt) {
		allow["chatgpt.com"] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${inputs.codexChatgpt.accessToken}`,
		);
		files.push({
			path: CODEX_AUTH_PATH,
			content: codexChatgptAuthFile(inputs.codexChatgpt),
		});
	} else if (signIn.OPENAI_API_KEY) {
		files.push({
			path: CODEX_AUTH_PATH,
			content: JSON.stringify({
				auth_mode: "apikey",
				OPENAI_API_KEY: SANDBOX_CREDENTIAL_PLACEHOLDER,
			}),
		});
	}
	files.push({
		path: CODEX_SYSTEM_CONFIG_PATH,
		content: inputs.codexChatgpt ? CODEX_CHATGPT_PROVIDER_CONFIG : "",
	});

	// GitHub: git speaks Basic with the token as the password, gh and the
	// REST API speak bearer. Both are the installation token, scoped to the
	// workspace's repository and re-minted before it expires.
	if (inputs.githubToken) {
		const basic = Buffer.from(`x-access-token:${inputs.githubToken}`).toString(
			"base64",
		);
		allow["github.com"] = rule({ Authorization: `Basic ${basic}` });
		allow["api.github.com"] = rule({
			Authorization: `Bearer ${inputs.githubToken}`,
		});
		allow["uploads.github.com"] = rule({
			Authorization: `Bearer ${inputs.githubToken}`,
		});
		// gh refuses to call without a token in hand; the value never matters.
		managedEnv.GH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}

	// The box's own hands: `superset` on its PATH speaks to the API as the
	// workspace, and the credential is added here rather than given to the box.
	// What it may do is narrowed on the API side, in sandboxCredentialProcedures.
	const api = apiHost();
	if (api) {
		const boxCredential = rule({
			[SANDBOX_API_CREDENTIAL_HEADER]: `${inputs.workspaceId}.${await sandboxApiCredential(
				env.SANDBOX_GATE_SECRET,
				inputs.workspaceId,
			)}`,
		});
		allow[api] = boxCredential;
		// pdev's router checks a caller by passing its headers to the API, so
		// the box's credential signs pdev in as the workspace's creator. A set
		// PDEV_TOKEN keeps pdev from asking `superset auth`, which a box refuses.
		allow[PDEV_ROUTER_HOST] = boxCredential;
		managedEnv.PDEV_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}

	// The catch-all keeps the rest of the internet reachable; without it a
	// custom policy denies everything it does not list.
	const networkPolicy: NetworkPolicy =
		Object.keys(allow).length === 0
			? "allow-all"
			: { allow: { ...allow, "*": [] } };
	return { networkPolicy, managedEnv, files };
}

/** Re-exported so callers build the user's env the one way the sign-in code does. */
export { agentCredentialToEnv };
