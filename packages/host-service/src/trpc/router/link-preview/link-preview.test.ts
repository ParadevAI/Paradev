import { describe, expect, it } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { linkPreviewRouter } from "./link-preview";

const callerFor = (isAuthenticated: boolean) =>
	linkPreviewRouter.createCaller({ isAuthenticated } as HostServiceContext);

describe("linkPreview.get", () => {
	it.each([
		"http://localhost:3000/",
		"http://127.0.0.1/",
		"http://192.168.1.1/router",
		"https://user:secret@example.com/",
		"file:///etc/passwd",
		"not a url",
		"",
	])("answers %s with an empty preview instead of an error", async (url) => {
		expect(await callerFor(true).get({ url })).toEqual({
			title: null,
			iconDataUrl: null,
		});
	});

	it("needs an authenticated caller", async () => {
		const error = (await callerFor(false)
			.get({ url: "https://example.com/" })
			.catch((thrown: unknown) => thrown)) as TRPCError;
		expect(error.code).toBe("UNAUTHORIZED");
	});
});
