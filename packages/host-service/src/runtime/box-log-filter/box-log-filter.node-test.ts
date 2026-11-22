import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import * as Sentry from "@sentry/node";
import { hostSentryOptions } from "../../sentry";
import { setManagedEnv } from "../sandbox-managed-env";

// Made-up values in the shapes a real box's managed environment holds.
const VALUES = {
	DATABASE_URL:
		"postgresql://app_owner:npg_Q7rT2mWx9KpL@ep-quiet-sky-pooler.us-east-2.aws.neon.tech/app",
	LINEAR_CLIENT_SECRET: "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39",
	DB_PASSWORD: 'p@ss"w\\rd/2024+x=y&z-long1',
};
const HOST_SECRET = "hs_6c1f0b9e2d8a4f7e93b5c0d1a2e3f4b5";
const HEX = VALUES.LINEAR_CLIENT_SECRET;
const PW = VALUES.DB_PASSWORD;

const records: Array<{ level: string; body: string; attributes: unknown }> = [];

async function sent(emit: () => void) {
	const start = records.length;
	emit();
	await Sentry.flush(2_000);
	return records.slice(start);
}

/** No record may hold 12 characters in a row of a secret, raw, JSON-escaped or URL-encoded. */
async function assertNoLeak(emit: () => void, tokens: string[] = []) {
	const out = await sent(emit);
	assert.ok(out.length > 0, "the probe produced a record");
	const text = JSON.stringify(out);
	for (const secret of [...Object.values(VALUES), HOST_SECRET, ...tokens]) {
		for (const form of [
			secret,
			JSON.stringify(secret).slice(1, -1),
			encodeURIComponent(secret),
		]) {
			for (let at = 0; at + 12 <= form.length; at++) {
				const window = form.slice(at, at + 12);
				assert.ok(!text.includes(window), `leaked ${window} in ${text}`);
			}
		}
	}
}

before(async () => {
	const options = hostSentryOptions(
		{
			HOST_SERVICE_SENTRY_DSN: "https://publickey@o0.ingest.sentry.io/0",
			SUPERSET_HOST_RUN_MODE: "sandbox",
			SUPERSET_SANDBOX_BOX_LOGS: "1",
			HOST_SERVICE_SECRET: HOST_SECRET,
		},
		"org",
	);
	assert.ok(options);
	Sentry.init({
		...options,
		transport: () => ({
			send: async (envelope) => {
				for (const [header, payload] of envelope[1] as unknown as Array<
					[{ type: string }, { items: Array<Record<string, unknown>> }]
				>) {
					if (header.type !== "log") continue;
					for (const item of payload.items) {
						records.push({
							level: String(item.level),
							body: String(item.body),
							attributes: item.attributes,
						});
					}
				}
				return {};
			},
			flush: async () => true,
		}),
	});
	await setManagedEnv(VALUES);
});

after(async () => {
	await Sentry.close(2_000);
});

const stderrError = (stderr: string) =>
	Object.assign(new Error("git failed"), { stderr });

const PROBES: Array<[string, () => void, string[]?]> = [
	[
		"an Error's stderr, allowlisted prefix",
		() =>
			console.warn(
				"[host-service] project purge failed:",
				stderrError(`fatal\n${HEX}`),
			),
	],
	[
		"an Error's stderr, other prefix",
		() => console.warn("[git] fetch failed:", stderrError(`line\n${HEX}`)),
	],
	[
		"an interpolated stderr tail, other prefix",
		() =>
			console.warn(
				`[generateNamesViaAgentCli] exit 1; stderr tail: ${HEX.slice(-30)}`,
			),
	],
	[
		"a managed value as a parameter",
		() => console.log("[sandbox] could not write git config (key):", HEX),
	],
	[
		"a managed value JSON-escaped in a parameter",
		() =>
			console.log("[host-service:db] violations:", JSON.stringify({ pw: PW })),
	],
	[
		"a managed value URL-encoded in a parameter",
		() =>
			console.log(
				"[host-service] relay:",
				`https://example.com/cb?state=${encodeURIComponent(PW)}`,
			),
	],
	[
		"a URL value as a parameter",
		() => console.log("[supervisor] db:", VALUES.DATABASE_URL),
	],
	[
		"the host secret as a parameter",
		() => console.log("[host-service] gate:", HOST_SECRET),
	],
	[
		"an object parameter holding a value",
		() =>
			console.log("[sandbox] run terminal not started", {
				error: HEX,
				nested: { PW },
			}),
	],
	["a printf substitution", () => console.log("[host-service] %s", HEX)],
	["a plain object first argument", () => console.log({ secret: HEX })],
	[
		"a GitHub token in a URL parameter",
		() =>
			console.log(
				"[host-service] relay:",
				"https://x-access-token:ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@github.com/o/r.git",
			),
		["ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
	],
	[
		"a bearer token parameter",
		() =>
			console.log("[host-service] header:", "Bearer opaque.token-value_123456"),
		["opaque.token-value_123456"],
	],
	[
		"a GitHub personal token parameter",
		() =>
			console.log(
				"[host-service] key:",
				"github_pat_11ABCDEFG0abcdefghij_klmnop",
			),
		["github_pat_11ABCDEFG0abcdefghij_klmnop"],
	],
	[
		"a Stripe key parameter",
		() => console.log("[host-service] key:", "sk_live_51HxAbCdEfGhIjKlMnOpQr"),
		["sk_live_51HxAbCdEfGhIjKlMnOpQr"],
	],
	[
		"an sk- key parameter",
		() => console.log("[host-service] key:", "sk-ant-api03-AbCdEfGhIjKlMnOpQr"),
		["sk-ant-api03-AbCdEfGhIjKlMnOpQr"],
	],
];

describe("box log probes, under Node through the Sentry SDK's own console formatting", () => {
	for (const [name, emit, tokens] of PROBES) {
		it(`does not leak ${name}`, async () => {
			await assertNoLeak(emit, tokens);
		});
	}

	it("sends an allowlisted line as its template and its parameters, and not a debug line", async () => {
		const out = await sent(() => {
			console.log("[sandbox] launched (agent, workspace):", "claude", "ws-1");
			console.log("[host-service:vitals]", '{"pid":1117}');
			console.debug("[host-service] a debug line");
		});
		assert.deepEqual(
			out.map(({ body, attributes }) => {
				const kept = Object.entries(
					attributes as Record<string, { value: unknown }>,
				)
					.filter(([key]) => key.startsWith("sentry.message.parameter."))
					.map(([, attribute]) => attribute.value);
				return [body, ...kept];
			}),
			[
				["[sandbox] launched (agent, workspace): {} {}", "claude", "ws-1"],
				["[host-service:vitals] {}", '{"pid":1117}'],
			],
		);
	});
});
