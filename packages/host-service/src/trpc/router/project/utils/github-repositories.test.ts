import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecGh } from "../../workspace-creation/utils/exec-gh";
import {
	fetchGitHubRepositoryPage,
	listGitHubRepositories,
	parseGitHubRepositories,
} from "./github-repositories";

const execFileAsync = promisify(execFile);

test("flattens paginated GitHub repository results", () => {
	expect(
		parseGitHubRepositories([
			[
				{
					full_name: "superset-sh/superset",
					clone_url: "https://github.com/superset-sh/superset.git",
				},
			],
			[
				{
					full_name: "superset-sh/acme",
					clone_url: "https://github.com/superset-sh/acme.git",
				},
			],
		]),
	).toEqual([
		{
			fullName: "superset-sh/superset",
			cloneUrl: "https://github.com/superset-sh/superset.git",
		},
		{
			fullName: "superset-sh/acme",
			cloneUrl: "https://github.com/superset-sh/acme.git",
		},
	]);
});

test("loads every page in order, including an empty final page", async () => {
	const pages = Array.from({ length: 2 }, (_, page) =>
		Array.from({ length: 100 }, (_, index) => ({
			full_name: `owner/repo-${page * 100 + index}`,
			clone_url: `https://github.com/owner/repo-${page * 100 + index}.git`,
		})),
	);
	const calls: string[][] = [];
	const result = await listGitHubRepositories(async (args) => {
		calls.push(args);
		return pages[calls.length - 1] ?? [];
	});
	expect(result).toEqual(parseGitHubRepositories(pages));
	expect(calls).toHaveLength(3);
	expect(
		calls.map((args) => args.find((arg) => arg.startsWith("page="))),
	).toEqual(["page=1", "page=2", "page=3"]);
});

test("a push during the walk cannot repeat a repository or drop the pushed one", async () => {
	const pushedRepository = {
		full_name: "owner/repo-100",
		clone_url: "https://github.com/owner/repo-100.git",
		updatedAt: 100,
	};
	const repositories = Array.from({ length: 250 }, (_, index) =>
		index === 100
			? pushedRepository
			: {
					full_name: `owner/repo-${String(index).padStart(3, "0")}`,
					clone_url: `https://github.com/owner/repo-${String(index).padStart(3, "0")}.git`,
					updatedAt: index,
				},
	);
	let calls = 0;
	const result = await listGitHubRepositories(async (args) => {
		const sort = args.find((arg) => arg.startsWith("sort="))?.slice(5);
		const page = Number(args.find((arg) => arg.startsWith("page="))?.slice(5));
		if (calls++ === 1) {
			// A push lands between page 1 and page 2 and moves repo-100, which
			// `sort=updated` keeps on the second page, to the top of the list.
			pushedRepository.updatedAt = 1_000;
		}
		const ordered = [...repositories].sort((left, right) =>
			sort === "updated"
				? right.updatedAt - left.updatedAt
				: left.full_name.localeCompare(right.full_name),
		);
		return ordered.slice((page - 1) * 100, page * 100);
	});

	const fullNames = result.map((repository) => repository.fullName);
	expect(fullNames).toHaveLength(repositories.length);
	expect(new Set(fullNames).size).toBe(fullNames.length);
	expect(fullNames).toContain("owner/repo-100");
});

test("a page reports whether more repositories follow", async () => {
	const repositories = Array.from({ length: 100 }, (_, index) => ({
		full_name: `owner/repo-${index}`,
		clone_url: `https://github.com/owner/repo-${index}.git`,
	}));
	const requested: number[] = [];
	const runGh = async (args: string[]) => {
		requested.push(
			Number(args.find((arg) => arg.startsWith("page="))?.slice(5)),
		);
		return repositories;
	};

	expect(await fetchGitHubRepositoryPage(2, runGh)).toMatchObject({
		hasMore: true,
		repositories: parseGitHubRepositories([repositories]),
	});
	expect(
		await fetchGitHubRepositoryPage(3, async () => repositories.slice(0, 40)),
	).toMatchObject({ hasMore: false });
	expect(await fetchGitHubRepositoryPage(4, async () => [])).toMatchObject({
		hasMore: false,
		repositories: [],
	});
	expect(requested).toEqual([2]);
});

test("rejects invalid clone URLs on later pages instead of returning partial results", async () => {
	let page = 0;
	await expect(
		listGitHubRepositories(async () =>
			++page === 1
				? Array.from({ length: 100 }, () => ({
						full_name: "owner/repo",
						clone_url: "https://github.com/owner/repo.git",
					}))
				: [{ full_name: "owner/broken", clone_url: "not a URL" }],
		),
	).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	expect(page).toBe(2);
});

