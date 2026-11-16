/**
 * Publishes the agent CLIs to each region's agent-tools drive, which boxes
 * mount read-only at `SANDBOX_PATHS.agents` instead of carrying the agents
 * on their own disks. Per region: a builder sandbox mounts the drive
 * read-write, writes each agent into `/<name>/<sha>/` (fetched by sha from
 * the asset bucket and verified, unpacked beside its target and renamed in),
 * then `/manifest.json` last, then prunes every sha that is neither in the
 * new manifest nor in the one it replaced.
 *
 *   bun run agent-tools [--region sfo1 ...]
 *
 * Needs VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID, VERCEL_SANDBOX_PROJECT_ID.
 * Reads the agent rows from bundle/assets.json, so run it after the release
 * that moved them.
 */
import { join } from "node:path";
import {
	SANDBOX_ASSET_BASE_URL,
	SANDBOX_PATHS,
	sandboxAgentToolsDrive,
} from "@superset/shared/sandbox/contract";
import {
	DEFAULT_SANDBOX_REGION,
	isSandboxRegionId,
	type SandboxRegionId,
} from "@superset/shared/sandbox/regions";
import { z } from "zod";
import { type Assets, assetObjectKey, loadAssets, SHA256 } from "./manifest";

/** Each agent's asset row, and its executable relative to the unpacked dir. */
export const AGENT_TOOLS = [
	{ name: "claude", bin: "claude" },
	{ name: "codex", bin: "bin/codex" },
	{ name: "pdev", bin: "pdev/pdev" },
] as const;

export const AGENT_TOOLS_MANIFEST = "manifest.json";

const agentToolSchema = z.object({
	name: z.string().regex(/^[a-z0-9-]+$/),
	sha: z.string().regex(SHA256),
	bin: z
		.string()
		.regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/)
		.refine((bin) => !bin.split("/").includes(".."), "no .. in bin"),
});
export const agentToolsManifestSchema = z.array(agentToolSchema);
export type AgentToolsManifest = z.infer<typeof agentToolsManifestSchema>;

export function agentToolsManifest(assets: Assets): AgentToolsManifest {
	return agentToolsManifestSchema.parse(
		AGENT_TOOLS.map(({ name, bin }) => {
			const asset = assets[name];
			if (!asset) throw new Error(`assets.json has no ${name} row`);
			return { name, sha: asset.sha256, bin };
		}),
	);
}

/** A drive that has never been published to, or holds a bad manifest, has none. */
export function parseAgentToolsManifest(
	text: string | null,
): AgentToolsManifest {
	if (text === null) return [];
	try {
		return agentToolsManifestSchema.parse(JSON.parse(text));
	} catch {
		return [];
	}
}

