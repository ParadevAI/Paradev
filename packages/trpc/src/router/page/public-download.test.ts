import { describe, expect, it } from "bun:test";
import {
	limitAllows,
	PUBLIC_DOWNLOAD_SECONDS,
	publicDownloadUrl,
} from "./public-download";

const presign = async (key: string, seconds: number) =>
	`https://r2.test/${key}?expires=${seconds}`;

describe("publicDownloadUrl", () => {
	it("mints a five-minute link when the requester is under the limit", async () => {
		expect(
			await publicDownloadUrl({
				storageKey: "pages/p/1.html",
				requester: "203.0.113.7",
				withinLimit: async () => true,
				presign,
			}),
		).toBe(`https://r2.test/pages/p/1.html?expires=${PUBLIC_DOWNLOAD_SECONDS}`);
	});

	it("answers null instead of failing once the requester is over the limit", async () => {
		let presigned = false;
		expect(
			await publicDownloadUrl({
				storageKey: "pages/p/1.html",
				requester: "203.0.113.7",
				withinLimit: async () => false,
				presign: async () => {
					presigned = true;
					return "unused";
				},
			}),
		).toBeNull();
		expect(presigned).toBe(false);
	});

	it("answers null when signing fails", async () => {
		expect(
			await publicDownloadUrl({
				storageKey: "pages/p/1.html",
				requester: "203.0.113.7",
				withinLimit: async () => true,
				presign: async () => {
					throw new Error("r2 down");
				},
			}),
		).toBeNull();
	});
});

describe("limitAllows", () => {
	it("refuses when the limiter timed out, which it reports as a success", () => {
		expect(limitAllows({ success: true, reason: "timeout" })).toBe(false);
		expect(limitAllows({ success: true })).toBe(true);
		expect(limitAllows({ success: false })).toBe(false);
	});
});
