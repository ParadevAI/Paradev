import { describe, expect, it } from "bun:test";
import { mapAgyCliQuotaWindows, mapAgyQuotaWindows } from "./agy-quota";

describe("mapAgyQuotaWindows", () => {
	it("maps the four stable session and weekly buckets", () => {
		const windows = mapAgyQuotaWindows({
			groups: [
				{
					buckets: [
						{
							bucketId: "gemini-weekly",
							remainingFraction: 0.98,
							resetTime: "2026-09-01T00:00:00Z",
						},
						{
							bucketId: "gemini-5h",
							remainingFraction: 0.875,
							resetTime: "2026-08-28T20:00:00Z",
						},
					],
				},
				{
					buckets: [
						{ bucketId: "3p-weekly", remainingFraction: 0.75 },
						{ bucketId: "3p-5h", remainingFraction: 0.5 },
					],
				},
			],
		});
		expect(windows.map(({ id, usedPercent }) => [id, usedPercent])).toEqual([
			["gemini-5h", 13],
			["gemini-weekly", 2],
			["3p-5h", 50],
			["3p-weekly", 25],
		]);
	});
});

describe("mapAgyCliQuotaWindows", () => {
	it("keeps Gemini and third-party quota windows from native Antigravity output", () => {
		const windows = mapAgyCliQuotaWindows({
			status: "SUCCESS",
			command: {
				name: "usage",
				data: {
					groups: [
						{
							buckets: [
								{ id: "3p-weekly", remaining_fraction: 0.75 },
								{ id: "3p-5h", remaining_fraction: 0.5 },
							],
						},
						{
							buckets: [
								{ id: "gemini-weekly", remaining_fraction: 1 },
								{
									id: "gemini-5h",
									remaining_fraction: 0.875,
									reset_time: "2026-11-24T20:00:00Z",
								},
								{ id: "gemini-weekly", remaining_fraction: "0" },
								{ id: "unknown-bucket", remaining_fraction: 0.25 },
							],
						},
					],
				},
			},
		});

		expect(windows).toEqual([
			{
				id: "gemini-5h",
				label: "Session — Gemini Models",
				usedPercent: 13,
				resetsAt: new Date("2026-11-24T20:00:00Z"),
			},
			{
				id: "gemini-weekly",
				label: "Weekly — Gemini Models",
				usedPercent: 0,
				resetsAt: null,
			},
			{
				id: "3p-5h",
				label: "Session — Claude and GPT Models",
				usedPercent: 50,
				resetsAt: null,
			},
			{
				id: "3p-weekly",
				label: "Weekly — Claude and GPT Models",
				usedPercent: 25,
				resetsAt: null,
			},
		]);
	});
});
