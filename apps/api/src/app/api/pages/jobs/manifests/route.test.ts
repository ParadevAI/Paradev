import { beforeEach, expect, mock, test } from "bun:test";
import * as manifestsJob from "@superset/trpc/page-manifests-job";
import * as verifyQstash from "@/lib/verifyQstash";
import { stub } from "../../../../../../test/stub";

const verify = mock(
	async (
		_request: Request,
		_body: string,
		_path: string,
	): Promise<Response | null> => null,
);
const rewrite = mock(async (pageIds: readonly string[]) => ({
	rewritten: pageIds.length,
}));
stub(verifyQstash, { verifyQstashRequest: verify });
stub(manifestsJob, { rewritePageManifests: rewrite });
const { POST } = await import("./route");

const post = (body: string) =>
	POST(new Request("http://localhost/job", { method: "POST", body }));

beforeEach(() => {
	verify.mockClear();
	rewrite.mockClear();
});

test("refuses a request QStash did not sign", async () => {
	verify.mockImplementationOnce(async () =>
		Response.json({ error: "Invalid signature" }, { status: 401 }),
	);
	const result = await post(JSON.stringify({ pageIds: [crypto.randomUUID()] }));
	expect(result.status).toBe(401);
	expect(rewrite).not.toHaveBeenCalled();
});

test("rejects a malformed payload without rewriting anything", async () => {
	for (const body of [
		"invalid",
		"{}",
		JSON.stringify({ pageIds: [] }),
		JSON.stringify({ pageIds: ["not-a-uuid"] }),
		JSON.stringify({
			pageIds: Array.from({ length: 101 }, () => crypto.randomUUID()),
		}),
	]) {
		expect((await post(body)).status).toBe(400);
	}
	expect(rewrite).not.toHaveBeenCalled();
});

test("rewrites the pages it is given", async () => {
	const pageIds = [crypto.randomUUID(), crypto.randomUUID()];
	const result = await post(JSON.stringify({ pageIds }));
	expect(await result.json()).toEqual({ rewritten: 2 });
	expect(rewrite).toHaveBeenCalledWith(pageIds);
});
