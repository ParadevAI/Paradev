import { describe, expect, test } from "bun:test";
import { addChildSpanToSpan, SentrySpan } from "@sentry/core";
import {
	apiPhases,
	bootBeganSince,
	bootPhases,
	bootStampsFrom,
} from "./boot-trace";

const stamps = [
	{ phase: "boot.start", at: 1_789_000_000_000 },
	{ phase: "host.exec", at: 1_789_000_000_400 },
	{ phase: "host.listening", at: 1_789_000_001_200 },
];

describe("bootStampsFrom", () => {
	test("reads the stamps from a health.check answer", () => {
		const body = {
			result: {
				data: {
					json: {
						status: "ok",
						sandboxBoot: { stamps, bundle: "abc", ready: {} },
					},
				},
			},
		};
		expect(bootStampsFrom(body)).toEqual(stamps);
	});

	test("finds none on a host-service that reports no boot", () => {
		expect(
			bootStampsFrom({ result: { data: { json: { status: "ok" } } } }),
		).toEqual([]);
		expect(bootStampsFrom({})).toEqual([]);
	});
});

describe("bootBeganSince", () => {
	const answer = { stamps, answeredAt: 1_789_000_001_300 };

	test("counts a boot that began during the wake", () => {
		expect(bootBeganSince(answer, 1_788_999_999_000)).toBe(true);
	});

	test("rejects an earlier boot's stamps from a host-service that kept running", () => {
		expect(bootBeganSince(answer, 1_789_000_600_000)).toBe(false);
	});

	test("rejects an answer with no stamps", () => {
		expect(bootBeganSince({ stamps: [], answeredAt: 0 }, 0)).toBe(false);
	});
});

describe("bootPhases", () => {
	test("runs each stamp to the next and the last to the answer", () => {
		expect(bootPhases({ stamps, answeredAt: 1_789_000_001_300 })).toEqual([
			{ name: "boot.start", at: 1_789_000_000_000, ms: 400 },
			{ name: "host.exec", at: 1_789_000_000_400, ms: 800 },
			{ name: "host.listening", at: 1_789_000_001_200, ms: 100 },
		]);
	});

	test("never runs a phase backwards when our clock trails the box's", () => {
		const [last] = bootPhases({
			stamps: [{ phase: "host.listening", at: 1_789_000_001_200 }],
			answeredAt: 1_789_000_001_150,
		});
		expect(last?.ms).toBe(0);
	});
});

describe("apiPhases", () => {
	test("lists the provision steps that ended, in order, and nothing else", () => {
		const transaction = new SentrySpan({
			name: "cloud-workspace.provision",
			op: "job",
			sampled: true,
			startTimestamp: 1_789_000_000,
		});
		const child = (
			name: string,
			op: string,
			startTimestamp: number,
			endTimestamp?: number,
		) =>
			addChildSpanToSpan(
				transaction,
				new SentrySpan({
					name,
					op,
					sampled: true,
					startTimestamp,
					endTimestamp,
				}),
			);
		child("create", "sandbox", 1_789_000_000.4, 1_789_000_009.4);
		child("claim", "sandbox", 1_789_000_000, 1_789_000_000.4);
		child("GET /v1/sandboxes", "http.client", 1_789_000_001, 1_789_000_002);
		child("settle", "sandbox", 1_789_000_009.4);
		expect(apiPhases(transaction)).toEqual([
			{ name: "claim", at: 1_789_000_000_000, ms: 400 },
			{ name: "create", at: 1_789_000_000_400, ms: 9_000 },
		]);
	});
});
