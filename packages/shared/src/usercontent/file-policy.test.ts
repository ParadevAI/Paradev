import { describe, expect, test } from "bun:test";
import { fileResponsePolicy } from "./file-policy";

describe("fileResponsePolicy", () => {
	test("scriptable documents always download", () => {
		for (const type of [
			"text/html",
			"text/html; charset=utf-8",
			"application/xhtml+xml",
			"application/xml",
		]) {
			expect(
				fileResponsePolicy({ contentType: type, fetchDest: "document" })
					.disposition,
			).toBe("attachment");
			expect(
				fileResponsePolicy({ contentType: type, fetchDest: "image" })
					.disposition,
			).toBe("attachment");
		}
	});

	test("svg renders as an image, downloads as a document", () => {
		const asImage = fileResponsePolicy({
			contentType: "image/svg+xml",
			fetchDest: "image",
		});
		expect(asImage.disposition).toBe("inline");
		const navigated = fileResponsePolicy({
			contentType: "image/svg+xml",
			fetchDest: "document",
		});
		expect(navigated.disposition).toBe("attachment");
		const noDest = fileResponsePolicy({
			contentType: "image/svg+xml",
			fetchDest: undefined,
		});
		expect(noDest.disposition).toBe("attachment");
	});

	test("media, pdf, and plain text render inline", () => {
		for (const type of [
			"video/mp4",
			"image/png",
			"audio/mpeg",
			"application/pdf",
			"text/plain",
			"application/json",
		]) {
			expect(
				fileResponsePolicy({ contentType: type, fetchDest: "document" })
					.disposition,
			).toBe("inline");
		}
	});

	test("unknown binary downloads", () => {
		expect(
			fileResponsePolicy({
				contentType: "application/zip",
				fetchDest: "document",
			}).disposition,
		).toBe("attachment");
		expect(
			fileResponsePolicy({ contentType: "", fetchDest: undefined }).contentType,
		).toBe("application/octet-stream");
	});
});
