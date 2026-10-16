import { z } from "zod";
import { githubUserTokenFor } from "../../../../lib/github-user/github-user";
import { type CardContext, CardUnavailable } from "../types";

const CONNECT = { label: "Connect GitHub", href: "#/settings/connections" };
const API = "https://api.github.com";
const LOG_MAX_BYTES = 2_000_000;
export const UNREADABLE = "GitHub's answer could not be read";

export const GITHUB_NAME = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

export const repoRefs = {
	owner: z.string().regex(GITHUB_NAME),
	repo: z.string().regex(GITHUB_NAME),
};

export const personSchema = z.object({
	login: z.string(),
	avatar_url: z.string().optional(),
});

export const toPerson = (person: z.infer<typeof personSchema>) => ({
	login: person.login,
	avatarUrl: person.avatar_url ?? null,
});

const refusalSchema = z.object({
	message: z.string().optional(),
	errors: z
		.array(
			z.union([
				z.string(),
				z.object({
					message: z.string().optional(),
					field: z.string().optional(),
					code: z.string().optional(),
				}),
			]),
		)
		.optional(),
});

function refusal(body: unknown): string {
	const parsed = refusalSchema.safeParse(body);
	if (!parsed.success) return "";
	const [first] = parsed.data.errors ?? [];
	const detail =
		typeof first === "string"
			? first
			: (first?.message ??
				(first?.code
					? `${first.field ?? ""} ${first.code.replaceAll("_", " ")}`.trim()
					: undefined));
	return (detail || parsed.data.message || "").slice(0, 300);
}

function failure(response: Response, body: unknown, write: boolean): never {
	const said = refusal(body);
	if ([301, 302, 307, 308].includes(response.status))
		throw new CardUnavailable(
			"gone",
			"This repository was renamed or moved. Ask the agent for a card with its new name",
		);
	if (response.status === 401)
		throw new CardUnavailable(
			"no_connector",
			"GitHub needs reconnecting",
			CONNECT,
		);
	if (
		response.status === 429 ||
		(response.status === 403 &&
			(response.headers.get("x-ratelimit-remaining") === "0" ||
				/rate limit/i.test(said)))
	)
		throw new CardUnavailable(
			"error",
			"GitHub is limiting requests. Try again in a few minutes",
		);
	if (response.status === 403 && /not accessible by integration/i.test(said))
		throw new CardUnavailable(
			"no_access",
			"Superset's GitHub app is not installed on that repository, or lacks the permission for this",
		);
	if (response.status === 403)
		throw new CardUnavailable(
			"no_access",
			said
				? `GitHub refused: ${said}`
				: "Your GitHub account cannot do this there",
		);
	if (response.status === 404)
		throw new CardUnavailable(
			"no_access",
			"Not on GitHub, or not accessible with your GitHub account",
		);
	if (response.status >= 500)
		throw new CardUnavailable(
			"error",
			write
				? "GitHub did not answer. Look on GitHub before you try again"
				: "GitHub did not answer. Try again",
		);
	throw new CardUnavailable(
		"error",
		said ? `GitHub refused: ${said}` : `GitHub answered ${response.status}`,
	);
}

export interface Github {
	get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
	/** Null for what is not there or not visible. */
	find<T>(path: string, schema: z.ZodType<T>): Promise<T | null>;
	write(
		method: "POST" | "PUT" | "PATCH",
		path: string,
		body: Record<string, unknown>,
	): Promise<unknown>;
	graphql(query: string, variables: Record<string, unknown>): Promise<unknown>;
	/** A job's log, or its end when it is larger than the cap; null when it cannot be read. */
	log(path: string): Promise<string | null>;
}

