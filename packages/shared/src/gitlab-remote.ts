import type { ParsedGitHubRemote } from "./github-remote";

export interface ParsedGitLabRemote
	extends Omit<ParsedGitHubRemote, "provider"> {
	provider: "gitlab";
}

/**
 * Only hosts named like GitLab: other hosts would spawn `glab` for nothing.
 * The owner carries the host (`host/group`): MRs of two instances never share
 * an identity, and no GitHub owner (no slash allowed) can match one.
 */
export function parseGitLabRemote(
	remoteUrl: string,
): ParsedGitLabRemote | null {
	const match =
		/^(?<scheme>git@|ssh:\/\/git@|https:\/\/)(?<host>[^/:]*gitlab[^/:]*)(?<port>:\d+)?[:/](?<owner>.+)\/(?<name>[^/]+?)(?:\.git)?\/?$/i.exec(
			remoteUrl.trim(),
		);
	const { scheme, host, port, owner, name } = match?.groups ?? {};
	if (!host || !owner || !name) return null;
	const origin = scheme === "https://" ? `${host}${port ?? ""}` : host;
	return {
		provider: "gitlab",
		owner: `${origin}/${owner}`,
		name,
		url: `https://${origin}/${owner}/${name}`,
	};
}