/** A box may hold a snapshot taken under the previous manifest, so its shas stay too. */
export function shasToKeep(
	previous: AgentToolsManifest,
	next: AgentToolsManifest,
): Record<string, string[]> {
	const keep: Record<string, Set<string>> = {};
	for (const { name, sha } of [...next, ...previous]) {
		keep[name] ??= new Set();
		keep[name].add(sha);
	}
	return Object.fromEntries(
		Object.entries(keep).map(([name, shas]) => [name, [...shas].sort()]),
	);
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** The script the builder runs as root against the drive mounted read-write at `root`. */
export function renderBuilderScript(args: {
	root: string;
	baseUrl: string;
	assets: Assets;
	previous: AgentToolsManifest;
	next: AgentToolsManifest;
}): string {
	const fetches = args.next.map(({ name, sha, bin }) => {
		const asset = args.assets[name];
		if (!asset || asset.sha256 !== sha) {
			throw new Error(`no asset row for ${name} at ${sha}`);
		}
		const archive = asset.suffix === ".tar.gz" ? "tar" : "file";
		return `publish ${[name, sha, bin, assetObjectKey(asset), archive].map(quote).join(" ")}`;
	});
	const prunes = Object.entries(shasToKeep(args.previous, args.next)).map(
		([name, shas]) => `prune ${quote(name)} ${shas.map(quote).join(" ")}`,
	);
	return `set -euo pipefail
root=${quote(args.root)}
base=${quote(args.baseUrl)}

publish() {
	local name="$1" sha="$2" bin="$3" key="$4" kind="$5"
	local target="\${root}/\${name}/\${sha}"
	if [ -x "\${target}/\${bin}" ]; then echo "\${name} \${sha:0:12} already published"; return 0; fi
	local tmp
	tmp="$(mktemp)"
	curl -fsSL --retry 5 --retry-delay 2 --retry-all-errors -o "$tmp" "\${base}/\${key}" ||
		curl -fsSL --retry 2 --retry-delay 2 --retry-all-errors -o "$tmp" "\${base}/\${key}?fresh=$(date +%s)"
	local got
	got="$(sha256sum "$tmp" | cut -d' ' -f1)"
	if [ "$got" != "$sha" ]; then echo "\${name}: expected \${sha}, got \${got}" >&2; rm -f "$tmp"; return 1; fi
	rm -rf "\${target}.partial"
	mkdir -p "\${target}.partial"
	if [ "$kind" = tar ]; then
		tar -xzf "$tmp" -C "\${target}.partial"
	else
		install -D -m 0755 "$tmp" "\${target}.partial/\${bin}"
	fi
	rm -f "$tmp"
	[ -x "\${target}.partial/\${bin}" ] || { echo "\${name}: no executable at \${bin}" >&2; return 1; }
	rm -rf "$target"
	mv -T "\${target}.partial" "$target"
	echo "\${name} \${sha:0:12} published"
}

prune() {
	local name="$1" dir sha keep
	shift
	for dir in "\${root}/\${name}"/*/; do
		[ -d "$dir" ] || continue
		dir="\${dir%/}"
		sha="\${dir##*/}"
		keep=0
		for want in "$@"; do [ "$sha" = "$want" ] && keep=1; done
		[ "$keep" = 1 ] || { rm -rf "$dir"; echo "\${name} \${sha:0:12} pruned"; }
	done
}

${fetches.join("\n")}
printf '%s\\n' ${quote(JSON.stringify(args.next, null, "\t"))} > "\${root}/.${AGENT_TOOLS_MANIFEST}.partial"
sync
mv -T "\${root}/.${AGENT_TOOLS_MANIFEST}.partial" "\${root}/${AGENT_TOOLS_MANIFEST}"
sync
${prunes.join("\n")}
sync
`;
}

function regionsFromArgv(argv: string[]): SandboxRegionId[] {
	const regions: SandboxRegionId[] = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] !== "--region") continue;
		const region = argv[i + 1] ?? "";
		if (!isSandboxRegionId(region)) throw new Error(`unknown region ${region}`);
		regions.push(region);
	}
	return regions.length ? regions : [DEFAULT_SANDBOX_REGION];
}

async function publishRegion(
	region: SandboxRegionId,
	assets: Assets,
	credentials: { token: string; teamId: string; projectId: string },
): Promise<void> {
	const { Drive, Sandbox } = await import("@vercel/sandbox");
	const root = SANDBOX_PATHS.agents;
	const drive = await Drive.getOrCreate({
		...credentials,
		name: sandboxAgentToolsDrive(region),
		region,
	});
	const builder = await Sandbox.create({
		...credentials,
		name: `agent-tools-builder-${region}-${Date.now().toString(36)}`,
		region,
		persistent: false,
		timeout: 20 * 60_000,
		mounts: { [root]: drive },
	});
	try {
		const previous = parseAgentToolsManifest(
			(
				await builder.readFileToBuffer({
					path: `${root}/${AGENT_TOOLS_MANIFEST}`,
				})
			)?.toString("utf8") ?? null,
		);
		const next = agentToolsManifest(assets);
		const result = await builder.runCommand({
			cmd: "bash",
			args: [
				"-c",
				renderBuilderScript({
					root,
					baseUrl: SANDBOX_ASSET_BASE_URL,
					assets,
					previous,
					next,
				}),
			],
			sudo: true,
		});
		console.log(`${region}: ${await result.stdout()}${await result.stderr()}`);
		if (result.exitCode !== 0) {
			throw new Error(`${region}: builder exited ${result.exitCode}`);
		}
	} finally {
		await builder.stop();
		await builder.delete();
	}
}

if (import.meta.main) {
	const credentials = {
		token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
		teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
		projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
	};
	if (!credentials.token || !credentials.teamId || !credentials.projectId) {
		console.error(
			"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID are required",
		);
		process.exit(1);
	}
	const assets = loadAssets(
		join(import.meta.dir, "..", "bundle", "assets.json"),
	);
	for (const region of regionsFromArgv(process.argv.slice(2))) {
		await publishRegion(region, assets, credentials);
	}
}
