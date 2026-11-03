import { createHash } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { TRPCError } from "@trpc/server";

export type GithubWorkItemKind = "pr" | "issue";

export type GithubWorkItem = {
	kind: GithubWorkItemKind;
	repo: string;
	number: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	/** Why an issue closed, such as `completed` or `not_planned`. */
	stateReason: string | null;
	/** The body as plain text, long enough to recognise the item. */
	summary: string;
	author: { login: string; avatarUrl: string | null } | null;
	baseRefName: string | null;
	headRefName: string | null;
	labels: { name: string; color: string }[];
	assignees: { login: string; avatarUrl: string | null }[];
	updatedAt: string;
};

export type GithubWorkItemRef = {
	owner: string;
	repo: string;
	kind: GithubWorkItemKind;
	number: number;
};

const SUMMARY_CHARS = 280;
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_LIMIT = 200;

type RestUser = { login: string; avatar_url?: string } | null | undefined;
type RestLabel = string | { name?: string; color?: string | null };

function person(user: RestUser) {
	return user
		? { login: user.login, avatarUrl: user.avatar_url ?? null }
		: null;
}

function labelOf(label: RestLabel) {
	return typeof label === "string"
		? { name: label, color: "" }
		: { name: label.name ?? "", color: label.color ?? "" };
}

/** The body with markdown and markup taken out, cut to one glance. */
export function summarizeBody(body: string | null | undefined): string {
	const text = (body ?? "")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/[`*~]+/g, "")
		.replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
		.replace(/[>|]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > SUMMARY_CHARS
		? `${text.slice(0, SUMMARY_CHARS).trimEnd()}…`
		: text;
}

async function loadWorkItem(
	octokit: Octokit,
	ref: GithubWorkItemRef,
): Promise<GithubWorkItem> {
	const repo = `${ref.owner}/${ref.repo}`;
	if (ref.kind === "pr") {
		const { data } = await octokit.pulls.get({
			owner: ref.owner,
			repo: ref.repo,
			pull_number: ref.number,
		});
		return {
			kind: "pr",
			repo,
			number: data.number,
			url: data.html_url,
			title: data.title,
			state: data.merged ? "merged" : data.state === "open" ? "open" : "closed",
			draft: data.draft === true,
			stateReason: null,
			summary: summarizeBody(data.body),
			author: person(data.user),
			baseRefName: data.base.ref,
			headRefName: data.head.ref,
			labels: data.labels.map(labelOf),
			assignees: (data.assignees ?? []).flatMap((user) => {
				const who = person(user);
				return who ? [who] : [];
			}),
			updatedAt: data.updated_at,
		};
	}
	const { data } = await octokit.issues.get({
		owner: ref.owner,
		repo: ref.repo,
		issue_number: ref.number,
	});
	if (data.pull_request) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `#${ref.number} in ${repo} is a pull request, not an issue.`,
		});
	}
	return {
		kind: "issue",
		repo,
		number: data.number,
		url: data.html_url,
		title: data.title,
		state: data.state === "open" ? "open" : "closed",
		draft: false,
		stateReason: data.state_reason ?? null,
		summary: summarizeBody(data.body),
		author: person(data.user),
		baseRefName: null,
		headRefName: null,
		labels: data.labels.map(labelOf),
		assignees: (data.assignees ?? []).flatMap((user) => {
			const who = person(user);
			return who ? [who] : [];
		}),
		updatedAt: data.updated_at,
	};
}

function notFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		(error as { status?: unknown }).status === 404
	);
}

/**
 * The credential behind a client, hashed: a cached item answers only the
 * credential that fetched it, and the token itself never becomes a key.
 */
async function credentialKey(octokit: Octokit): Promise<string> {
	const auth = (await octokit.auth?.().catch(() => null)) as {
		token?: unknown;
	} | null;
	const token = typeof auth?.token === "string" ? auth.token : "";
	return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * One item per credential, repository, kind and number, remembered for a short while so
 * a chip hovered twice, or ten chips for the same pull request, cost one
 * request. A lookup that failed is not remembered.
 */
export function createGithubWorkItemLoader(
	now: () => number = Date.now,
): (octokit: Octokit, ref: GithubWorkItemRef) => Promise<GithubWorkItem> {
	const cache = new Map<
		string,
		{ at: number; item: Promise<GithubWorkItem> }
	>();
	return async (octokit, ref) => {
		const key = `${await credentialKey(octokit)}:${ref.owner}/${ref.repo}#${ref.kind}#${ref.number}`;
		const hit = cache.get(key);
		if (hit && now() - hit.at < CACHE_TTL_MS) return hit.item;
		const item = loadWorkItem(octokit, ref).catch((error: unknown) => {
			if (notFound(error)) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `${ref.kind === "pr" ? "Pull request" : "Issue"} #${ref.number} not found in ${ref.owner}/${ref.repo}.`,
					cause: error,
				});
			}
			throw error;
		});
		cache.set(key, { at: now(), item });
		item.catch(() => {
			if (cache.get(key)?.item === item) cache.delete(key);
		});
		const oldest = cache.keys().next().value;
		if (cache.size > CACHE_LIMIT && oldest !== undefined) cache.delete(oldest);
		return item;
	};
}
