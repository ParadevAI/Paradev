import { expect, test } from "bun:test";
import { POST } from "./route";

const post = (body: string, authorization?: string) =>
	POST(
		new Request("http://localhost/api/pages/access", {
			method: "POST",
			headers: authorization ? { authorization } : {},
			body,
		}),
	);

const valid = JSON.stringify({
	pageId: crypto.randomUUID(),
	userIds: [crypto.randomUUID()],
});

test("refuses a caller without the realtime secret", async () => {
	expect((await post(valid)).status).toBe(401);
	expect((await post(valid, "Bearer wrong")).status).toBe(401);
});

test("rejects a malformed request before reading anything", async () => {
	for (const body of [
		"invalid",
		"{}",
		JSON.stringify({ pageId: "not-a-uuid", userIds: [] }),
		JSON.stringify({ pageId: crypto.randomUUID(), userIds: ["not-a-uuid"] }),
	]) {
		expect((await post(body, "Bearer test-nudge-secret")).status).toBe(400);
	}
});
