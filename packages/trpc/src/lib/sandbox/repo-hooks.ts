/**
 * The hooks a repository declares for its cloud workspaces, read from
 * `.superset/config.toml` (else the v1 `.superset/config.json`) on the branch
 * a workspace is created from. Ports are the one key the control plane must
 * know before the box exists (a sandbox publishes its ports at create); the
 * box reads its own setup and terminals.
 */
import {
	fromV1Json,
	MAX_PREVIEW_PORTS,
	type ProjectConfig,
	parseProjectConfig,
	resolveProjectConfig,
} from "@superset/shared/project-config";
import type { RepositoryRow } from "./repositories";

export interface RepositoryHooks {
	ports?: number[];
}

const READ_TIMEOUT_MS = 5_000;

type RepoFileArgs = {
	repo: Pick<RepositoryRow, "owner" | "name">;
	branch: string;
	token: string | null;
};

/** The file's text, or null when it is absent or unreadable. */
async function readRepoFile(
	args: RepoFileArgs,
	path: string,
): Promise<string | null> {
	const url = `https://api.github.com/repos/${args.repo.owner}/${args.repo.name}/contents/${path}?ref=${encodeURIComponent(args.branch)}`;
	try {
		const response = await fetch(url, {
			headers: {
				accept: "application/vnd.github.raw+json",
				"x-github-api-version": "2022-11-28",
				...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
			},
			signal: AbortSignal.timeout(READ_TIMEOUT_MS),
		});
		return response.ok ? await response.text() : null;
	} catch (error) {
		console.warn(
			`[cloud-workspace] could not read ${path} on ${args.branch}`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

/** The ports with `preview = true`, as the cloud resolves them. */
function repoHooksFrom(config: ProjectConfig): RepositoryHooks {
	const ports = resolveProjectConfig({
		base: config,
		local: null,
		environment: "cloud",
	})
		.ports.filter((port) => port.preview)
		.map((port) => port.default)
		.slice(0, MAX_PREVIEW_PORTS);
	return ports.length > 0 ? { ports } : {};
}

export function repoHooksFromToml(text: string): RepositoryHooks | null {
	const parsed = parseProjectConfig(text);
	return parsed.ok ? repoHooksFrom(parsed.config) : null;
}

/** A v1 file is read through its conversion, like everywhere else. */
export function repoHooksFromJson(text: string): RepositoryHooks | null {
	try {
		return repoHooksFrom(fromV1Json(JSON.parse(text)));
	} catch {
		return null;
	}
}

export async function readRepoHooks(
	args: RepoFileArgs,
): Promise<RepositoryHooks | null> {
	const toml = await readRepoFile(args, ".superset/config.toml");
	if (toml !== null) return repoHooksFromToml(toml);
	const json = await readRepoFile(args, ".superset/config.json");
	return json === null ? null : repoHooksFromJson(json);
}
