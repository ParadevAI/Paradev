import { afterEach, describe, expect, it } from "bun:test";

const SCRIPT = `${import.meta.dir}/copy-secret-to-vercel-project.sh`;
const FAKE_SECRET = "fake-secret-value-for-test-0123456789";
const OTHER_VALUE = "ciphertext-of-another-variable";

type Env = { key: string; type: string; target: string[]; value: string };
type Seen = { method: string; path: string; body: string };

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
	server?.stop(true);
	server = undefined;
});

function startFakeVercel(
	initial: Env[],
	onPost: (envs: Env[], body: Record<string, unknown>) => void,
	options: {
		listExtra?: object;
		listExtraAfterPost?: object;
		listBody?: object;
		failed?: object[];
		dropPost?: boolean;
	} = {},
) {
	let posted = false;
	const envs = [...initial];
	const seen: Seen[] = [];
	server = Bun.serve({
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			const body = request.method === "POST" ? await request.text() : "";
			seen.push({
				method: request.method,
				path: url.pathname + url.search,
				body,
			});
			if (request.headers.get("authorization") !== "Bearer fake-token") {
				return Response.json({ error: { code: "forbidden" } }, { status: 403 });
			}
			if (request.method === "POST") {
				posted = true;
				onPost(envs, JSON.parse(body));
				if (options.dropPost) {
					return new Response(
						new ReadableStream({ start: (c) => c.error(new Error("drop")) }),
						{ status: 201, headers: { "content-length": "100" } },
					);
				}
				return Response.json(
					{ created: envs.at(-1), failed: options.failed ?? [] },
					{ status: 201 },
				);
			}
			return Response.json(
				options.listBody ?? {
					envs,
					...(posted ? options.listExtraAfterPost : options.listExtra),
				},
			);
		},
	});
	return { seen, url: `http://localhost:${server.port}` };
}

