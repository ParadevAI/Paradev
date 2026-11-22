import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import * as Sentry from "@sentry/node";
import { hostSentryOptions } from "../../sentry";
import { setManagedEnv } from "../sandbox-managed-env";

// Made-up values in the shapes a real box's managed environment holds.
const VALUES = {
	DATABASE_URL:
		"postgresql://app_owner:npg_Q7r/T2mWx9KpL@ep-quiet-sky-pooler.us-east-2.aws.neon.tech/app",
	LINEAR_CLIENT_SECRET: "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39",
	DURABLE_STREAMS_SECRET:
		"k8Jd2LmQ9xVb4NcR7tYw1ZpH6sGf3AeU0oIi5KjXlMnBvCzQwErTyUiOpAsDfGhJkLzXcVbNm1234567890qwertyuiopASDFGH",
	DB_PASSWORD: 'p@ss"w\\rd/2024+x=y&z-long1',
	GH_APP_PRIVATE_KEY: [
		"-----BEGIN PRIVATE KEY-----",
		"MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
		"-----END PRIVATE KEY-----",
	].join("\n"),
	SHORT_PIN: "8213",
};
const HOST_SECRET = "hs_6c1f0b9e2d8a4f7e93b5c0d1a2e3f4b5";
const WINDOW = 12;

const records: Array<{ level: string; body: string; attributes: unknown }> = [];

function windowsOf(text: string): string[] {
	const out: string[] = [];
	for (let at = 0; at + WINDOW <= text.length; at++) {
		out.push(text.slice(at, at + WINDOW));
	}
	return out;
}

/** Independent of the scrub: every form the reviewer and the SDK can produce. */
function leakWindows(secret: string): string[] {
	const json = JSON.stringify(secret).slice(1, -1);
	const forms = [
		secret,
		...secret.split("\n"),
		json,
		JSON.stringify(json).slice(1, -1),
		encodeURIComponent(secret),
		Buffer.from(secret).toString("hex"),
	];
	for (const shift of [0, 1, 2]) {
		forms.push(
			Buffer.concat([Buffer.alloc(shift), Buffer.from(secret)])
				.toString("base64")
				.slice(4, -4),
		);
	}
	return forms.flatMap(windowsOf);
}

const ALL_SECRETS = [
	...Object.values(VALUES).filter((value) => value.length >= WINDOW),
	HOST_SECRET,
];

async function sent(emit: () => void) {
	const start = records.length;
	emit();
	await Sentry.flush(2_000);
	return records.slice(start);
}

async function assertNoLeak(
	emit: () => void,
	tokens: string[] = [],
): Promise<void> {
	const out = await sent(emit);
	assert.ok(out.length > 0, "the probe produced a record");
	const text = JSON.stringify(out);
	for (const secret of [...ALL_SECRETS, ...tokens]) {
		for (const window of leakWindows(secret)) {
			assert.ok(!text.includes(window), `leaked ${window} in ${text}`);
		}
	}
}

