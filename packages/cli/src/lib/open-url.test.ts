import { expect, test } from "bun:test";
import { env } from "./env";
import { workspaceLinks } from "./open-url";

test("workspaceLinks gives the deep link and the web handoff link on SUPERSET_WEB_URL", () => {
	const id = "b502bf30-8693-4815-be65-795035e0ce5f";
	const { url, webUrl } = workspaceLinks(id);
	expect(url).toBe(`superset://v2-workspace/${id}`);
	const web = new URL(webUrl);
	expect(web.origin).toBe(new URL(env.SUPERSET_WEB_URL).origin);
	expect(web.pathname).toBe(`/workspaces/${id}`);
});
