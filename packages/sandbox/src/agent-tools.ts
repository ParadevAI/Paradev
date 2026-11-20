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
 * A new drive starts as a fork of the region's newest earlier one, so the
 * builder fetches only the agents whose sha changed. Each agent fails alone:
 * it keeps the earlier drive's version, or is left out and boxes use the
 * image's copy.
 *
 *   bun run agent-tools --bundle <sha> [--region sfo1 ...]
 *   bun run agent-tools --bundle <current release sha> --prune-dry-run
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
export const AGENT_TOOLS: readonly AgentTool[] = [
	{ name: "claude", bin: "claude" },
	{ name: "codex", bin: "bin/codex" },
	{ name: "pdev", bin: "pdev/pdev" },
	{ name: "opencode", bin: "opencode" },
	{ name: "pi", bin: "pi/pi" },
];

export interface AgentTool {
	name: string;
	bin: string;
	/** Arguments the builder runs the agent with before it names it; the default is `--version`. */
	check?: readonly string[];
}

const DEFAULT_CHECK = ["--version"];
const CHECK_TIMEOUT_SECONDS = 30;

export const AGENT_TOOLS_MANIFEST = "manifest.json";

/** Agents a box used to carry on its own disk; a drive without one of them must not be released. */
export const REQUIRED_AGENT_TOOLS = ["claude", "codex", "pdev"] as const;

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

