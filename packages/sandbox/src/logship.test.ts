import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dir, "../bundle/rootfs/usr/local/bin");
const SHIPPER = join(BIN, "superset-logship");
const boot = readFileSync(join(BIN, "superset-boot"), "utf8");

type Item = {
	timestamp: number;
	trace_id: string;
	level: string;
	body: string;
	attributes: Record<string, { value: unknown; type: string }>;
};
type Received = {
	auth: string | null;
	header: string;
	item: string;
	items: Item[];
};

let status = 200;
let headers: Record<string, string> = {};
let received: Received[] = [];
const sentry = Bun.serve({
	port: 0,
	async fetch(req) {
		const [header = "", item = "", payload = "{}"] = (await req.text()).split(
			"\n",
		);
		received.push({
			auth: req.headers.get("x-sentry-auth"),
			header,
			item,
			items: JSON.parse(payload).items ?? [],
		});
		return new Response("", { status, headers });
	},
});
afterAll(() => sentry.stop(true));

const HOUR_MS = 3_600_000;
const NOW = 1_794_960_000_000;
let root = "";
const logs = () => join(root, "log");
const state = () => join(root, "state", "logship");
const write = (name: string, text: string) =>
	writeFileSync(join(logs(), name), text);
const append = (name: string, text: string) =>
	appendFileSync(join(logs(), name), text);

beforeEach(() => {
	if (root) rmSync(root, { recursive: true, force: true });
	root = mkdtempSync(join(tmpdir(), "logship-"));
	mkdirSync(logs());
	writeFileSync(
		join(root, "contract.sh"),
		`SUPERSET_LOG_DIR='${logs()}'\nSUPERSET_STATE_DIR='${join(root, "state")}'\nSUPERSET_BOOT_LOG='${logs()}/boot.log'\nSUPERSET_BOX_LOGS_DEFAULT_CAP_BYTES='262144'\n`,
	);
	status = 200;
	headers = {};
	received = [];
});

