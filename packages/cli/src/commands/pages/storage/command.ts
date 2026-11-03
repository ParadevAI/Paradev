import {
	boolean,
	CLIError,
	positional,
	string,
	table,
} from "@superset/cli-framework";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	type PageStorageReadback,
	type PageStorageScope,
	type PageStorageWriteRequest,
	parsePageStorageScope,
} from "@superset/shared/page-storage";
import { pageStorageRecordsPath } from "@superset/shared/page-storage-hub";
import { command } from "../../../lib/command";
import { getApiUrl } from "../../../lib/config";
import { env } from "../../../lib/env";
import { resolvePageId } from "../pageId";

export async function userJwt(
	bearer: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	if (bearer.split(".").length === 3) return bearer;
	if (!bearer.startsWith("sk_live_")) {
		throw new CLIError(
			"Reading page storage needs a signed-in user",
			"Run: superset auth login, or pass --api-key",
		);
	}
	const response = await fetchImpl(`${getApiUrl()}/api/auth/token`, {
		headers: { "x-api-key": bearer },
	});
	if (!response.ok) {
		throw new CLIError(
			`Could not get a token for this API key (${response.status})`,
			"Check the key with: superset auth whoami",
		);
	}
	return ((await response.json()) as { token: string }).token;
}

export async function readStorage({
	realtimeUrl,
	jwt,
	pageId,
	key,
	scope,
	fetchImpl = fetch,
}: {
	realtimeUrl: string;
	jwt: string;
	pageId: string;
	key?: string;
	scope?: PageStorageScope;
	fetchImpl?: typeof fetch;
}): Promise<PageStorageReadback> {
	const path = pageStorageRecordsPath(pageId, key);
	const url =
		scope && scope !== "slot" && key !== undefined
			? `${realtimeUrl}${path}&scope=${scope}`
			: `${realtimeUrl}${path}`;
	const response = await fetchImpl(url, {
		headers: { authorization: `Bearer ${jwt}` },
	});
	if (response.ok) return (await response.json()) as PageStorageReadback;
	const error = (
		(await response.json().catch(() => null)) as { error?: string } | null
	)?.error;
	switch (response.status) {
		case 401:
			throw new CLIError(
				"Page storage did not accept your credentials",
				"Run: superset auth login",
			);
		case 403:
			throw new CLIError(
				error ?? "You cannot read this page's storage",
				"Only the creator can read a just_me page's storage; for other pages, members of the page's organization can",
			);
		case 404:
			throw new CLIError(
				"This page has no published version",
				"Publish it first: superset pages publish",
			);
		default:
			throw new CLIError(
				error ?? `Page storage refused the request (${response.status})`,
			);
	}
}

export async function writeStorage({
	realtimeUrl,
	jwt,
	pageId,
	request,
	fetchImpl = fetch,
	timeoutMs = 10_000,
}: {
	realtimeUrl: string;
	jwt: string;
	pageId: string;
	request: PageStorageWriteRequest;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{ ok: true }> {
	const response = await fetchImpl(
		`${realtimeUrl}${pageStorageRecordsPath(pageId)}`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${jwt}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(timeoutMs),
		},
	).catch((error: unknown) => {
		if (error instanceof Error && error.name === "TimeoutError") {
			throw new CLIError(
				`Page storage did not answer within ${timeoutMs / 1000} seconds`,
				"Try again. If it keeps happening, check your network",
			);
		}
		throw error;
	});
	if (response.ok) return { ok: true };
	const error = (
		(await response.json().catch(() => null)) as { error?: string } | null
	)?.error;
	throw new CLIError(
		error ?? `Page storage refused the write (${response.status})`,
		response.status === 403
			? "Only signed-in members of the page's organization can write its storage (on a just_me page, only its creator)"
			: undefined,
	);
}

function printable(text: string): string {
	return text.replace(
		/\p{Cc}/gu,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

export function displayStorage(data: PageStorageReadback): string {
	if ("keys" in data) {
		if (data.keys.length === 0) return "This page has no stored records.";
		return table(
			data.keys.map((row) => ({
				key: printable(row.key),
				scope: row.scope,
				records: row.records,
				updated: new Date(row.updatedAt).toLocaleString(),
			})),
			["key", "scope", "records", "updated"],
			["KEY", "SCOPE", "RECORDS", "UPDATED"],
			[MAX_PAGE_STORAGE_KEY_LENGTH, 8, 8, 24],
		);
	}
	if (data.records.length === 0) return `No records for key "${data.key}".`;
	return table(
		data.records.map((row) => ({
			name: printable(row.name),
			value: printable(JSON.stringify(row.value)),
			updated: new Date(row.updatedAt).toLocaleString(),
		})),
		["name", "value", "updated"],
		["NAME", "VALUE", "UPDATED"],
		[24, 60, 24],
	);
}

export default command({
	description:
		"Read or write a page's storage: keys, every slot of one key, or one value",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		key: string().desc("The key to read or write"),
		scope: string().desc("slot (default), private, or shared"),
		set: string().desc("Store this JSON value under --key"),
		remove: boolean().desc("Remove your value under --key"),
	},
	run: async ({ ctx, args, options }) => {
		const scope = parsePageStorageScope(options.scope);
		if (!scope) {
			throw new CLIError(
				`Unknown scope "${options.scope}"`,
				"Use slot, private, or shared",
			);
		}
		const pageId = await resolvePageId(ctx, args.page as string);
		const jwt = await userJwt(ctx.bearer);
		if (options.set !== undefined || options.remove) {
			if (!options.key) {
				throw new CLIError("--set and --remove need --key");
			}
			if (options.set !== undefined && options.remove) {
				throw new CLIError("Pass --set or --remove, not both");
			}
			let request: PageStorageWriteRequest;
			if (options.remove) {
				request = { op: "remove", key: options.key, scope };
			} else {
				let value: unknown;
				try {
					value = JSON.parse(options.set as string);
				} catch {
					throw new CLIError(
						"--set takes JSON",
						`For a string, quote it: --set '"text"'`,
					);
				}
				request = { op: "set", key: options.key, value, scope };
			}
			return {
				data: await writeStorage({
					realtimeUrl: env.REALTIME_URL,
					jwt,
					pageId,
					request,
				}),
			};
		}
		return {
			data: await readStorage({
				realtimeUrl: env.REALTIME_URL,
				jwt,
				pageId,
				key: options.key,
				scope,
			}),
		};
	},
	display: (data) =>
		"ok" in (data as object)
			? "Saved."
			: displayStorage(data as PageStorageReadback),
});
