import { expect, test } from "bun:test";
import { chatPreviewLoad } from "./chatPreviewLoad";

const pending = { data: undefined, isError: false };

test("a workspace no host knows is unavailable, not loading forever", () => {
	expect(chatPreviewLoad({ status: "not-found" }, pending)).toEqual({
		status: "unavailable",
	});
});

test("a host still resolving or starting is loading", () => {
	expect(chatPreviewLoad({ status: "loading" }, pending)).toEqual({
		status: "loading",
	});
	expect(
		chatPreviewLoad({ status: "local-starting", hostId: "h1" }, pending),
	).toEqual({ status: "loading" });
});

test("an answer, a missing chat and an error map to ready and unavailable", () => {
	const ready = {
		status: "ready",
		kind: "remote",
		hostId: "h1",
		url: "https://relay/hosts/h1",
	} as const;
	expect(
		chatPreviewLoad(ready, {
			data: { title: "Fix login", messages: [] },
			isError: false,
		}),
	).toEqual({ status: "ready", title: "Fix login", messages: [] });
	expect(chatPreviewLoad(ready, { data: null, isError: false })).toEqual({
		status: "unavailable",
	});
	expect(chatPreviewLoad(ready, { data: undefined, isError: true })).toEqual({
		status: "unavailable",
	});
});
