/**
 * Sends a build that EAS already uploaded to App Store Connect to App Review:
 * pushes the listing (`eas metadata:push`), attaches the build to its App
 * Store version, sets "What's New" and submits. See RELEASE.md, "Shipping a
 * build". Run by .github/workflows/release-mobile.yml; locally, from
 * apps/mobile, after `eas login`:
 *
 *   bun run scripts/submit-review.ts --whats-new "…" [--build 140] [--dry-run]
 *   bun run scripts/submit-review.ts bump 1.2.1
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const EAS_CLI = "eas-cli@24.7.0";
const EXPO_PROJECT_ID = "fa9332a8-896a-4d2a-be5b-d82469b46e5d";
const BUNDLE_ID = "sh.superset.mobile";
const ASC = "https://api.appstoreconnect.apple.com";
const EDITABLE_STATES = new Set([
	"PREPARE_FOR_SUBMISSION",
	"DEVELOPER_REJECTED",
	"REJECTED",
	"METADATA_REJECTED",
	"INVALID_BINARY",
]);
const OPEN_SUBMISSION_STATES = [
	"READY_FOR_REVIEW",
	"WAITING_FOR_REVIEW",
	"IN_REVIEW",
	"UNRESOLVED_ISSUES",
];
const VERSION_FILES = ["app.config.ts", "store.config.js"];

type AscKey = { keyId: string; issuerId: string; keyP8: string };
type Resource = {
	id: string;
	type: string;
	attributes: Record<string, unknown>;
	relationships?: Record<string, { data?: { id: string } | null }>;
};
type AscResponse = {
	data: Resource | Resource[] | null;
	included?: Resource[];
};

export function nextPatch(version: string): string {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) throw new Error(`Not a x.y.z version: ${version}`);
	return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function replaceVersion(source: string, from: string, to: string) {
	const pattern = new RegExp(
		`(\\bversion: (?:process\\.env\\.APP_STORE_VERSION \\?\\? )?)"${from.replaceAll(".", "\\.")}"`,
	);
	if (!pattern.test(source)) return null;
	return source.replace(pattern, `$1"${to}"`);
}

function bump(from: string) {
	const to = nextPatch(from);
	for (const file of VERSION_FILES) {
		const path = join(mobileRoot, file);
		const updated = replaceVersion(readFileSync(path, "utf8"), from, to);
		if (updated === null) {
			console.log(`${file} is not on ${from}; leaving the version alone.`);
			return;
		}
		writeFileSync(path, updated);
	}
	console.log(`Bumped ${VERSION_FILES.join(" and ")} from ${from} to ${to}.`);
	output("bumped_to", to);
}

function output(name: string, value: string) {
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
	}
}

function base64url(bytes: ArrayBuffer | Uint8Array | string) {
	return Buffer.from(
		typeof bytes === "string" ? bytes : new Uint8Array(bytes),
	).toString("base64url");
}

async function ascToken({ keyId, issuerId, keyP8 }: AscKey) {
	const der = Buffer.from(
		keyP8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
		"base64",
	);
	const key = await crypto.subtle.importKey(
		"pkcs8",
		der,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(
		JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
	);
	const payload = base64url(
		JSON.stringify({
			iss: issuerId,
			iat: now,
			exp: now + 15 * 60,
			aud: "appstoreconnect-v1",
		}),
	);
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		key,
		new TextEncoder().encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${base64url(signature)}`;
}

function expoAuthHeaders(): Record<string, string> {
	if (process.env.EXPO_TOKEN) {
		return { authorization: `Bearer ${process.env.EXPO_TOKEN}` };
	}
	try {
		const state = JSON.parse(
			readFileSync(join(homedir(), ".expo/state.json"), "utf8"),
		);
		if (state.auth?.sessionSecret) {
			return { "expo-session": state.auth.sessionSecret };
		}
	} catch {}
	throw new Error("Set EXPO_TOKEN or run `eas login` first.");
}

async function expoGraphql<T>(query: string, variables: object): Promise<T> {
	const response = await fetch("https://api.expo.dev/graphql", {
		method: "POST",
		headers: { "content-type": "application/json", ...expoAuthHeaders() },
		body: JSON.stringify({ query, variables }),
	});
	const body = (await response.json()) as { data?: T; errors?: unknown };
	if (!response.ok || body.errors || !body.data) {
		throw new Error(`Expo API: ${JSON.stringify(body.errors ?? body)}`);
	}
	return body.data;
}

// The same key EAS Submit uploads with, so it lives in one place.
async function resolveAscKey(): Promise<AscKey> {
	const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
	if (ASC_KEY_ID && ASC_ISSUER_ID && ASC_KEY_P8) {
		return { keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, keyP8: ASC_KEY_P8 };
	}
	type Credentials = {
		app: {
			byId: {
				iosAppCredentials: {
					appleAppIdentifier: { bundleIdentifier: string };
					appStoreConnectApiKeyForSubmissions: { id: string } | null;
				}[];
			};
		};
	};
	const { app } = await expoGraphql<Credentials>(
		`query ($appId: String!) { app { byId(appId: $appId) { iosAppCredentials {
			appleAppIdentifier { bundleIdentifier }
			appStoreConnectApiKeyForSubmissions { id }
		} } } }`,
		{ appId: EXPO_PROJECT_ID },
	);
	const keyRef = app.byId.iosAppCredentials.find(
		(credentials) =>
			credentials.appleAppIdentifier.bundleIdentifier === BUNDLE_ID,
	)?.appStoreConnectApiKeyForSubmissions;
	if (!keyRef) throw new Error(`EAS has no ASC API key for ${BUNDLE_ID}.`);
	type Key = {
		appStoreConnectApiKey: {
			byId: { keyIdentifier: string; issuerIdentifier: string; keyP8: string };
		};
	};
	const { appStoreConnectApiKey } = await expoGraphql<Key>(
		`query ($id: ID!) { appStoreConnectApiKey { byId(id: $id) {
			keyIdentifier issuerIdentifier keyP8
		} } }`,
		{ id: keyRef.id },
	);
	const key = appStoreConnectApiKey.byId;
	return {
		keyId: key.keyIdentifier,
		issuerId: key.issuerIdentifier,
		keyP8: key.keyP8,
	};
}

function createAsc(key: AscKey, dryRun: boolean) {
	async function request(
		method: string,
		path: string,
		body?: object,
	): Promise<AscResponse> {
		if (dryRun && method !== "GET") {
			console.log(`[dry run] ${method} ${path} ${JSON.stringify(body ?? {})}`);
			return { data: { id: "dry-run", type: "", attributes: {} } };
		}
		if (dryRun && path.includes("dry-run")) return { data: [] };
		const response = await fetch(`${ASC}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${await ascToken(key)}`,
				"content-type": "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (response.status === 204) return { data: null };
		const json = await response.json();
		if (!response.ok) {
			throw new Error(
				`App Store Connect ${method} ${path} → ${response.status}: ${JSON.stringify(json.errors ?? json)}`,
			);
		}
		return json as AscResponse;
	}
	return {
		list: async (path: string) =>
			((await request("GET", path)).data ?? []) as Resource[],
		get: request.bind(null, "GET"),
		post: (path: string, body: object) => request("POST", path, body),
		patch: (path: string, body: object) => request("PATCH", path, body),
	};
}

type Asc = ReturnType<typeof createAsc>;

async function findBuild(
	asc: Asc,
	appId: string,
	buildNumber?: string,
): Promise<{ id: string; number: string; version: string }> {
	const query = new URLSearchParams({
		"filter[app]": appId,
		"filter[expired]": "false",
		sort: "-uploadedDate",
		limit: "10",
		include: "preReleaseVersion",
	});
	if (buildNumber) query.set("filter[version]", buildNumber);
	for (let attempt = 0; ; attempt++) {
		const response = await asc.get(`/v1/builds?${query}`);
		const builds = (response.data ?? []) as Resource[];
		const versions = new Map<string, string>(
			(response.included ?? []).map((version) => [
				version.id,
				String(version.attributes.version),
			]),
		);
		const build = builds.find(
			(candidate) =>
				candidate.attributes.processingState === "VALID" ||
				(buildNumber && candidate.attributes.processingState === "PROCESSING"),
		);
		if (build?.attributes.processingState === "VALID") {
			const versionId = build.relationships?.preReleaseVersion?.data?.id;
			const version = versionId ? versions.get(versionId) : undefined;
			if (!version) throw new Error(`Build ${build.id} has no version.`);
			return {
				id: build.id,
				number: String(build.attributes.version),
				version,
			};
		}
		if (!build) {
			throw new Error(
				buildNumber
					? `No build ${buildNumber} in App Store Connect.`
					: "No processed, unexpired build in App Store Connect.",
			);
		}
		if (attempt >= 60)
			throw new Error(`Build ${buildNumber} still processing.`);
		console.log(`Build ${buildNumber} is still processing; waiting…`);
		await new Promise((resolve) => setTimeout(resolve, 30_000));
	}
}

function pushMetadata(version: string) {
	const result = spawnSync(
		"npx",
		["-y", EAS_CLI, "metadata:push", "--non-interactive"],
		{
			cwd: mobileRoot,
			stdio: "inherit",
			env: { ...process.env, APP_STORE_VERSION: version },
		},
	);
	if (result.status !== 0) throw new Error("eas metadata:push failed.");
}

async function findOrCreateVersion(asc: Asc, appId: string, version: string) {
	const existing = await asc.list(
		`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${version}`,
	);
	const found = existing[0];
	if (found) {
		const state = String(
			found.attributes.appVersionState ?? found.attributes.appStoreState,
		);
		if (!EDITABLE_STATES.has(state)) {
			throw new Error(`Version ${version} is ${state}; nothing to submit.`);
		}
		return found.id;
	}
	const created = await asc.post("/v1/appStoreVersions", {
		data: {
			type: "appStoreVersions",
			attributes: { platform: "IOS", versionString: version },
			relationships: { app: { data: { type: "apps", id: appId } } },
		},
	});
	return (created.data as Resource).id;
}

async function setWhatsNew(asc: Asc, versionId: string, whatsNew: string) {
	const localizations = await asc.list(
		`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
	);
	for (const localization of localizations) {
		await asc.patch(`/v1/appStoreVersionLocalizations/${localization.id}`, {
			data: {
				type: "appStoreVersionLocalizations",
				id: localization.id,
				attributes: { whatsNew },
			},
		});
	}
}

async function submitForReview(asc: Asc, appId: string, versionId: string) {
	const open = await asc.list(
		`/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&filter[state]=${OPEN_SUBMISSION_STATES.join(",")}`,
	);
	const inFlight = open.find(
		(submission) => submission.attributes.state !== "READY_FOR_REVIEW",
	);
	if (inFlight) {
		throw new Error(
			`Submission ${inFlight.id} is already ${inFlight.attributes.state}; wait for it or cancel it in App Store Connect.`,
		);
	}
	const submissionId =
		open[0]?.id ??
		(
			(
				await asc.post("/v1/reviewSubmissions", {
					data: {
						type: "reviewSubmissions",
						attributes: { platform: "IOS" },
						relationships: { app: { data: { type: "apps", id: appId } } },
					},
				})
			).data as Resource
		).id;
	const items = open[0]
		? await asc.list(`/v1/reviewSubmissions/${submissionId}/items`)
		: [];
	if (items.length === 0) {
		await asc.post("/v1/reviewSubmissionItems", {
			data: {
				type: "reviewSubmissionItems",
				relationships: {
					reviewSubmission: {
						data: { type: "reviewSubmissions", id: submissionId },
					},
					appStoreVersion: {
						data: { type: "appStoreVersions", id: versionId },
					},
				},
			},
		});
	}
	await asc.patch(`/v1/reviewSubmissions/${submissionId}`, {
		data: {
			type: "reviewSubmissions",
			id: submissionId,
			attributes: { submitted: true },
		},
	});
	return submissionId;
}

async function submit(options: {
	build?: string;
	whatsNew: string;
	dryRun: boolean;
	skipMetadata: boolean;
}) {
	const easJson = JSON.parse(
		readFileSync(join(mobileRoot, "eas.json"), "utf8"),
	);
	const appId: string = easJson.submit.production.ios.ascAppId;
	const asc = createAsc(await resolveAscKey(), options.dryRun);

	const build = await findBuild(asc, appId, options.build);
	console.log(`Submitting ${build.version} (${build.number}).`);
	output("version", build.version);
	output("build", build.number);

	if (!options.skipMetadata && !options.dryRun) pushMetadata(build.version);
	const versionId = await findOrCreateVersion(asc, appId, build.version);
	await setWhatsNew(asc, versionId, options.whatsNew);
	await asc.patch(`/v1/appStoreVersions/${versionId}/relationships/build`, {
		data: { type: "builds", id: build.id },
	});
	const submissionId = await submitForReview(asc, appId, versionId);
	console.log(
		`${options.dryRun ? "[dry run] Would submit" : "Submitted"} ${build.version} (${build.number}) for App Review: https://appstoreconnect.apple.com/apps/${appId}/distribution/reviewsubmissions/details/${submissionId}`,
	);
}

if (import.meta.main) {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			build: { type: "string" },
			"whats-new": { type: "string" },
			"dry-run": { type: "boolean", default: false },
			"skip-metadata": { type: "boolean", default: false },
		},
	});
	if (positionals[0] === "bump") {
		const from = positionals[1];
		if (!from) throw new Error("Usage: submit-review.ts bump <version>");
		bump(from);
	} else {
		const whatsNew = values["whats-new"]?.trim();
		if (!whatsNew) throw new Error("--whats-new is required.");
		await submit({
			build: values.build,
			whatsNew,
			dryRun: values["dry-run"],
			skipMetadata: values["skip-metadata"],
		});
	}
}
