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
	symlinkSync,
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
type Received = { auth: string | null; item: string; items: Item[] };

let status = 200;
let headers: Record<string, string> = {};
let received: Received[] = [];
const sentry = Bun.serve({
	port: 0,
	async fetch(req) {
		const [, item = "", payload = "{}"] = (await req.text()).split("\n");
		received.push({
			auth: req.headers.get("x-sentry-auth"),
			item,
			items: JSON.parse(payload).items ?? [],
		});
		return new Response("", { status, headers });
	},
});
afterAll(() => sentry.stop(true));

const HOUR_MS = 3_600_000;
const NOW = 1_794_960_000_000;
/** 2026-11-17T21:13:20.000Z, the first boot of every test. */
const BOOT1 = 1_794_950_000_000;
const iso = (ms: number) => new Date(ms).toISOString();
const WS = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

let root = "";
const logs = () => join(root, "log");
const state = () => join(root, "state", "logship");
const write = (name: string, text: string) =>
	writeFileSync(join(logs(), name), text);
const append = (name: string, text: string) =>
	appendFileSync(join(logs(), name), text);
const bootStart = (ms: number) =>
	append("boot.log", `${ms} boot.start pid=1\n`);

beforeEach(() => {
	if (root) rmSync(root, { recursive: true, force: true });
	root = mkdtempSync(join(tmpdir(), "logship-"));
	mkdirSync(logs());
	writeFileSync(
		join(root, "contract.sh"),
		`SUPERSET_LOG_DIR='${logs()}'\nSUPERSET_STATE_DIR='${join(root, "state")}'\nSUPERSET_BOOT_LOG='${logs()}/boot.log'\n`,
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
			SUPERSET_SANDBOX_WORKSPACE_ID: WS,
			SUPERSET_SANDBOX_ORGANIZATION_ID: ORG,
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
	const stderr = await new Response(proc.stderr).text();
	if (stderr) throw new Error(`superset-logship wrote to stderr: ${stderr}`);
	return await new Response(proc.stdout).text();
}

const items = () => received.flatMap((r) => r.items);
const bodies = () => items().map((i) => i.body);
const attr = (i: Item | undefined, key: string) => i?.attributes[key]?.value;
const bySource = (source: string) =>
	items().filter((i) => attr(i, "log.source") === source);
const isCap = (i: Item) => i.body.startsWith("log shipper: cap of");

describe("superset-logship", () => {
	test("sends each line with exactly the record contract's attributes", async () => {
		bootStart(BOOT1);
		append("boot.log", `${BOOT1 + 123} host.ready\n`);
		write(
			"host-service.log",
			`${iso(BOOT1 + 5_000).replace("000Z", "822Z")} [host-service] boom\n    at stack (file.js:1)\n`,
		);
		await ship();

		expect(received[0]?.auth).toContain("sentry_key=publickey");
		expect(JSON.parse(received[0]?.item ?? "{}")).toMatchObject({
			type: "log",
			content_type: "application/vnd.sentry.items.log+json",
		});
		const [start, ready] = bySource("boot");
		expect(start).toMatchObject({
			level: "info",
			timestamp: BOOT1 / 1000,
			body: `${BOOT1} boot.start pid=1`,
		});
		expect(start?.trace_id).toMatch(/^[0-9a-f]{32}$/);
		expect(start?.attributes).toEqual({
			"log.source": { value: "boot", type: "string" },
			"cloud_workspace.id": { value: WS, type: "string" },
			"organization.id": { value: ORG, type: "string" },
			"log.file.offset": { value: 0, type: "integer" },
			"box.boot_started_at": { value: BOOT1, type: "integer" },
		});
		expect(attr(ready, "log.file.offset")).toBe(31);
		expect(ready?.timestamp).toBe((BOOT1 + 123) / 1000);

		const [line, stack] = bySource("host-service");
		expect(line?.timestamp).toBe((BOOT1 + 5_822) / 1000);
		expect(attr(line, "box.boot_started_at")).toBe(BOOT1);
		// No time of its own: the line before it gives both its time and boot.
		expect(stack?.timestamp).toBe(line?.timestamp as number);
		expect(attr(stack, "box.boot_started_at")).toBe(BOOT1);
	});

	test("never reads the setup script's or the clone's output", async () => {
		bootStart(BOOT1);
		write("start-hook.log", `${BOOT1 + 1} CUSTOMER-SETUP-OUTPUT\n`);
		write("checkout.log", `${BOOT1 + 1} CUSTOMER-CLONE-OUTPUT\n`);
		await ship();
		expect(JSON.stringify(received)).not.toContain("CUSTOMER");
		expect(readdirSync(state())).not.toContain("start-hook.offset");
	});

	test("drops vitals and memguard rank lines and keeps kills", async () => {
		bootStart(BOOT1);
		const t = (s: number) => iso(BOOT1 + s * 1000);
		write(
			"host-service.log",
			`${t(1)} [host-service:vitals] {"rss":120}\n${t(2)} [host-service] listening\n`,
		);
		write(
			"memguard.log",
			`${BOOT1 + 10} memguard rank pid=9 node 0->500\n${BOOT1 + 500} memguard reap pid=9 node rss=900MB adj=500\n`,
		);
		await ship();
		expect(bodies()).toEqual([
			`${BOOT1} boot.start pid=1`,
			`${BOOT1 + 500} memguard reap pid=9 node rss=900MB adj=500`,
			`${t(2)} [host-service] listening`,
		]);
	});

	test("reads only regular files, never a link the box's user put in the log directory", async () => {
		bootStart(BOOT1);
		const secret = join(root, "secret.txt");
		writeFileSync(secret, `${BOOT1 + 1} desktop SECRET-FILE\n`);
		symlinkSync(secret, join(logs(), "desktop.log"));
		await ship();
		expect(JSON.stringify(received)).not.toContain("SECRET-FILE");
		expect(existsSync(join(state(), "desktop.offset"))).toBe(false);
	});

	test("scrubs token formats before a line leaves", async () => {
		bootStart(BOOT1);
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
		const t = (s: number) => iso(BOOT1 + s * 1000);
		write(
			"host-service.log",
			[
				...secrets.map((s, n) => `${t(n)} value ${s} end`),
				`${t(20)} clone https://x-access-token:opaque-token-value@github.com/acme/api.git`,
				`${t(21)} Authorization: Bearer abc.def-ghi_jkl123`,
				`${t(22)} {"api_key":"plain-value-1234","HOST_SERVICE_SECRET=s3cr3tvalue"}`,
				`${t(23)} password=hunter2hunter2 next`,
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

	test("collapses a run of identical lines read in one pass into one record with a count, across dropped lines", async () => {
		bootStart(BOOT1);
		write(
			"desktop.log",
			`${BOOT1 + 1} desktop websockify retry\n${BOOT1 + 2} desktop websockify retry\n${BOOT1 + 3} desktop websockify retry\n${BOOT1 + 4} desktop X ready\n`,
		);
		const t = (s: number) => iso(BOOT1 + s * 1000);
		write(
			"host-service.log",
			`${t(1)} sweep done\n${t(2)} [host-service:vitals] {}\n${t(3)} sweep done\n`,
		);
		await ship();
		const [retry, ready] = bySource("desktop");
		expect(bySource("desktop")).toHaveLength(2);
		expect(retry?.body).toBe(`${BOOT1 + 1} desktop websockify retry`);
		expect(attr(retry, "log.repeat_count")).toBe(3);
		expect(attr(ready, "log.repeat_count")).toBeUndefined();
		expect(attr(ready, "log.file.offset")).toBe(117);
		expect(
			bySource("host-service").map((i) => attr(i, "log.repeat_count")),
		).toEqual([2]);
		expect(
			readFileSync(join(state(), "host-service.time"), "utf8").trim(),
		).toBe(String(BOOT1 + 3000));
	});

	test("the hour's cap counts each record's serialized size, with one cap record", async () => {
		bootStart(BOOT1);
		const line = (n: number) => `${BOOT1 + 10 + n} desktop line ${n}\n`;
		write(
			"desktop.log",
			Array.from({ length: 10 }, (_, n) => line(n)).join(""),
		);
		const cap = { SUPERSET_SANDBOX_BOX_LOGS_CAP_BYTES: "1000" };
		await ship(cap);
		const kept = items().filter((i) => !isCap(i));
		const size = (i: Item) => Buffer.byteLength(JSON.stringify(i));
		const keptBytes = kept.reduce((n, i) => n + size(i), 0);
		expect(keptBytes).toBeLessThanOrEqual(1000);
		expect(keptBytes + size(kept[0] as Item)).toBeGreaterThan(1000);
		// Counting bodies alone would have kept every line.
		expect(kept.length).toBeLessThan(11);
		expect(items().filter(isCap)).toHaveLength(1);

		const hour = readFileSync(join(state(), "hour"), "utf8").trim().split(" ");
		expect(Number(hour[1])).toBe(keptBytes + size(items().find(isCap) as Item));
		expect(hour[2]).toBe("1");

		// A record small enough to fit what is left still waits for the next hour.
		append("desktop.log", `${BOOT1 + 99} x\n`);
		received = [];
		await ship(cap);
		expect(received).toHaveLength(0);

		append("desktop.log", line(11));
		await ship({ ...cap, SUPERSET_LOGSHIP_NOW_MS: String(NOW + HOUR_MS) });
		expect(bodies()).toEqual([line(11).trimEnd()]);
	});

	test("sends lines written before a sleep at the next wake, once, and waits for a line's end", async () => {
		bootStart(BOOT1);
		append("boot.log", `${BOOT1 + 100} host.ready\n`);
		await ship();
		expect(bySource("boot")).toHaveLength(2);

		// Written after the last pass, then the box sleeps: no process survives.
		append(
			"boot.log",
			`${BOOT1 + 200} desktop.start\n${BOOT1 + 300} checkout.en`,
		);
		received = [];
		await ship();
		expect(bodies()).toEqual([`${BOOT1 + 200} desktop.start`]);

		// The wake: a new boot appends to the same file.
		const boot2 = BOOT1 + 1_000_000;
		append("boot.log", `d\n${boot2} boot.start pid=2\n`);
		received = [];
		await ship();
		expect(bodies()).toEqual([
			`${BOOT1 + 300} checkout.end`,
			`${boot2} boot.start pid=2`,
		]);
		expect(items().map((i) => attr(i, "box.boot_started_at"))).toEqual([
			BOOT1,
			boot2,
		]);

		received = [];
		await ship();
		expect(received).toHaveLength(0);
		expect(readFileSync(join(state(), "boot.offset"), "utf8").trim()).toBe(
			String(statSync(join(logs(), "boot.log")).size),
		);
	});

	test("turned on for the first time, every file starts at the current boot", async () => {
		const boot2 = BOOT1 + 1_000_000;
		bootStart(BOOT1);
		append("boot.log", `${BOOT1 + 1} host.ready\n`);
		bootStart(boot2);
		write(
			"host-service.log",
			`${iso(BOOT1 + 5)} old\n    old stack\n${iso(boot2 - 1)} last old\n    old stack\n${iso(boot2 + 7)} new\n    new stack\n`,
		);
		write("memguard.log", `${BOOT1 + 9} memguard old\n${boot2} memguard new\n`);
		write("desktop.log", `${BOOT1 + 9} desktop old\n`);
		await ship();
		expect(bodies()).toEqual([
			`${boot2} boot.start pid=1`,
			`${boot2} memguard new`,
			`${iso(boot2 + 7)} new`,
			"    new stack",
		]);
		expect(readFileSync(join(state(), "desktop.offset"), "utf8").trim()).toBe(
			String(statSync(join(logs(), "desktop.log")).size),
		);
	});

	test("on, then off for a boot, then on again: nothing written while off is sent", async () => {
		bootStart(BOOT1);
		write("host-service.log", `${iso(BOOT1 + 1)} on in boot 1\n`);
		await ship();
		expect(bodies()).toEqual([
			`${BOOT1} boot.start pid=1`,
			`${iso(BOOT1 + 1)} on in boot 1`,
		]);

		// Boot 2 runs with the flag off. Its runner should remove the state; an
		// older runner leaves it, so the shipper must not trust it either.
		const boot2 = BOOT1 + 1_000_000;
		bootStart(boot2);
		append(
			"host-service.log",
			`${iso(boot2 + 1)} WHILE-OFF\n    WHILE-OFF stack\n`,
		);
		write("desktop.log", `${boot2 + 2} desktop WHILE-OFF\n`);

		const boot3 = BOOT1 + 2_000_000;
		bootStart(boot3);
		append("host-service.log", `${iso(boot3 + 1)} on in boot 3\n`);
		received = [];
		await ship();
		expect(JSON.stringify(received)).not.toContain("WHILE-OFF");
		expect(bodies()).toEqual([
			`${boot3} boot.start pid=1`,
			`${iso(boot3 + 1)} on in boot 3`,
		]);
	});

	test.each([
		[403, {}],
		[429, { "Retry-After": "60" }],
	])("a %i from Sentry waits quietly and keeps every offset", async (code, reply) => {
		status = code;
		headers = reply;
		bootStart(BOOT1);
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
		expect(files).toEqual(["boot", "lock", "retry"]);

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
		bootStart(BOOT1);
		await ship({ SUPERSET_SANDBOX_BOX_LOGS: "" });
		await ship({ HOST_SERVICE_SENTRY_DSN: "" });
		expect(received).toHaveLength(0);
		expect(existsSync(join(root, "state"))).toBe(false);
	});
});

describe("the start hook's stamps", () => {
	const fn = /\nstart_hook\(\) \{\n[\s\S]*?\n\}\n/.exec(boot)?.[0] ?? "";
	const CUSTOMER = "CUSTOMER-OUTPUT secret-db-url pnpm run acme";

	async function runHook(answer: object): Promise<string> {
		const host = Bun.serve({
			port: 0,
			fetch(req) {
				const json = new URL(req.url).pathname.endsWith(".runStartHook")
					? answer
					: { environmentPushed: true };
				return Response.json({ result: { data: { json } } });
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
				},
			},
		);
		await proc.exited;
		host.stop(true);
		return readFileSync(log, "utf8");
	}

	test("a hook that fails to start is stamped without its command or output", async () => {
		expect(fn).not.toBe("");
		const log = await runHook({
			started: false,
			reason: "failed",
			command: CUSTOMER,
			exitCode: 2,
			log: CUSTOMER,
		});
		expect(log).toMatch(/^\d{13} hook\.start\.failed\n$/);
	});

	test("a started hook is stamped with its pid only", async () => {
		const log = await runHook({ started: true, pid: 4321, command: CUSTOMER });
		expect(log).toMatch(/^\d{13} hook\.started pid=4321\n$/);
	});
});
