export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

export function parseGitHubRemote(
	remoteUrl: string,
): ParsedGitHubRemote | null {
	const trimmed = remoteUrl.trim();
	const patterns = [
		/^git@github\.com:(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?$/,
		/^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?$/,
		/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
	];

	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		if (!match?.groups?.owner || !match.groups.name) continue;

		return {
			provider: "github",
			owner: match.groups.owner,
			name: match.groups.name,
			url: `https://github.com/${match.groups.owner}/${match.groups.name}`,
		};
	}

	return null;
}

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