test("returns an empty catalog", async () => {
	expect(await listGitHubRepositories(async () => [])).toEqual([]);
});

test.each([
	[
		Object.assign(new Error("authentication required"), { code: 4 }),
		"PRECONDITION_FAILED",
		true,
	],
	[
		Object.assign(new Error("Bad credentials"), {
			code: 1,
			stderr: "gh: Bad credentials (HTTP 401)",
		}),
		"PRECONDITION_FAILED",
		true,
	],
	[
		Object.assign(new Error("Command failed"), {
			killed: true,
			signal: "SIGTERM",
			code: null,
		}),
		"TIMEOUT",
		false,
	],
	[
		Object.assign(new Error("rate limit exceeded (HTTP 403)"), { code: 1 }),
		"BAD_GATEWAY",
		false,
	],
	[
		Object.assign(new Error("stdout maxBuffer length exceeded"), {
			code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
			killed: true,
			signal: "SIGTERM",
		}),
		"BAD_GATEWAY",
		false,
	],
	[new Error("network unavailable"), "BAD_GATEWAY", false],
])("classifies %s as %s without unrelated login advice", async (failure, code, loginAdvice) => {
	try {
		await listGitHubRepositories(async () => {
			throw failure;
		});
		throw new Error("Expected listing to fail");
	} catch (error) {
		expect(error).toMatchObject({ code, cause: failure });
		expect((error as Error).message.includes("gh auth login")).toBe(
			loginAdvice,
		);
	}
});

test.skipIf(!Bun.which("gh"))(
	"real gh projects and paginates 2,000 repositories beyond the old stdout cap",
	async () => {
		const repositories = Array.from({ length: 2000 }, (_, index) => ({
			full_name: `owner/repo-${index}`,
			clone_url: `https://github.com/owner/repo-${index}.git`,
			private: index % 2 === 0,
			description: "metadata".repeat(750),
		}));
		const requests: URL[] = [];
		const outputSizes: number[] = [];
		const hasUnselectedFields: boolean[] = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const url = new URL(request.url);
				requests.push(url);
				const page = Number(url.searchParams.get("page") ?? 1);
				const entries = repositories.slice((page - 1) * 100, page * 100);
				const headers =
					page < 20
						? {
								Link: `<${url.origin}/user/repos?${new URLSearchParams({ affiliation: "owner,collaborator,organization_member", sort: "updated", per_page: "100", page: String(page + 1) })}>; rel="next"`,
							}
						: undefined;
				return Response.json(entries, { headers });
			},
		});
		const runGh: ExecGh = async (args, options) => {
			const { stdout } = await execFileAsync(
				Bun.which("gh") as string,
				args.map((arg) =>
					arg === "user/repos" ? `${server.url}user/repos` : arg,
				),
				{
					encoding: "utf8",
					timeout: 10_000,
					maxBuffer: 10 * 1024 * 1024,
					...options,
					env: { ...process.env, GH_TOKEN: "local-fixture-only" },
				},
			);
			outputSizes.push(Buffer.byteLength(stdout));
			hasUnselectedFields.push(stdout.includes('"description"'));
			return JSON.parse(stdout);
		};
		try {
			expect(Buffer.byteLength(JSON.stringify(repositories))).toBeGreaterThan(
				10 * 1024 * 1024,
			);
			await expect(
				runGh([
					"api",
					"--method",
					"GET",
					"--paginate",
					"--slurp",
					"user/repos",
					"-f",
					"affiliation=owner,collaborator,organization_member",
					"-f",
					"sort=updated",
					"-f",
					"per_page=100",
				]),
			).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
			requests.length = 0;
			const result = await listGitHubRepositories(runGh);
			expect(result).toEqual(parseGitHubRepositories([repositories]));
			expect(requests).toHaveLength(21);
			expect(Math.max(...outputSizes)).toBeLessThan(15_000);
			expect(hasUnselectedFields.every((value) => !value)).toBe(true);
			for (const [index, request] of requests.entries()) {
				expect(request.pathname).toBe("/user/repos");
				expect(Object.fromEntries(request.searchParams)).toEqual({
					affiliation: "owner,collaborator,organization_member",
					sort: "full_name",
					per_page: "100",
					page: String(index + 1),
				});
			}
		} finally {
			await server.stop(true);
		}
	},
	30_000,
);