async function ship(
	env: Record<string, string> = {},
	args: string[] = ["--once"],
	stopWhen?: () => boolean,
): Promise<string> {
	const proc = Bun.spawn(["bash", SHIPPER, ...args], {
		env: {
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			SUPERSET_CONTRACT: join(root, "contract.sh"),
			SUPERSET_SANDBOX_BOX_LOGS: "1",
			HOST_SERVICE_SENTRY_DSN: `http://publickey@127.0.0.1:${sentry.port}/42`,
			HOST_SERVICE_SENTRY_ENVIRONMENT: "test",
			SUPERSET_SANDBOX_WORKSPACE_ID: "11111111-1111-4111-8111-111111111111",
			SUPERSET_SANDBOX_ORGANIZATION_ID: "22222222-2222-4222-8222-222222222222",
			SUPERSET_LOGSHIP_NOW_MS: String(NOW),
			...env,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	if (stopWhen) {
		while (!stopWhen() && proc.exitCode === null) await Bun.sleep(5);
		// Ten more loop intervals: a pass that ignored the wait would send again.
		await Bun.sleep(200);
		proc.kill("SIGTERM");
	}
	await proc.exited;
	return `${await new Response(proc.stdout).text()}${await new Response(proc.stderr).text()}`;
}

const items = () => received.flatMap((r) => r.items);
const bodies = () => items().map((i) => i.body);
const attr = (i: Item | undefined, key: string) => i?.attributes[key]?.value;
const bySource = (source: string) =>
	items().filter((i) => attr(i, "log.source") === source);

describe("superset-logship", () => {
	test("sends each line as a Sentry log record with its source, ids, offset, time and boot", async () => {
		write(
			"boot.log",
			"1794950000000 boot.start pid=1 bundle=aaa\n1794950000100 host.ready\n1794955000000 boot.start pid=2 bundle=aaa\n1794955000250 hook.exited exit=0 ms=900\n",
		);
		write(
			"host-service.log",
			"2026-11-17T21:30:00.822Z [host-service] listening on 4879\ncontinued stack line\n",
		);
		write("desktop.log", "1794955001000 desktop X ready pid=7\n");
		mkdirSync(state(), { recursive: true });
		writeFileSync(join(state(), "boot.offset"), "0\n");
		await ship();

		expect(received[0]?.auth).toContain("sentry_key=publickey");
		expect(JSON.parse(received[0]?.item ?? "{}")).toMatchObject({
			type: "log",
			content_type: "application/vnd.sentry.items.log+json",
		});
		const [first, ready, second, hook] = bySource("boot");
		expect(first).toMatchObject({ level: "info", timestamp: 1_794_950_000 });
		expect(first?.trace_id).toMatch(/^[0-9a-f]{32}$/);
		expect(attr(first, "cloud_workspace.id")).toBe(
			"11111111-1111-4111-8111-111111111111",
		);
		expect(attr(first, "organization.id")).toBe(
			"22222222-2222-4222-8222-222222222222",
		);
		expect(attr(first, "sentry.environment")).toBe("test");
		expect(attr(first, "log.offset")).toBe(0);
		expect(attr(ready, "log.offset")).toBe(42);
		expect(bySource("boot")).toHaveLength(4);
		expect(attr(ready, "boot.started_at")).toBe("2026-11-17T21:13:20Z");
		expect(attr(second, "boot.started_at")).toBe("2026-11-17T22:36:40Z");
		expect(hook?.body).toBe("1794955000250 hook.exited exit=0 ms=900");

		const [listening, stack] = bySource("host-service");
		expect(listening?.timestamp).toBeCloseTo(1_794_951_000.822, 3);
		expect(attr(listening, "boot.started_at")).toBe("2026-11-17T21:13:20Z");
		expect(stack?.timestamp).toBe(NOW / 1000);
		expect(bySource("desktop")[0]?.body).toBe(
			"1794955001000 desktop X ready pid=7",
		);
	});

	test("never reads the setup script's or the clone's output", async () => {
		write("start-hook.log", "CUSTOMER-SETUP-OUTPUT\n");
		write("checkout.log", "CUSTOMER-CLONE-OUTPUT\n");
		write("boot.log", "1794955000000 boot.start pid=1\n");
		await ship();
		expect(JSON.stringify(received)).not.toContain("CUSTOMER");
		expect(readdirSync(state()).sort()).not.toContain("start-hook.offset");
	});

	test("drops vitals and memguard rank lines, keeps kills, and hides hook commands", async () => {
		write(
			"host-service.log",
			[
				'2026-11-17T22:33:39.822Z [host-service:vitals] {"rss":120}',
				"2026-11-17T22:33:40.000Z [sandbox] start hook running (pid 42): pnpm i && pnpm dev --acme",
				"2026-11-17T22:33:41.000Z [sandbox] start hook running in terminal t1: docker compose up",
				"2026-11-17T22:33:42.000Z [sandbox] start hook failed (exit 1): ./setup-acme.sh",
				"2026-11-17T22:33:43.000Z [sandbox] archive hook exited 0: ./teardown --env acme",
				"",
			].join("\n"),
		);
		write(
			"memguard.log",
			"1794955000000 memguard rank pid=9 node 0->500\n1794955000500 memguard reap pid=9 node rss=900MB adj=500 available=100MB floor=200MB\n",
		);
		await ship();
		expect(bodies().join("\n")).not.toMatch(
			/vitals|rank pid|acme|pnpm|docker|setup-/,
		);
		expect(bySource("host-service").map((i) => i.body)).toEqual([
			"2026-11-17T22:33:40.000Z [sandbox] start hook running (pid 42): [command not sent]",
			"2026-11-17T22:33:41.000Z [sandbox] start hook running in terminal t1: [command not sent]",
			"2026-11-17T22:33:42.000Z [sandbox] start hook failed (exit 1): [command not sent]",
			"2026-11-17T22:33:43.000Z [sandbox] archive hook exited 0: [command not sent]",
		]);
		expect(bySource("memguard").map((i) => i.body)).toEqual([
			"1794955000500 memguard reap pid=9 node rss=900MB adj=500 available=100MB floor=200MB",
		]);
	});

	test("scrubs token formats before a line leaves", async () => {
		const secrets = [
			"ghp_abcdefghijklmnopqrstuvwxyz0123456789",
			"ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
			"github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
			"sk-ant-api03-abcdefghijklmnop_qrstuv",
			"sk-proj-abcdefghijklmnopqrstuvwxyz012345",
			"xoxb-123456789012-abcdefghijkl",
			"AKIAABCDEFGHIJKLMNOP",
			"sk_live_abcdefghijklmnop",
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
			"npm_abcdefghijklmnopqrstuvwxyz0123456789",
		];
		write(
			"host-service.log",
			[
				...secrets.map((s, n) => `2026-11-17T22:00:0${n}.000Z value ${s} end`),
				"2026-11-17T22:01:00.000Z clone https://x-access-token:opaque-token-value@github.com/acme/api.git",
				"2026-11-17T22:01:01.000Z Authorization: Bearer abc.def-ghi_jkl123",
				'2026-11-17T22:01:02.000Z {"api_key":"plain-value-1234","HOST_SERVICE_SECRET=s3cr3tvalue"}',
				"2026-11-17T22:01:03.000Z password=hunter2hunter2 next",
				"",
			].join("\n"),
		);
		await ship();
		const sent = bodies().join("\n");
		for (const secret of [
			...secrets,
			"opaque-token-value",
			"abc.def-ghi_jkl123",
			"plain-value-1234",
			"s3cr3tvalue",
			"hunter2",
		]) {
			expect(sent).not.toContain(secret);
		}
		expect(sent).toContain("https://[redacted]@github.com/acme/api.git");
		expect(sent).toContain("Authorization: [redacted]");
		expect(bySource("host-service")).toHaveLength(secrets.length + 4);
	});

	test("collapses a run of identical lines into one record with a count", async () => {
		write(
			"desktop.log",
			"1794955000000 desktop websockify retry\n1794955000100 desktop websockify retry\n1794955000200 desktop websockify retry\n1794955000300 desktop X ready\n",
		);
		await ship();
		const [retry, ready] = bySource("desktop");
		expect(bySource("desktop")).toHaveLength(2);
		expect(retry?.body).toBe("1794955000000 desktop websockify retry");
		expect(attr(retry, "log.repeat_count")).toBe(3);
		expect(attr(ready, "log.repeat_count")).toBeUndefined();
		expect(attr(ready, "log.offset")).toBe(117);
	});

	test("stops at the hour's byte cap with one record, and starts again the next hour", async () => {
		const line = (n: number) =>
			`1794955000000 desktop line ${n} ${"x".repeat(60)}\n`;
		write(
			"desktop.log",
			Array.from({ length: 10 }, (_, n) => line(n)).join(""),
		);
		const cap = { SUPERSET_SANDBOX_BOX_LOGS_CAP_BYTES: "300" };
		await ship(cap);
		expect(
			bySource("desktop").filter((i) => !attr(i, "log.cap_reached")),
		).toHaveLength(3);
		expect(items().filter((i) => attr(i, "log.cap_reached"))).toHaveLength(1);

		append("desktop.log", line(10));
		received = [];
		await ship(cap);
		expect(received).toHaveLength(0);

		append("desktop.log", line(11));
		await ship({ ...cap, SUPERSET_LOGSHIP_NOW_MS: String(NOW + HOUR_MS) });
		expect(bodies()).toEqual([line(11).trimEnd()]);
	});

	test("sends lines written before a sleep at the next wake, once, and waits for a line's end", async () => {
		write(
			"boot.log",
			"1794955000000 boot.start pid=1\n1794955000100 host.ready\n",
		);
		await ship();
		expect(bySource("boot")).toHaveLength(2);

		// Written after the last pass, then the box sleeps: no process survives.
		append(
			"boot.log",
			"1794955000200 desktop.start\n1794955000300 checkout.en",
		);
		received = [];
		await ship();
		expect(bodies()).toEqual(["1794955000200 desktop.start"]);

		// The wake: a new boot appends to the same file.
		append("boot.log", "d\n1794956000000 boot.start pid=2\n");
		received = [];
		await ship();
		expect(bodies()).toEqual([
			"1794955000300 checkout.end",
			"1794956000000 boot.start pid=2",
		]);
		expect(attr(items()[0], "boot.started_at")).toBe("2026-11-17T22:36:40Z");
		expect(attr(items()[1], "boot.started_at")).toBe("2026-11-17T22:53:20Z");

		received = [];
		await ship();
		expect(received).toHaveLength(0);
		expect(readFileSync(join(state(), "boot.offset"), "utf8").trim()).toBe(
			String(statSync(join(logs(), "boot.log")).size),
		);
	});

	test("a boot log seen for the first time starts at the current boot", async () => {
		write(
			"boot.log",
			"1794950000000 boot.start pid=1\n1794950000100 host.ready\n1794955000000 boot.start pid=2\n",
		);
		await ship();
		expect(bodies()).toEqual(["1794955000000 boot.start pid=2"]);
	});

	test("a file seen for the first time starts at its last 64 KB, from a whole line", async () => {
		const old = `2026-11-17T20:00:00.000Z old ${"o".repeat(100)}\n`.repeat(700);
		write("host-service.log", `${old}2026-11-17T22:00:00.000Z new\n`);
		await ship();
		const sent = bySource("host-service");
		expect(sent.at(-1)?.body).toBe("2026-11-17T22:00:00.000Z new");
		expect(sent.length).toBeLessThan(700);
		expect(
			sent.every((i) => /^2026-11-17T2\d:00:00\.000Z (old|new)/.test(i.body)),
		).toBe(true);
	});

	test.each([
		[403, {}],
		[429, { "Retry-After": "60" }],
	])("a %i from Sentry waits quietly and keeps every offset", async (code, reply) => {
		status = code;
		headers = reply;
		write("boot.log", "1794955000000 boot.start pid=1\n");
		const out = await ship(
			{ SUPERSET_LOGSHIP_INTERVAL_S: "0.02" },
			[],
			() => received.length > 0,
		);
		expect(received).toHaveLength(1);
		expect(out.trim().split("\n")).toHaveLength(1);
		expect(out).toContain(`refused: ${code}`);
		expect(existsSync(join(state(), "boot.offset"))).toBe(false);
		const files = readdirSync(state()).sort();
		expect(files).toEqual(["lock", "retry", "said"]);

		await ship({ SUPERSET_LOGSHIP_NOW_MS: String(NOW + 30_000) });
		expect(received).toHaveLength(1);
		await ship({ SUPERSET_LOGSHIP_NOW_MS: String(NOW + HOUR_MS) });
		expect(received).toHaveLength(2);
		expect(readdirSync(state()).sort()).toEqual(files);

		status = 200;
		await ship({ SUPERSET_LOGSHIP_NOW_MS: String(NOW + 2 * HOUR_MS) });
		expect(received).toHaveLength(3);
		expect(existsSync(join(state(), "boot.offset"))).toBe(true);
	});

	test("does nothing when the claim did not turn it on", async () => {
		write("boot.log", "1794955000000 boot.start pid=1\n");
		await ship({ SUPERSET_SANDBOX_BOX_LOGS: "" });
		await ship({ HOST_SERVICE_SENTRY_DSN: "" });
		expect(received).toHaveLength(0);
		expect(existsSync(join(root, "state"))).toBe(false);
	});
});

describe("superset-boot and the shipper", () => {
	test("starts the shipper only when sandbox.conf turns it on, without the host secret", () => {
		expect(boot).toMatch(
			/if \[ "\$\{SUPERSET_SANDBOX_BOX_LOGS:-\}" = 1 \] && \[ -n "\$\{HOST_SERVICE_SENTRY_DSN:-\}" \][^\n]*\n\tenv -u HOST_SERVICE_SECRET nice -n 10 \/usr\/local\/bin\/superset-logship [^\n]*9>&- &/,
		);
		expect(boot.indexOf("superset-logship >>")).toBeGreaterThan(
			boot.indexOf("superset-memguard >>"),
		);
	});
});

describe("the start hook's stamps", () => {
	const fn = /\nstart_hook\(\) \{\n[\s\S]*?\n\}\n/.exec(boot)?.[0] ?? "";
	const CUSTOMER = "CUSTOMER-OUTPUT secret-db-url pnpm run acme";

	async function runHook(answer: object, states: object[]): Promise<string> {
		let polls = 0;
		const host = Bun.serve({
			port: 0,
			fetch(req) {
				const wrap = (json: object) =>
					Response.json({ result: { data: { json } } });
				if (new URL(req.url).pathname.endsWith(".runStartHook"))
					return wrap(answer);
				const startHook = states[Math.min(polls++, states.length - 1)] ?? {
					state: "none",
				};
				return wrap({ environmentPushed: true, startHook });
			},
		});
		const run = join(root, "run");
		mkdirSync(run, { recursive: true });
		writeFileSync(join(run, "host-service.ready"), "");
		const log = join(root, `boot-${crypto.randomUUID()}.log`);
		const proc = Bun.spawn(
			[
				"bash",
				"-c",
				`set -uo pipefail\nstamp() { printf '%s %s\\n' "$(date +%s%3N)" "$*" >> "$LOG"; }\n${fn}\nstart_hook`,
			],
			{
				env: {
					PATH: process.env.PATH ?? "/usr/bin:/bin",
					LOG: log,
					SUPERSET_HOST_SERVICE_PORT: String(host.port),
					SUPERSET_RUN_DIR: run,
					HOST_SERVICE_SECRET: "boot-secret",
					SUPERSET_HOOK_POLL_S: "0.01",
				},
			},
		);
		await proc.exited;
		host.stop(true);
		return readFileSync(log, "utf8");
	}

	test("a hook that fails at once leaves its exit code and duration, never its output", async () => {
		expect(fn).not.toBe("");
		const log = await runHook(
			{
				started: false,
				reason: "failed",
				command: CUSTOMER,
				exitCode: 2,
				log: CUSTOMER,
			},
			[
				{
					state: "exited",
					command: CUSTOMER,
					exitCode: 2,
					since: 1,
					log: CUSTOMER,
				},
			],
		);
		expect(log).toMatch(/^\d{13} hook\.failed exit=2 ms=\d+\n$/);
	});

	test("a setup that runs then fails is stamped started, then failed with its exit code", async () => {
		const log = await runHook({ started: true, pid: 4321, command: CUSTOMER }, [
			{ state: "running", command: CUSTOMER, pid: 4321, since: 1 },
			{ state: "running", command: CUSTOMER, pid: 4321, since: 1 },
			{
				state: "exited",
				command: CUSTOMER,
				exitCode: 7,
				since: 2,
				log: CUSTOMER,
			},
		]);
		expect(log).not.toContain("CUSTOMER");
		expect(log).toMatch(
			/^\d{13} hook\.started pid=4321\n\d{13} hook\.failed exit=7 ms=\d+\n$/,
		);
	});

	test("a setup that succeeds is stamped exited 0; a run-only hook stops at started", async () => {
		const ok = await runHook({ started: true, pid: 9, command: CUSTOMER }, [
			{
				state: "exited",
				command: CUSTOMER,
				exitCode: 0,
				since: 2,
				log: CUSTOMER,
			},
		]);
		expect(ok).toMatch(
			/hook\.started pid=9\n\d{13} hook\.exited exit=0 ms=\d+\n$/,
		);
		const runOnly = await runHook(
			{ started: true, pid: 0, command: CUSTOMER },
			[{ state: "none" }],
		);
		expect(runOnly).toMatch(/^\d{13} hook\.started pid=0\n$/);
		expect(`${ok}${runOnly}`).not.toContain("CUSTOMER");
	});
});
