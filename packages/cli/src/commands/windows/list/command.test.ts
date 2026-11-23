import { describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

const base = { visible: true, lastFocused: false, focused: false };
const list = mock(async () => ({
	windows: [
		{ ...base, id: 1, view: "other", workspaceId: null, route: "/tasks" },
		{
			...base,
			id: 2,
			focused: true,
			lastFocused: true,
			view: "workspace",
			workspaceId: "ws-1",
			workspaceName: "fix-login",
			route: "/v2-workspace/ws-1",
		},
	],
}));
withLocalHostService("org-1", { "windows.list": list as never });

describe("windows list", () => {
	test("puts the focused window and its workspace first", async () => {
		const rows = (await command.run({
			ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
			args: {} as never,
			options: {} as never,
			signal: new AbortController().signal,
		})) as { id: number; state: string; workspaceName?: string }[];
		expect(rows.map((row) => [row.id, row.state, row.workspaceName])).toEqual([
			[2, "focused", "fix-login"],
			[1, "open", undefined],
		]);
	});
});
