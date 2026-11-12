import { strict as assert } from "node:assert";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { AcquisitionRestKV } from "../packages/shared/src/acquisition-bridge/rest-kv";
import { AcquisitionBridge } from "../packages/shared/src/acquisition-bridge/server";

const root = resolve(process.argv[2] ?? "/");
const socket = resolve(".git/acquisition-test.sock");
const env = {
	...process.env,
	LD_LIBRARY_PATH: `${root}/usr/lib/x86_64-linux-gnu`,
};
const server = Bun.spawn(
	[
		`${root}/usr/bin/redis-server`,
		"--port",
		"0",
		"--unixsocket",
		socket,
		"--save",
		"",
		"--appendonly",
		"no",
	],
	{ env, stdout: "ignore", stderr: "pipe" },
);
async function command(args: (string | number)[]) {
	const child = Bun.spawn(
		[`${root}/usr/bin/redis-cli`, "-s", socket, "--raw", ...args.map(String)],
		{ env, stdout: "pipe", stderr: "pipe" },
	);
	const output = (await new Response(child.stdout).text()).trimEnd();
	if ((await child.exited) !== 0) throw new Error("Local Redis command failed");
	return output;
}
let rest: ReturnType<typeof Bun.serve> | undefined;
try {
	let ready = false;
	for (let attempt = 0; attempt < 30; attempt++) {
		try {
			if ((await command(["PING"])) === "PONG") {
				ready = true;
				break;
			}
		} catch {}
		await Bun.sleep(20);
	}
	assert(ready, "Local Redis must start");
	rest = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const args = (await request.json()) as string[];
			const output = await command(args);
			const result = args[0] === "EVAL" ? Number(output) : output || null;
			return Response.json({ result });
		},
	});
	const kv = new AcquisitionRestKV(
		`http://127.0.0.1:${rest.port}`,
		"fixture-only",
	);
	const bridge = new AcquisitionBridge(kv);
	const lineage = await bridge.mintLineage("accepted", {
		landing_pathname: "/conductor",
		utm_source: "google",
	});
	assert(lineage);
	async function pending() {
		const begin = await bridge.begin(
			"/auth/desktop/success?desktop_state=local-test",
		);
		const issued = await bridge.issue(begin.attempt, lineage.credential);
		assert(issued);
		return bridge.receive(issued.ticket, begin.attempt);
	}
	await Promise.all([
		bridge.updateLineage(lineage.credential, "accepted", {
			landing_pathname: "/pricing",
			utm_source: "twitter",
		}),
		bridge.updateLineage(lineage.credential, "accepted", {
			landing_pathname: "/direct",
		}),
	]);
	const [a, b] = await Promise.all([pending(), pending()]);
	const claims = await Promise.all([
		bridge.bind(a.pendingToken, "fixture-a"),
		bridge.bind(b.pendingToken, "fixture-b"),
	]);
	assert.equal(claims.filter(Boolean).length, 1);
	const event = claims.find(Boolean);
	assert(event);
	assert.equal(event.properties.$anon_distinct_id, lineage.anonymousId);
	assert.equal(
		event.properties.$set_once.acquisition_first_utm_source,
		"google",
	);
	assert.equal(
		event.properties.$set.acquisition_latest_non_direct_utm_source,
		"twitter",
	);
	assert.equal(await bridge.bind(a.pendingToken, "fixture-other"), null);
	const grant = await pending();
	await bridge.revokeLineage(lineage.credential);
	assert.equal(await bridge.bind(grant.pendingToken, event.distinctId), null);
	const renewed = await bridge.updateLineage(lineage.credential, "accepted", {
		landing_pathname: "/new",
	});
	assert(renewed);
	assert.notEqual(renewed.anonymousId, lineage.anonymousId);
	console.log(
		"PASS: real isolated Redis 7 / REST serialization / Lua CAS / concurrent ownership / GETDEL replay / first-latest-direct / revocation / reaccept rotation",
	);
} finally {
	rest?.stop(true);
	server.kill();
	await server.exited;
	await unlink(socket).catch(() => {});
}
