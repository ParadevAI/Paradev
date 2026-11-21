import { expect, test } from "bun:test";
import { abortable } from "./discovery";

test("abortable stops waiting when the deadline passes", async () => {
	const controller = new AbortController();
	const waiting = abortable(new Promise(() => {}), controller.signal);
	controller.abort();
	await expect(waiting).rejects.toThrow("timed out");
});
