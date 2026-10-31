import { type AccountCredentialKind, API_BILLING_MARKER } from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";

/**
 * Written into each profile dir this command creates, before the login runs,
 * holding the agent id. Remove deletes only dirs that carry it (host-service
 * usage/profile-remove.ts), so it never deletes a home the user or another
 * tool made.
 */
export const PROFILE_CREATED_MARKER = ".superset-created";

/** What slugifyProfileName produces: safe in a dir name and in quotes. */
const PROFILE_SLUG = /^[a-z0-9-]+$/;

/** Shell test that `$dir` holds no login yet. */
function holdsNoLogin(agent: ManagedAgent): string {
	const noApiLogin = `[ ! -e "$dir/${API_BILLING_MARKER}" ]`;
	return agent === "claude"
		? `[ ! -s "$dir/.credentials.json" ] && ${noApiLogin} && ! grep -qs oauthAccount "$dir/.claude.json"`
		: `[ ! -s "$dir/auth.json" ] && ${noApiLogin}`;
}

/**
 * The login, run in `$dir`. An API login writes its billing marker only
 * after the CLI exits 0. Codex reads the key from stdin: the script reads it
 * with echo off (sh has no `read -s`) and pipes it in, so the key never
 * appears in the command text or shell history.
 */
function loginScript(
	agent: ManagedAgent,
	credentialKind: AccountCredentialKind,
): string {
	const markApiBilling = `printf ${agent} > "$dir/${API_BILLING_MARKER}"`;
	if (agent === "claude") {
		return credentialKind === "api_key"
			? `CLAUDE_CONFIG_DIR="$dir" claude auth login --console && ${markApiBilling}`
			: 'CLAUDE_CONFIG_DIR="$dir" claude auth login';
	}
	if (credentialKind === "subscription") return 'CODEX_HOME="$dir" codex login';
	return `trap "stty echo 2>/dev/null" EXIT; trap "exit 130" INT TERM; printf "OpenAI API key: "; stty -echo 2>/dev/null; read -r key; stty echo 2>/dev/null; echo; [ -n "$key" ] && printf "%s" "$key" | CODEX_HOME="$dir" codex login --with-api-key && ${markApiBilling}`;
}

/**
 * The terminal command that signs a new profile dir into the agent. It is
 * one `sh -c` script with no single quote inside, so every login shell,
 * fish included, passes it to sh unchanged, and no alias or function from
 * the user's shell config runs in it. $HOME stays unexpanded on purpose: sh
 * resolves it, so the same command works over SSH to a remote host.
 *
 * The dir must be new: `codex login` logs out and revokes the login already
 * in its home before the browser step, and `claude auth login` replaces it.
 * So the script creates and marks the dir, or reuses one it marked earlier
 * that still holds no login ("Try again"), and otherwise exits before the
 * login runs. `command mkdir` fails on an existing dir even when the
 * environment exports a `mkdir` function.
 */
export function addAccountCommand(
	agent: ManagedAgent,
	slug: string,
	credentialKind: AccountCredentialKind,
): string {
	if (!PROFILE_SLUG.test(slug)) {
		throw new Error(`Not a profile name slug: ${JSON.stringify(slug)}`);
	}
	const marker = `"$dir/${PROFILE_CREATED_MARKER}"`;
	const create = `{ command mkdir "$dir" 2>/dev/null && printf ${agent} > ${marker}; }`;
	const reuse = `{ [ -f ${marker} ] && ${holdsNoLogin(agent)}; }`;
	const refuse = `{ printf "Paradev: %s already exists. Choose another profile name.\\n" "$dir" >&2; exit 1; }`;
	const script = `dir="$HOME/.${agent}-${slug}"; ${create} || ${reuse} || ${refuse}; ${loginScript(agent, credentialKind)}`;
	return `sh -c '${script}'`;
}
