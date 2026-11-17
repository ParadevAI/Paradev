/**
 * Publishes the agent CLIs of one bundle to a drive per region,
 * `agent-tools-<region>-<bundle sha 12>`, which boxes mount read-only at
 * `SANDBOX_PATHS.agents` instead of carrying the agents on their own disks.
 *
 * A drive is written once and never again: a box that takes its snapshot
 * mount while a writer still holds the drive read-write gets a corrupt
 * filesystem. So a builder sandbox writes the drive (each agent fetched by
 * sha from the asset bucket and verified, `/manifest.json` last), is
 * stopped, and the drive counts as published only once the builder has
 * stopped and the drive is detached. The release publishes before any
 * environment row points at the bundle, so no box mounts a drive mid-write.
 *
 *   bun run agent-tools --bundle <sha> [--region sfo1 ...]
 *
 * Needs VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID, VERCEL_SANDBOX_PROJECT_ID.
 * The agent rows come from bundle/assets.json, so they must be that bundle's.
 */
import { join } from "node:path";
import {
	SANDBOX_AGENT_TOOLS_DRIVE_PATTERN,
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

/** A drive that was never finished, or holds a bad manifest, has none. */
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

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** The script the builder runs as root against the empty drive mounted read-write at `root`. */
export function renderBuilderScript(args: {
	root: string;
	baseUrl: string;
	assets: Assets;
	manifest: AgentToolsManifest;
}): string {
	const fetches = args.manifest.map(({ name, sha, bin }) => {
		const asset = args.assets[name];
		if (!asset || asset.sha256 !== sha) {
			throw new Error(`no asset row for ${name} at ${sha}`);
		}
		const archive = asset.suffix === ".tar.gz" ? "tar" : "file";
		return `publish ${[name, sha, bin, assetObjectKey(asset), archive].map(quote).join(" ")}`;
	});
	return `set -euo pipefail
root=${quote(args.root)}
base=${quote(args.baseUrl)}

publish() {
	local name="$1" sha="$2" bin="$3" key="$4" kind="$5"
	local target="\${root}/\${name}/\${sha}"
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
	echo "\${name} \${sha:0:12} written"
}

${fetches.join("\n")}
printf '%s\\n' ${quote(JSON.stringify(args.manifest, null, "\t"))} > "\${root}/.${AGENT_TOOLS_MANIFEST}.partial"
sync
mv -T "\${root}/.${AGENT_TOOLS_MANIFEST}.partial" "\${root}/${AGENT_TOOLS_MANIFEST}"
sync
`;
}

/** What the publish needs from the provider; `vercelDriveHost` is the real one. */
export interface DriveHost {
	/** Null when no drive has the name. */
	find(name: string): Promise<{ attachedTo?: string } | null>;
	list(prefix: string): Promise<string[]>;
	create(name: string, region: SandboxRegionId): Promise<void>;
	/** Throws while the drive is attached to a sandbox. */
	remove(name: string): Promise<void>;
	/** Through a read-only snapshot mount; null when the drive has no manifest. */
	readManifest(name: string, region: SandboxRegionId): Promise<string | null>;
	/** Resolves only once the builder has stopped and the drive is detached. */
	write(name: string, region: SandboxRegionId, script: string): Promise<void>;
}

/**
 * Idempotent on the bundle: a drive that has a manifest is published and is
 * left alone; one without (an earlier run that failed) is deleted and
 * written again.
 */
export async function publishAgentToolsDrive(args: {
	host: DriveHost;
	region: SandboxRegionId;
	bundleSha: string;
	assets: Assets;
	baseUrl?: string;
}): Promise<{ drive: string; outcome: "exists" | "published" }> {
	const drive = sandboxAgentToolsDrive(args.region, args.bundleSha);
	const manifest = agentToolsManifest(args.assets);
	const existing = await args.host.find(drive);
	if (existing?.attachedTo) {
		throw new Error(
			`${drive} is attached to ${existing.attachedTo}; an earlier publish may still be writing it`,
		);
	}
	if (existing) {
		const found = parseAgentToolsManifest(
			await args.host.readManifest(drive, args.region),
		);
		if (found.length > 0) return { drive, outcome: "exists" };
		await args.host.remove(drive);
	}
	await args.host.create(drive, args.region);
	await args.host.write(
		drive,
		args.region,
		renderBuilderScript({
			root: SANDBOX_PATHS.agents,
			baseUrl: args.baseUrl ?? SANDBOX_ASSET_BASE_URL,
			assets: args.assets,
			manifest,
		}),
	);
	return { drive, outcome: "published" };
}

/** Agent-tools drives no environment row's bundle and region name any more. */
export function agentToolsDrivesToPrune(
	drives: readonly string[],
	referenced: ReadonlySet<string>,
): string[] {
	return drives.filter(
		(name) =>
			SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(name) && !referenced.has(name),
	);
}

/** Returns the drives it could not delete; a drive a sandbox holds is retried next release. */
export async function pruneAgentToolsDrives(args: {
	host: DriveHost;
	referenced: ReadonlySet<string>;
}): Promise<{ deleted: string[]; kept: string[] }> {
	const deleted: string[] = [];
	const kept: string[] = [];
	for (const name of agentToolsDrivesToPrune(
		await args.host.list("agent-tools-"),
		args.referenced,
	)) {
		try {
			await args.host.remove(name);
			deleted.push(name);
		} catch {
			kept.push(name);
		}
	}
	return { deleted, kept };
}

interface VercelCredentials {
	token: string;
	teamId: string;
	projectId: string;
}

export function vercelDriveHost(credentials: VercelCredentials): DriveHost {
	const sdk = () => import("@vercel/sandbox");
	const isNotFound = async (error: unknown) => {
		const { APIError } = await sdk();
		return error instanceof APIError && error.response.status === 404;
	};
	const getDrive = async (name: string) => {
		const { Drive } = await sdk();
		try {
			return await Drive.get({ ...credentials, name });
		} catch (error) {
			if (await isNotFound(error)) return null;
			throw error;
		}
	};
	const builderName = (region: string) =>
		`agent-tools-builder-${region}-${Date.now().toString(36)}`;
	const stopAndDelete = async (
		builder: import("@vercel/sandbox").Sandbox,
		drive: string,
	) => {
		const { Sandbox } = await sdk();
		await builder.stop();
		const deadline = Date.now() + 3 * 60_000;
		for (;;) {
			const box = await Sandbox.get({
				...credentials,
				name: builder.name,
				resume: false,
			});
			const attached = (await getDrive(drive))?.currentSandboxName;
			if (box.status === "stopped" && !attached) break;
			if (Date.now() > deadline) {
				throw new Error(`${builder.name} did not stop and release ${drive}`);
			}
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
		await builder.delete();
	};
	return {
		async find(name) {
			const drive = await getDrive(name);
			return drive ? { attachedTo: drive.currentSandboxName } : null;
		},
		async list(prefix) {
			const { Drive } = await sdk();
			const names: string[] = [];
			for await (const drive of await Drive.list({
				...credentials,
				namePrefix: prefix,
				sortBy: "name",
			})) {
				names.push(drive.name);
			}
			return names;
		},
		async create(name, region) {
			const { Drive } = await sdk();
			await Drive.getOrCreate({ ...credentials, name, region });
		},
		async remove(name) {
			await (await getDrive(name))?.delete();
		},
		async readManifest(name, region) {
			const { Sandbox } = await sdk();
			const drive = await getDrive(name);
			if (!drive) return null;
			const reader = await Sandbox.create({
				...credentials,
				name: builderName(region),
				region,
				persistent: false,
				timeout: 5 * 60_000,
				mounts: { [SANDBOX_PATHS.agents]: drive.snapshot() },
			});
			try {
				return (
					(
						await reader.readFileToBuffer({
							path: `${SANDBOX_PATHS.agents}/${AGENT_TOOLS_MANIFEST}`,
						})
					)?.toString("utf8") ?? null
				);
			} finally {
				await reader.stop();
				await reader.delete();
			}
		},
		async write(name, region, script) {
			const { Sandbox } = await sdk();
			const drive = await getDrive(name);
			if (!drive) throw new Error(`${name} does not exist`);
			const builder = await Sandbox.create({
				...credentials,
				name: builderName(region),
				region,
				persistent: false,
				timeout: 20 * 60_000,
				mounts: { [SANDBOX_PATHS.agents]: drive },
			});
			let failure: Error | null = null;
			try {
				const result = await builder.runCommand({
					cmd: "bash",
					args: ["-c", script],
					sudo: true,
				});
				console.log(
					`${name}: ${await result.stdout()}${await result.stderr()}`,
				);
				if (result.exitCode !== 0) {
					failure = new Error(`${name}: builder exited ${result.exitCode}`);
				}
			} finally {
				await stopAndDelete(builder, name);
			}
			if (failure) throw failure;
		},
	};
}

function argValues(argv: string[], flag: string): string[] {
	return argv.flatMap((arg, i) =>
		arg === flag && argv[i + 1] ? [argv[i + 1] as string] : [],
	);
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
	const credentials = {
		token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
		teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
		projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
	};
	const [bundleSha] = argValues(argv, "--bundle");
	if (!credentials.token || !credentials.teamId || !credentials.projectId) {
		console.error(
			"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID are required",
		);
		process.exit(1);
	}
	if (!bundleSha || !SHA256.test(bundleSha)) {
		console.error("--bundle <sha256> is required");
		process.exit(1);
	}
	const regions = argValues(argv, "--region");
	const unknown = regions.filter((region) => !isSandboxRegionId(region));
	if (unknown.length) {
		console.error(`unknown region ${unknown.join(", ")}`);
		process.exit(1);
	}
	const assets = loadAssets(
		join(import.meta.dir, "..", "bundle", "assets.json"),
	);
	const host = vercelDriveHost(credentials);
	for (const region of regions.length
		? (regions as SandboxRegionId[])
		: [DEFAULT_SANDBOX_REGION]) {
		const { drive, outcome } = await publishAgentToolsDrive({
			host,
			region,
			bundleSha,
			assets,
		});
		console.log(`${drive}: ${outcome}`);
	}
}
