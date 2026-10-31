import {
	type AccountCredentialKind,
	API_BILLING_MARKER,
	apiBillingLoginCommand,
} from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";

/**
 * Written into each profile dir this command creates, before the login runs,
 * holding the agent id. Remove deletes only dirs that carry it (host-service
 * usage/profile-remove.ts), so it never deletes a home the user or another
 * tool made.
 */
export const PROFILE_CREATED_MARKER = ".superset-created";

/** Shell test that `$dir` holds no login yet. */
function holdsNoLogin(agent: ManagedAgent): string {
	const noApiLogin = `[ ! -e "$dir/${API_BILLING_MARKER}" ]`;
	return agent === "claude"
		? `[ ! -s "$dir/.credentials.json" ] && ${noApiLogin} && ! grep -qs '"oauthAccount"' "$dir/.claude.json"`
		: `[ ! -s "$dir/auth.json" ] && ${noApiLogin}`;
}

/**
 * The terminal command that signs a new profile dir into the agent. $HOME
 * stays unexpanded on purpose — the user's shell resolves it, so the same
 * command works over SSH to a remote host.
 *
 * The dir must be new: `codex login` logs out and revokes the login already
 * in its home before the browser step, and `claude auth login` replaces it.
 * So the command creates and marks the dir, or reuses one it marked earlier
 * that still holds no login ("Try again"), and otherwise exits before the
 * login runs. `slug` must come from slugifyProfileName.
 */
export function addAccountCommand(
	agent: ManagedAgent,
	slug: string,
	credentialKind: AccountCredentialKind,
): string {
	const marker = `"$dir/${PROFILE_CREATED_MARKER}"`;
	const create = `{ mkdir "$dir" 2>/dev/null && printf ${agent} > ${marker}; }`;
	const reuse = `{ [ -f ${marker} ] && ${holdsNoLogin(agent)}; }`;
	const refuse = `{ printf 'Paradev: %s already exists. Choose another profile name.\\n' "$dir" >&2; exit 1; }`;
	const login =
		credentialKind === "api_key"
			? apiBillingLoginCommand(agent, '"$dir"')
			: agent === "claude"
				? 'CLAUDE_CONFIG_DIR="$dir" claude auth login'
				: 'CODEX_HOME="$dir" codex login';
	return `(dir="$HOME/.${agent}-${slug}"; ${create} || ${reuse} || ${refuse}; ${login})`;
}