async function run(url: string, extra: Record<string, string>) {
	const child = Bun.spawn(["bash", SCRIPT], {
		env: {
			PATH: process.env.PATH ?? "",
			VERCEL_API: url,
			VERCEL_TOKEN: "fake-token",
			VERCEL_ORG_ID: "team_fake",
			PROJECT: "demo-project",
			BETTER_AUTH_SECRET: FAKE_SECRET,
			...extra,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { output: stdout + stderr, code };
}

const OTHERS: Env[] = [
	{
		key: "DATABASE_URL",
		type: "encrypted",
		target: ["production"],
		value: OTHER_VALUE,
	},
	{
		key: "PUBLIC_THING",
		type: "plain",
		target: ["production", "preview"],
		value: "x",
	},
];

function upsertSensitive(envs: Env[], body: Record<string, unknown>) {
	envs.push({
		key: body.key as string,
		type: body.type as string,
		target: body.target as string[],
		value: "",
	});
}

describe("copy-secret-to-vercel-project.sh", () => {
	it("dry run reads only and prints no value", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive);
		const { output, code } = await run(fake.url, { APPLY: "false" });
		expect(code).toBe(0);
		expect(fake.seen.map((r) => r.method)).toEqual(["GET"]);
		expect(output).toContain("BETTER_AUTH_SECRET: absent");
		expect(output).toContain("Other variables: 2");
		expect(output).not.toContain(FAKE_SECRET);
		expect(output).not.toContain(OTHER_VALUE);
		expect(output).not.toContain("DATABASE_URL");
	});

	it("apply sends one sensitive upsert for the one key and prints no value", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive);
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).toBe(0);
		const posts = fake.seen.filter((r) => r.method === "POST");
		expect(posts).toHaveLength(1);
		expect(posts[0]?.path).toBe(
			"/v10/projects/demo-project/env?upsert=true&teamId=team_fake",
		);
		expect(JSON.parse(posts[0]?.body ?? "")).toEqual({
			key: "BETTER_AUTH_SECRET",
			value: FAKE_SECRET,
			type: "sensitive",
			target: ["production", "preview"],
		});
		expect(output).toContain("type=sensitive targets=production,preview");
		expect(output).not.toContain(FAKE_SECRET);
		expect(output).not.toContain(OTHER_VALUE);
	});

	it("fails on an empty secret before any request", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive);
		const { output, code } = await run(fake.url, {
			APPLY: "true",
			BETTER_AUTH_SECRET: "",
		});
		expect(code).not.toBe(0);
		expect(output).toContain("BETTER_AUTH_SECRET is empty");
		expect(fake.seen).toHaveLength(0);
	});

	it("rejects a project input that is not an id or name", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive);
		for (const project of ["../other?x=1", "..", "."]) {
			const { code } = await run(fake.url, { PROJECT: project });
			expect(code).not.toBe(0);
		}
		expect(fake.seen).toHaveLength(0);
	});

	it("refuses the VERCEL_API override on GitHub Actions", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive);
		const { code } = await run(fake.url, { GITHUB_ACTIONS: "true" });
		expect(code).not.toBe(0);
		expect(fake.seen).toHaveLength(0);
	});

	it("stops before apply when the list is paged or hides variables", async () => {
		for (const listExtra of [
			{ pagination: { count: 2, next: 123, prev: null } },
			{ hiddenProductionEnvCount: 3 },
		]) {
			const fake = startFakeVercel(OTHERS, upsertSensitive, { listExtra });
			const { output, code } = await run(fake.url, { APPLY: "true" });
			expect(code).not.toBe(0);
			expect(output).toContain("cannot be trusted");
			expect(fake.seen.map((r) => r.method)).toEqual(["GET"]);
			server?.stop(true);
		}
	});

	describe("when the key already exists", () => {
		const EXISTING: Env[] = [
			...OTHERS,
			{
				key: "BETTER_AUTH_SECRET",
				type: "encrypted",
				target: ["production"],
				value: "old-ciphertext",
			},
		];
		const replace = (envs: Env[], body: Record<string, unknown>) => {
			envs.splice(
				envs.findIndex((e) => e.key === "BETTER_AUTH_SECRET"),
				1,
			);
			upsertSensitive(envs, body);
		};

		it("dry run says apply will refuse", async () => {
			const fake = startFakeVercel(EXISTING, replace);
			const { output, code } = await run(fake.url, { APPLY: "false" });
			expect(code).toBe(0);
			expect(output).toContain("apply will refuse unless overwrite");
			expect(output).not.toContain("old-ciphertext");
		});

		it("apply refuses without overwrite and writes nothing", async () => {
			const fake = startFakeVercel(EXISTING, replace);
			const { output, code } = await run(fake.url, { APPLY: "true" });
			expect(code).not.toBe(0);
			expect(output).toContain("already exists");
			expect(fake.seen.map((r) => r.method)).toEqual(["GET"]);
		});

		it("apply replaces it when overwrite is set", async () => {
			const fake = startFakeVercel(EXISTING, replace);
			const { code } = await run(fake.url, {
				APPLY: "true",
				OVERWRITE: "true",
			});
			expect(code).toBe(0);
			expect(fake.seen.filter((r) => r.method === "POST")).toHaveLength(1);
		});
	});

	it("stops on a list that is not an envs array", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive, {
			listBody: { key: "A", type: "plain", target: ["production"] },
		});
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).not.toBe(0);
		expect(output).toContain("cannot be trusted");
		expect(output).not.toContain("jq: error");
		expect(fake.seen.map((r) => r.method)).toEqual(["GET"]);
	});

	it("says the value may be written when the read after the write is paged", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive, {
			listExtraAfterPost: { pagination: { count: 3, next: 5, prev: null } },
		});
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).not.toBe(0);
		expect(output).toContain("The value may have been written");
		expect(output).not.toContain(FAKE_SECRET);
	});

	it("says the value may be written when the POST connection drops", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive, { dropPost: true });
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).not.toBe(0);
		expect(output).toContain("The value may have been written");
		expect(output).not.toContain(FAKE_SECRET);
	});

	it("does not say it when nothing was written", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive, {
			listExtra: { hiddenProductionEnvCount: 1 },
		});
		const { output } = await run(fake.url, { APPLY: "true" });
		expect(output).not.toContain("may have been written");
	});

	it("stops on a failed entry and never prints the value it echoes", async () => {
		const failed = [
			{ error: { code: "bad", message: "no", value: FAKE_SECRET } },
		];
		const fake = startFakeVercel(OTHERS, upsertSensitive, { failed });
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).not.toBe(0);
		expect(output).toContain("Failed entries: 1");
		expect(output).not.toContain(FAKE_SECRET);
	});

	it("fails when the count of other variables changes", async () => {
		const fake = startFakeVercel(OTHERS, (envs, body) => {
			envs.shift();
			upsertSensitive(envs, body);
		});
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).not.toBe(0);
		expect(output).toContain("count of other variables changed from 2 to 1");
		expect(output).not.toContain(FAKE_SECRET);
	});

	it("fails when the result is not sensitive on both targets", async () => {
		const fake = startFakeVercel(OTHERS, (envs, body) => {
			upsertSensitive(envs, { ...body, target: ["production"] });
		});
		const { output, code } = await run(fake.url, { APPLY: "true" });
		expect(code).not.toBe(0);
		expect(output).toContain("not sensitive on exactly production and preview");
	});

	it("reports only the error code when Vercel refuses", async () => {
		const fake = startFakeVercel(OTHERS, upsertSensitive);
		const { output, code } = await run(fake.url, { VERCEL_TOKEN: "wrong" });
		expect(code).not.toBe(0);
		expect(output).toContain("Vercel error code: forbidden");
		expect(fake.seen.map((r) => r.method)).toEqual(["GET"]);
	});
});