function stderrError(message: string, stderr: string): Error {
	return Object.assign(new Error(message), { stderr });
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

const {
	DATABASE_URL,
	LINEAR_CLIENT_SECRET: HEX,
	DURABLE_STREAMS_SECRET: LONG,
} = VALUES;
const PW = VALUES.DB_PASSWORD;
const PEM_LINE = VALUES.GH_APP_PRIVATE_KEY.split("\n")[1] ?? "";

const PROBES: Array<[string, () => void, string[]?]> = [
	[
		"an Error's stderr, allowlisted prefix",
		() =>
			console.warn(
				"[host-service] project purge failed:",
				stderrError("git failed", `fatal: bad\n${HEX}\nmore`),
			),
	],
	[
		"an Error's stderr, other prefix",
		() =>
			console.warn(
				"[git] fetch failed:",
				stderrError("git failed", `line\n${HEX}`),
			),
	],
	[
		"a stderr tail cut mid-value, other prefix",
		() =>
			console.warn(
				`[generateNamesViaAgentCli] exit 1; stderr tail: ${`noise ${LONG}`.slice(-40)}`,
			),
	],
	[
		"a stderr tail cut mid-value, allowlisted prefix",
		() => console.warn(`[host-service] tail: ${LONG.slice(12, 40)}`),
	],
	[
		"24 characters from the middle of a value",
		() => console.log(`[sandbox] got ${HEX.slice(8, 32)} back`),
	],
	[
		"an Error whose message is JSON with a value",
		() =>
			console.error(
				"[sandbox] could not import",
				new Error(JSON.stringify({ DB_PASSWORD: PW })),
			),
	],
	[
		"a value inside JSON",
		() => console.log(`[sandbox] env ${JSON.stringify({ pw: PW })}`),
	],
	[
		"a value inside JSON inside JSON",
		() =>
			console.log(
				`[sandbox] env ${JSON.stringify(JSON.stringify({ pw: PW }))}`,
			),
	],
	[
		"a value percent-encoded in a URL",
		() =>
			console.log(
				`[host-service] callback https://example.com/cb?state=${encodeURIComponent(PW)}`,
			),
	],
	[
		"a value base64-encoded as basic auth",
		() =>
			console.log(
				`[host-service] auth ${Buffer.from(`app_owner:${PW}`).toString("base64")}`,
			),
	],
	[
		"a value hex-encoded",
		() =>
			console.log(`[host-service] digest ${Buffer.from(HEX).toString("hex")}`),
	],
	[
		"the password part of a URL value alone",
		() => console.log("[host-service] pw npg_Q7r/T2mWx9KpL"),
	],
	["a whole URL value", () => console.log(`[supervisor] db ${DATABASE_URL}`)],
	[
		"a URL password with slashes that is not a managed value",
		() =>
			console.log("[host-service] postgres://u:pa/ss/word99@db.internal/app"),
		["pa/ss/word99"],
	],
	[
		"a short value after KEY=",
		() => console.log("[host-service] SHORT_PIN=8213 set"),
		[],
	],
	[
		'a short value after "KEY":',
		() => console.log('[host-service] {"SHORT_PIN":"8213"}'),
	],
	[
		"a short value after KEY:",
		() => console.log("[host-service] SHORT_PIN: 8213"),
	],
	[
		"one line of a multi-line value",
		() => console.log(`[sandbox] key line ${PEM_LINE}`),
	],
	[
		"a private key header",
		() => console.log("[sandbox] -----BEGIN PRIVATE KEY-----"),
	],
	[
		"a Stripe key",
		() => console.log("[host-service] using sk_live_51HxAbCdEfGhIjKlMnOpQr"),
		["sk_live_51HxAbCdEfGhIjKlMnOpQr"],
	],
	[
		"a Google API key",
		() =>
			console.log("[host-service] key AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv"),
		["AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv"],
	],
	[
		"a GitLab token",
		() => console.log("[host-service] glpat-AbCdEfGhIjKlMnOpQrSt"),
		["glpat-AbCdEfGhIjKlMnOpQrSt"],
	],
	[
		"an npm token",
		() =>
			console.log("[host-service] npm_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"),
		["npm_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
	],
	[
		"an AWS secret key",
		() =>
			console.log(
				"[host-service] aws wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			),
		["wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"],
	],
	[
		"a Slack webhook URL",
		() =>
			console.log(
				"[host-service] hook https://hooks.slack.com/services/T0000/B0000/XXXXXXXXXXXXXXXXXXXXXXXX",
			),
		["B0000/XXXXXXXXXXXXXXXXXXXXXXXX"],
	],
	[
		"a password: pair",
		() => console.log("[host-service] password: hunter2-long-pass"),
		["hunter2-long-pass"],
	],
	[
		"an x-api-key: pair",
		() => console.log("[host-service] x-api-key: opaque-key-9876543210"),
		["opaque-key-9876543210"],
	],
	[
		"a GitHub token in a git remote",
		() =>
			console.error(
				"[host-service] fatal: unable to access 'https://x-access-token:ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@github.com/o/r.git/'",
			),
		["ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
	],
	[
		"a value split across two lines",
		() => {
			console.log(`[sandbox] a ${HEX.slice(0, 20)}`);
			console.log(`[sandbox] ${HEX.slice(20)} b`);
		},
	],
	["a printf substitution", () => console.log("[host-service] %s", HEX)],
	[
		"a plain object first argument",
		() => console.log({ secret: HEX, nested: { PW } }),
	],
	["the host secret", () => console.log(`[host-service] gate ${HOST_SECRET}`)],
	[
		"a JWT and a bearer token",
		() =>
			console.log(
				"[host-service] Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
			),
		["eyJzdWIiOiIxMjM0NTY3ODkwIn0"],
	],
];

describe("box log probes, under Node through the Sentry SDK's own console formatting", () => {
	for (const [name, emit, tokens] of PROBES) {
		it(`does not leak ${name}`, () => assertNoLeak(emit, tokens));
	}

	it("redacts the short value after its key", async () => {
		const out = await sent(() =>
			console.log("[host-service] SHORT_PIN=8213 set"),
		);
		assert.equal(out[0]?.body, "[host-service] SHORT_PIN=[redacted] set");
	});

	it("sends operational lines as they are", async () => {
		const out = await sent(() => {
			console.log("[host-service] listening on http://[::]:4879");
			console.log(
				"[sandbox] start hook running (pid 2134) (command of 25 chars)",
			);
			console.log('[host-service:vitals] {"pid":1117,"memoryMb":{"rss":212}}');
			console.debug("[host-service] a debug line");
		});
		assert.deepEqual(
			out.map((record) => record.body),
			[
				"[host-service] listening on http://[::]:4879",
				"[sandbox] start hook running (pid 2134) (command of 25 chars)",
				'[host-service:vitals] {"pid":1117,"memoryMb":{"rss":212}}',
			],
		);
	});
});