export function agentToolsManifest(
	assets: Assets,
	tools: readonly AgentTool[] = AGENT_TOOLS,
): AgentToolsManifest {
	return agentToolsManifestSchema.parse(
		tools.map(({ name, bin }) => {
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

export type AgentOutcome = "written" | "reused" | "kept-previous" | "dropped";

export interface AgentResult {
	name: string;
	outcome: AgentOutcome;
	/** The sha the new manifest names; absent when the agent was dropped. */
	sha?: string;
}

const RESULT_LINE =
	/^agent-tools-result ([a-z0-9-]+) (written|reused|kept-previous|dropped) ?([0-9a-f]{64})?$/gm;

export function parseBuilderResults(stdout: string): AgentResult[] {
	return [...stdout.matchAll(RESULT_LINE)].map(([, name, outcome, sha]) => ({
		name: name as string,
		outcome: outcome as AgentOutcome,
		...(sha ? { sha } : {}),
	}));
}

/**
 * The script the builder runs as root against the drive mounted read-write
 * at `root`: empty, or a fork of an earlier drive whose manifest is `previous`.
 */
export function renderBuilderScript(args: {
	root: string;
	baseUrl: string;
	assets: Assets;
	manifest: AgentToolsManifest;
	previous?: AgentToolsManifest;
	tools?: readonly AgentTool[];
	checkTimeoutSeconds?: number;
}): string {
	const tools = args.tools ?? AGENT_TOOLS;
	const agents = args.manifest.map(({ name, sha, bin }) => {
		const asset = args.assets[name];
		if (!asset || asset.sha256 !== sha) {
			throw new Error(`no asset row for ${name} at ${sha}`);
		}
		const archive = asset.suffix === ".tar.gz" ? "tar" : "file";
		const previous = args.previous?.find((entry) => entry.name === name);
		const check =
			tools.find((tool) => tool.name === name)?.check ?? DEFAULT_CHECK;
		return `agent ${[
			name,
			sha,
			bin,
			assetObjectKey(asset),
			archive,
			previous?.sha ?? "",
			previous?.bin ?? "",
			...check,
		]
			.map(quote)
			.join(" ")}`;
	});
	return `set -euo pipefail
shopt -s nullglob
root=${quote(args.root)}
base=${quote(args.baseUrl)}
declare -A keep_sha=()
entries=()

rm -f "\${root}/${AGENT_TOOLS_MANIFEST}" "\${root}/.${AGENT_TOOLS_MANIFEST}.partial"
sync

fetch() {
	local name="$1" sha="$2" bin="$3" key="$4" kind="$5"
	local target="\${root}/\${name}/\${sha}" tmp got
	tmp="$(mktemp)" || return 1
	if ! { curl -fsSL --retry 5 --retry-delay 2 --retry-all-errors -o "$tmp" "\${base}/\${key}" ||
		curl -fsSL --retry 2 --retry-delay 2 --retry-all-errors -o "$tmp" "\${base}/\${key}?fresh=$(date +%s)"; }; then
		echo "\${name}: download failed" >&2; rm -f "$tmp"; return 1
	fi
	got="$(sha256sum "$tmp" | cut -d' ' -f1)"
	if [ "$got" != "$sha" ]; then echo "\${name}: expected \${sha}, got \${got}" >&2; rm -f "$tmp"; return 1; fi
	rm -rf "\${target}.partial" && mkdir -p "\${target}.partial" || { rm -f "$tmp"; return 1; }
	if [ "$kind" = tar ]; then
		tar -xzf "$tmp" -C "\${target}.partial" || { echo "\${name}: unpack failed" >&2; rm -f "$tmp"; rm -rf "\${target}.partial"; return 1; }
	else
		install -D -m 0755 "$tmp" "\${target}.partial/\${bin}" || { rm -f "$tmp"; rm -rf "\${target}.partial"; return 1; }
	fi
	rm -f "$tmp"
	[ -x "\${target}.partial/\${bin}" ] || { echo "\${name}: no executable at \${bin}" >&2; rm -rf "\${target}.partial"; return 1; }
	rm -rf "$target" && mv -T "\${target}.partial" "$target"
}

smoke() {
	local dir="$1" bin="$2" home
	shift 2
	home="$(mktemp -d)" || return 1
	if (cd "$home" && HOME="$home" timeout -k 5 ${args.checkTimeoutSeconds ?? CHECK_TIMEOUT_SECONDS} "\${dir}/\${bin}" "$@" > "\${home}/.out" 2>&1 < /dev/null); then
		rm -rf "$home"; return 0
	fi
	echo "\${dir}/\${bin} $*: check failed: $(tail -c 300 "\${home}/.out")" >&2
	rm -rf "$home"; return 1
}

keep() {
	keep_sha[$1]="$2"
	entries+=("$(printf '{"name":"%s","sha":"%s","bin":"%s"}' "$1" "$2" "$3")")
}

agent() {
	local name="$1" sha="$2" bin="$3" key="$4" kind="$5" prev_sha="$6" prev_bin="$7" outcome=failed
	shift 7
	if [ -x "\${root}/\${name}/\${sha}/\${bin}" ]; then outcome=reused
	elif fetch "$name" "$sha" "$bin" "$key" "$kind"; then outcome=written
	fi
	if [ "$outcome" != failed ] && smoke "\${root}/\${name}/\${sha}" "$bin" "$@"; then
		keep "$name" "$sha" "$bin"
	elif [ -n "$prev_sha" ] && [ "$prev_sha" != "$sha" ] && [ -x "\${root}/\${name}/\${prev_sha}/\${prev_bin}" ] &&
		smoke "\${root}/\${name}/\${prev_sha}" "$prev_bin" "$@"; then
		outcome=kept-previous sha="$prev_sha"
		keep "$name" "$prev_sha" "$prev_bin"
	else
		outcome=dropped sha=
	fi
	echo "agent-tools-result \${name} \${outcome} \${sha}"
}

${agents.join("\n")}

for dir in "\${root}"/*/; do
	dir="\${dir%/}" name="\${dir##*/}"
	[[ "$name" =~ ^[a-z0-9-]+$ ]] || continue
	if [ -z "\${keep_sha[$name]:-}" ]; then rm -rf "$dir"; continue; fi
	for entry in "\${dir}"/* "\${dir}"/.[!.]*; do
		[ "\${entry##*/}" = "\${keep_sha[$name]}" ] || rm -rf "$entry"
	done
done

[ "\${#entries[@]}" -gt 0 ] || { echo "no agent could be published" >&2; exit 1; }
printf '[%s]\\n' "$(IFS=,; echo "\${entries[*]}")" > "\${root}/.${AGENT_TOOLS_MANIFEST}.partial"
sync
mv -T "\${root}/.${AGENT_TOOLS_MANIFEST}.partial" "\${root}/${AGENT_TOOLS_MANIFEST}"
sync
`;
}

export interface DriveEntry {
	name: string;
	createdAt: number;
	attachedTo?: string;
}

/** What the publish needs from the provider; `vercelDriveHost` is the real one. */
export interface DriveHost {
	/** Null when no drive has the name. */
	find(name: string): Promise<{ attachedTo?: string } | null>;
	list(prefix: string): Promise<DriveEntry[]>;
	create(name: string, region: SandboxRegionId): Promise<void>;
	/** Copy-on-write. The parent must have been written, stopped and detached. */
	fork(parent: string, name: string): Promise<void>;
	/** Throws while the drive is attached to a sandbox. */
	remove(name: string): Promise<void>;
	/** Through a read-only snapshot mount; null when the drive has no manifest. */
	readManifest(name: string, region: SandboxRegionId): Promise<string | null>;
	/**
	 * Renders the script from the manifest the mounted drive holds, runs it,
	 * and returns its stdout. Resolves only once the builder has stopped and
	 * the drive is detached.
	 */
	write(
		name: string,
		region: SandboxRegionId,
		script: (manifest: string | null) => string,
	): Promise<string>;
}

export interface AgentToolsPublish {
	drive: string;
	outcome: "exists" | "published";
	forkedFrom?: string;
	agents: AgentResult[];
	/** What the drive's manifest names once published. */
	available: { name: string; sha: string }[];
}

/** The region's newest other agent-tools drive that no sandbox holds read-write. */
export function previousAgentToolsDrive(
	drives: readonly DriveEntry[],
	region: SandboxRegionId,
	drive: string,
): string | undefined {
	return drives
		.filter(
			(entry) =>
				entry.name !== drive &&
				entry.name.startsWith(`agent-tools-${region}-`) &&
				SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(entry.name) &&
				!entry.attachedTo,
		)
		.sort((a, b) => b.createdAt - a.createdAt)[0]?.name;
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
	tools?: readonly AgentTool[];
	warn?: (line: string) => void;
}): Promise<AgentToolsPublish> {
	const warn = args.warn ?? ((line) => console.log(`::warning::${line}`));
	const drive = sandboxAgentToolsDrive(args.region, args.bundleSha);
	const manifest = agentToolsManifest(args.assets, args.tools);
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
		if (found.length > 0)
			return {
				drive,
				outcome: "exists",
				agents: [],
				available: found.map(({ name, sha }) => ({ name, sha })),
			};
		await args.host.remove(drive);
	}
	let forkedFrom: string | undefined;
	let parent: string | undefined;
	try {
		parent = previousAgentToolsDrive(
			await args.host.list(`agent-tools-${args.region}-`),
			args.region,
			drive,
		);
		if (parent) {
			await args.host.fork(parent, drive);
			forkedFrom = parent;
		}
	} catch (error) {
		warn(
			`agent-tools: ${drive} not forked from ${parent ?? "an earlier drive"}; writing every agent: ${String(error).slice(0, 300)}`,
		);
		if (await args.host.find(drive)) await args.host.remove(drive);
	}
	if (!forkedFrom) await args.host.create(drive, args.region);
	const stdout = await args.host.write(drive, args.region, (current) =>
		renderBuilderScript({
			root: SANDBOX_PATHS.agents,
			baseUrl: args.baseUrl ?? SANDBOX_ASSET_BASE_URL,
			assets: args.assets,
			manifest,
			previous: forkedFrom ? parseAgentToolsManifest(current) : [],
			tools: args.tools,
		}),
	);
	const agents = parseBuilderResults(stdout);
	return {
		drive,
		outcome: "published",
		...(forkedFrom ? { forkedFrom } : {}),
		agents,
		available: agents.flatMap(({ name, sha }) => (sha ? [{ name, sha }] : [])),
	};
}

export type RegionPublish =
	| { region: SandboxRegionId; result: AgentToolsPublish }
	| { region: SandboxRegionId; error: unknown };

/** Publishes `concurrency` regions at a time; a region that fails does not stop the others. */
export async function publishAgentToolsDrives(
	args: Omit<Parameters<typeof publishAgentToolsDrive>[0], "region"> & {
		regions: readonly SandboxRegionId[];
		concurrency?: number;
	},
): Promise<RegionPublish[]> {
	const { regions, concurrency = 6, ...rest } = args;
	const results: RegionPublish[] = [];
	let next = 0;
	const worker = async () => {
		while (next < regions.length) {
			const index = next++;
			const region = regions[index] as SandboxRegionId;
			try {
				results[index] = {
					region,
					result: await publishAgentToolsDrive({ ...rest, region }),
				};
			} catch (error) {
				results[index] = { region, error };
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, regions.length) }, worker),
	);
	return results;
}

/** One line per region and per agent that did not get the bundle's version; warnings start `::warning::`. */
export function describeAgentToolsPublish(
	results: readonly RegionPublish[],
	assets: Assets = {},
): string[] {
	return results.flatMap((entry) => {
		if ("error" in entry) {
			return [
				`::warning::agent-tools: ${entry.region} not published; its boxes keep the image's agents: ${String(entry.error).slice(0, 300)}`,
			];
		}
		const { drive, outcome, forkedFrom, agents } = entry.result;
		const summary = agents
			.map((agent) => `${agent.name} ${agent.outcome}`)
			.join(", ");
		return [
			`agent-tools: ${drive} ${outcome}${forkedFrom ? ` from ${forkedFrom}` : ""}${summary ? `: ${summary}` : ""}`,
			...agents.flatMap((agent) =>
				agent.outcome === "kept-previous"
					? [
							`::warning::agent-tools: ${entry.region}: ${agent.name} ${assets[agent.name]?.version ?? "of this bundle"} failed; ${drive} keeps ${agent.sha?.slice(0, 12)} from ${forkedFrom ?? "the earlier drive"}`,
						]
					: agent.outcome === "dropped"
						? [
								`::warning::agent-tools: ${drive}: ${agent.name} left out; its boxes keep the image's ${agent.name}, if the image has one`,
							]
						: [],
			),
		];
	});
}

/** One line per region a box needs whose drive is missing or lacks a required agent; empty means release. */
export function agentToolsGaps(
	results: readonly RegionPublish[],
	needed: ReadonlySet<string>,
	required: readonly string[] = REQUIRED_AGENT_TOOLS,
): string[] {
	return results.flatMap((entry) => {
		if (!needed.has(entry.region)) return [];
		if ("error" in entry) return [`${entry.region}: no drive`];
		const names = new Set(entry.result.available.map(({ name }) => name));
		const missing = required.filter((name) => !names.has(name));
		return missing.length
			? [`${entry.region}: ${entry.result.drive} has no ${missing.join(", ")}`]
			: [];
	});
}

/** A sandbox as the project listing shows it; `mounts` is what its next session mounts. */
export interface ListedSandbox {
	name: string;
	mounts?: Record<string, { drive: string }>;
}

/** One page of the project's sandbox listing; `next` is null on the last page. */
export interface SandboxPage {
	sandboxes: ListedSandbox[];
	next: string | null;
}

export type SandboxLister = (cursor: string | null) => Promise<SandboxPage>;

export const MAX_SANDBOX_LISTING_PAGES = 10_000;

/**
 * Every drive any sandbox in the project mounts, whatever its status or
 * database, with the sandboxes that mount it. Throws unless the listing is
 * whole: every page answered, each cursor new, and the sandboxes the caller
 * knows exist are in it.
 */
export async function listMountedDrives(
	lister: SandboxLister,
	expected: readonly string[] = [],
): Promise<{ sandboxes: number; mounted: Map<string, string[]> }> {
	const mounted = new Map<string, string[]>();
	const seenCursors = new Set<string>();
	const names = new Set<string>();
	let cursor: string | null = null;
	for (let pages = 0; ; pages++) {
		if (pages >= MAX_SANDBOX_LISTING_PAGES) {
			throw new Error(`listing has more than ${pages} pages`);
		}
		const page = await lister(cursor);
		for (const sandbox of page.sandboxes) {
			names.add(sandbox.name);
			for (const { drive } of Object.values(sandbox.mounts ?? {})) {
				mounted.set(drive, [...(mounted.get(drive) ?? []), sandbox.name]);
			}
		}
		if (page.next === null) break;
		if (seenCursors.has(page.next)) {
			throw new Error(`listing repeated cursor ${page.next.slice(0, 16)}`);
		}
		seenCursors.add(page.next);
		cursor = page.next;
	}
	if (names.size === 0) throw new Error("listing has no sandboxes");
	const missing = expected.filter((name) => !names.has(name));
	if (missing.length) {
		throw new Error(`listing lacks ${missing.join(", ")}`);
	}
	return { sandboxes: names.size, mounted };
}

export type PruneDecision =
	| { drive: string; action: "keep"; reason: string }
	| { drive: string; action: "delete" };

/**
 * A drive lives as long as a sandbox that mounts it: it is deleted once it
 * is not the current release's bundle and no sandbox lists it under mounts.
 */
export function agentToolsPrunePlan(args: {
	drives: readonly DriveEntry[];
	mounted: ReadonlyMap<string, readonly string[]>;
	currentBundle: string;
}): PruneDecision[] {
	const current = `-${args.currentBundle.slice(0, 12)}`;
	return args.drives
		.filter(({ name }) => SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(name))
		.map(({ name, attachedTo }): PruneDecision => {
			if (name.endsWith(current)) {
				return { drive: name, action: "keep", reason: "current release" };
			}
			const boxes = args.mounted.get(name) ?? [];
			if (boxes.length) {
				return {
					drive: name,
					action: "keep",
					reason: `mounted by ${boxes.length} sandbox(es), e.g. ${boxes[0]}`,
				};
			}
			if (attachedTo) {
				return {
					drive: name,
					action: "keep",
					reason: `attached to ${attachedTo}; next release retries`,
				};
			}
			return { drive: name, action: "delete" };
		})
		.sort((a, b) => a.drive.localeCompare(b.drive));
}

export type PruneOutcome =
	| { outcome: "skipped"; reason: string }
	| {
			outcome: "pruned" | "dry-run";
			kept: { drive: string; reason: string }[];
			deleted: string[];
			refused: string[];
	  };

/**
 * Deletes nothing unless both the drive listing and the whole sandbox
 * listing were read. A delete Vercel refuses (a drive still attached) is
 * skipped and retried by the next release; nothing is forced.
 */
export async function pruneAgentToolsDrives(args: {
	host: DriveHost;
	sandboxes: SandboxLister;
	currentBundle: string;
	expectedSandboxes?: readonly string[];
	dryRun: boolean;
	log: (line: string) => void;
}): Promise<PruneOutcome> {
	let drives: DriveEntry[];
	let listing: Awaited<ReturnType<typeof listMountedDrives>>;
	try {
		drives = await args.host.list("agent-tools-");
		listing = await listMountedDrives(args.sandboxes, args.expectedSandboxes);
	} catch (error) {
		const reason = `listing incomplete, deleted nothing: ${String(error).slice(0, 300)}`;
		args.log(`agent-tools: prune skipped; ${reason}`);
		return { outcome: "skipped", reason };
	}
	args.log(
		`agent-tools: ${drives.length} drives, ${listing.sandboxes} sandboxes listed, ${listing.mounted.size} drives mounted`,
	);
	const kept: { drive: string; reason: string }[] = [];
	const deleted: string[] = [];
	const refused: string[] = [];
	for (const decision of agentToolsPrunePlan({
		drives,
		mounted: listing.mounted,
		currentBundle: args.currentBundle,
	})) {
		if (decision.action === "keep") {
			kept.push({ drive: decision.drive, reason: decision.reason });
			args.log(`agent-tools: keep ${decision.drive}: ${decision.reason}`);
			continue;
		}
		if (args.dryRun) {
			deleted.push(decision.drive);
			args.log(`agent-tools: would delete ${decision.drive}`);
			continue;
		}
		try {
			await args.host.remove(decision.drive);
			deleted.push(decision.drive);
			args.log(`agent-tools: deleted ${decision.drive}`);
		} catch (error) {
			refused.push(decision.drive);
			args.log(
				`agent-tools: keep ${decision.drive}: Vercel refused the delete (${String(error).slice(0, 200)}); next release retries`,
			);
		}
	}
	args.log(
		`agent-tools: ${args.dryRun ? "dry run: would delete" : "deleted"} ${deleted.length}, kept ${kept.length + refused.length}`,
	);
	return {
		outcome: args.dryRun ? "dry-run" : "pruned",
		kept,
		deleted,
		refused,
	};
}

interface VercelCredentials {
	token: string;
	teamId: string;
	projectId: string;
}

const SandboxListingPage = z.object({
	sandboxes: z.array(
		z.object({
			name: z.string(),
			mounts: z.record(z.string(), z.object({ drive: z.string() })).optional(),
		}),
	),
	pagination: z.object({ next: z.string().nullable() }),
});

/** Every sandbox in the project, of any status; the SDK's own listing hides the pages. */
export function vercelSandboxLister(
	credentials: VercelCredentials,
	fetchPage: typeof fetch = fetch,
): SandboxLister {
	return async (cursor) => {
		const query = new URLSearchParams({
			teamId: credentials.teamId,
			project: credentials.projectId,
			limit: "50",
			...(cursor ? { cursor } : {}),
		});
		const response = await fetchPage(
			`https://api.vercel.com/v2/sandboxes?${query}`,
			{ headers: { authorization: `Bearer ${credentials.token}` } },
		);
		if (!response.ok) {
			throw new Error(
				`sandbox listing answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
		const page = SandboxListingPage.parse(await response.json());
		return { sandboxes: page.sandboxes, next: page.pagination.next };
	};
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
			const drives: DriveEntry[] = [];
			for await (const drive of await Drive.list({
				...credentials,
				namePrefix: prefix,
				sortBy: "name",
			})) {
				drives.push({
					name: drive.name,
					createdAt: drive.createdAt.getTime(),
					attachedTo: drive.currentSandboxName,
				});
			}
			return drives;
		},
		async create(name, region) {
			const { Drive } = await sdk();
			await Drive.getOrCreate({ ...credentials, name, region });
		},
		async fork(parent, name) {
			const drive = await getDrive(parent);
			if (!drive) throw new Error(`${parent} does not exist`);
			await drive.fork({ name });
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
			let stdout = "";
			try {
				const current = await builder.readFileToBuffer({
					path: `${SANDBOX_PATHS.agents}/${AGENT_TOOLS_MANIFEST}`,
				});
				const result = await builder.runCommand({
					cmd: "bash",
					args: ["-c", script(current?.toString("utf8") ?? null)],
					sudo: true,
				});
				stdout = await result.stdout();
				console.log(`${name}: ${stdout}${await result.stderr()}`);
				if (result.exitCode !== 0) {
					failure = new Error(`${name}: builder exited ${result.exitCode}`);
				}
			} finally {
				await stopAndDelete(builder, name);
			}
			if (failure) throw failure;
			return stdout;
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
	const pruneDryRun = argv.includes("--prune-dry-run");
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
	if (pruneDryRun) {
		const result = await pruneAgentToolsDrives({
			host: vercelDriveHost(credentials),
			sandboxes: vercelSandboxLister(credentials),
			currentBundle: bundleSha,
			dryRun: true,
			log: console.log,
		});
		process.exit(result.outcome === "skipped" ? 1 : 0);
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
	const results = await publishAgentToolsDrives({
		host: vercelDriveHost(credentials),
		regions: regions.length
			? (regions as SandboxRegionId[])
			: [DEFAULT_SANDBOX_REGION],
		bundleSha,
		assets,
	});
	for (const line of describeAgentToolsPublish(results)) console.log(line);
	if (results.some((entry) => "error" in entry)) process.exit(1);
}