export async function githubFor(ctx: CardContext): Promise<Github> {
	const token = await githubUserTokenFor(ctx.readerId);
	if (!token)
		throw new CardUnavailable(
			"no_connector",
			"Connect GitHub to do this as you",
			CONNECT,
		);
	const call = async (path: string, init?: RequestInit) => {
		const write = Boolean(init?.method);
		const response = await fetch(`${API}${path}`, {
			...init,
			redirect: "manual",
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${token}`,
				"x-github-api-version": "2022-11-28",
				...(init?.body ? { "content-type": "application/json" } : {}),
			},
			signal: AbortSignal.timeout(15_000),
		}).catch(() => {
			throw new CardUnavailable(
				"error",
				write
					? "GitHub did not answer. Look on GitHub before you try again"
					: "GitHub did not answer. Try again",
			);
		});
		return response;
	};
	const json = async (path: string, init?: RequestInit) => {
		const response = await call(path, init);
		const body: unknown = await response.json().catch(() => null);
		if (!response.ok) failure(response, body, Boolean(init?.method));
		return body;
	};
	const parse = <T>(body: unknown, schema: z.ZodType<T>): T => {
		const parsed = schema.safeParse(body);
		if (!parsed.success) throw new CardUnavailable("error", UNREADABLE);
		return parsed.data;
	};
	return {
		get: async (path, schema) => parse(await json(path), schema),
		find: async (path, schema) => {
			const response = await call(path);
			const body: unknown = await response.json().catch(() => null);
			if (response.status === 404) return null;
			if (!response.ok) failure(response, body, false);
			return parse(body, schema);
		},
		write: (method, path, body) =>
			json(path, { method, body: JSON.stringify(body) }),
		graphql: async (query, variables) => {
			const body = await json("/graphql", {
				method: "POST",
				body: JSON.stringify({ query, variables }),
			});
			const answer = z
				.object({
					data: z.unknown().optional(),
					errors: z.array(z.object({ message: z.string() })).optional(),
				})
				.safeParse(body);
			const [error] = answer.data?.errors ?? [];
			if (!answer.success || error)
				throw new CardUnavailable(
					"error",
					error ? `GitHub refused: ${error.message.slice(0, 300)}` : UNREADABLE,
				);
			return answer.data.data;
		},
		log: async (path) => {
			const response = await call(path);
			const location = response.headers.get("location");
			if (response.status !== 302 || !location?.startsWith("https://"))
				return null;
			const read = (range?: string) =>
				fetch(location, {
					redirect: "error",
					headers: range ? { range } : {},
					signal: AbortSignal.timeout(15_000),
				}).catch(() => null);
			const whole = await read();
			if (!whole?.ok || !whole.body) return null;
			const length = Number(whole.headers.get("content-length") ?? 0);
			if (length <= LOG_MAX_BYTES) {
				const reader = whole.body.getReader();
				const decoder = new TextDecoder();
				let text = "";
				let bytes = 0;
				for (;;) {
					const { done, value } = await reader
						.read()
						.catch(() => ({ done: true, value: undefined }));
					if (done || !value) return text + decoder.decode();
					bytes += value.byteLength;
					if (bytes > LOG_MAX_BYTES) break;
					text += decoder.decode(value, { stream: true });
				}
				await reader.cancel().catch(() => {});
				return null;
			}
			await whole.body.cancel().catch(() => {});
			const tail = await read(`bytes=${length - LOG_MAX_BYTES}-`);
			if (tail?.status !== 206) return null;
			const text = await tail.text().catch(() => null);
			return text === null ? null : text.slice(text.indexOf("\n") + 1);
		},
	};
}

const repoSchema = z.object({
	default_branch: z.string(),
	html_url: z.string(),
	permissions: z
		.object({
			push: z.boolean().optional(),
			triage: z.boolean().optional(),
			maintain: z.boolean().optional(),
			admin: z.boolean().optional(),
		})
		.optional(),
});

export interface RepoFacts {
	defaultBranch: string;
	url: string;
	canPush: boolean;
	canTriage: boolean;
	isAdmin: boolean;
}

export async function repoFacts(
	github: Github,
	owner: string,
	repo: string,
): Promise<RepoFacts> {
	const found = await github.get(`/repos/${owner}/${repo}`, repoSchema);
	const allowed = found.permissions ?? {};
	const canPush = Boolean(allowed.push || allowed.maintain || allowed.admin);
	return {
		defaultBranch: found.default_branch,
		url: found.html_url,
		canPush,
		canTriage: canPush || Boolean(allowed.triage),
		isAdmin: Boolean(allowed.admin),
	};
}
