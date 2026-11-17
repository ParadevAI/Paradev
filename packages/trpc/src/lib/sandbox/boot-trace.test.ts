import { describe, expect, test } from "bun:test";
import {
	BOOT_STALE_MS,
	bootBeganSince,
	bootProgressFrom,
	bootSegments,
	bootStampsFrom,
	describeBootProgress,
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

describe("bootSegments", () => {
	test("runs each stamp to the next and the last to the answer", () => {
		expect(bootSegments({ stamps, answeredAt: 1_789_000_001_300 })).toEqual([
			{
				name: "boot.start → host.exec",
				start: 1_789_000_000_000,
				end: 1_789_000_000_400,
			},
			{
				name: "host.exec → host.listening",
				start: 1_789_000_000_400,
				end: 1_789_000_001_200,
			},
			{
				name: "host.listening → host answered",
				start: 1_789_000_001_200,
				end: 1_789_000_001_300,
			},
		]);
	});

	test("never ends a segment before it starts when our clock trails the box's", () => {
		const [last] = bootSegments({
			stamps: [{ phase: "host.listening", at: 1_789_000_001_200 }],
			answeredAt: 1_789_000_001_150,
		});
		expect(last?.end).toBe(1_789_000_001_200);
	});
});

describe("bootProgressFrom", () => {
	const T = 1_789_000_000_000;
	const earlierBoot = [
		`${T - 3_600_000} boot.start pid=10 bundle=aaaaaaaaaaaa`,
		`${T - 3_599_000} host.exec 1.2.3`,
		`${T - 3_598_000} host.ready`,
	];

	test("a boot still in its passes is booting, even after an earlier boot that finished", () => {
		const log = [
			...earlierBoot,
			`${T} boot.start pid=42 bundle=aaaaaaaaaaaa`,
			`${T + 10} run.cleared`,
			`${T + 20} bundle.fetching bbbbbbbbbbbb`,
			"fetched /usr/local/bin/something",
			`${T + 19_000} setup step install-chrome running (cccccccccccc)`,
			"",
		].join("\n");
		const progress = bootProgressFrom(log, T + 61_000);
		expect(progress.state).toBe("booting");
		expect(progress.startedAt).toBe(T);
		expect(progress.last?.phase).toBe("setup");
		expect(describeBootProgress(progress, T + 61_000)).toBe(
			'boot booting at "setup step install-chrome running (cccccccccccc)", started 61s ago',
		);
	});

	test("host-service started and gave up, or the boot refused: waiting cannot help", () => {
		for (const end of [
			"host.timeout after 60s",
			"boot.refused no conf",
			"host.missing no runtime",
			"host.ready",
		]) {
			const log = [`${T} boot.start pid=1`, `${T + 5} ${end}`].join("\n");
			expect(bootProgressFrom(log, T + 61_000).state).toBe("ended");
		}
	});

	test("a boot that never finished long ago is stale, not booting", () => {
		const log = [`${T} boot.start pid=1`, `${T + 5} steps.start`].join("\n");
		expect(bootProgressFrom(log, T + BOOT_STALE_MS + 60_000).state).toBe(
			"stale",
		);
	});

	test("no boot.start in the log, or none in the tail read, is none", () => {
		expect(bootProgressFrom("", T).state).toBe("none");
		expect(
			bootProgressFrom(`${T} steps.start\n${T + 1} steps.end`, T).state,
		).toBe("none");
		expect(describeBootProgress(null, T)).toBe("boot log unreadable");
	});
});
