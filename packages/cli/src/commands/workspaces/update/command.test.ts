import { describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

let hostHasWorktreePath = true;
const update = mock(async (input: Record<string, unknown>) =>
	hostHasWorktreePath
		? { id: input.id, worktreePath: input.worktreePath }
		: { id: input.id },
);

withLocalHostService("org-1", { "workspace.update": update as never });

function invoke(worktreePath: string) {
	return command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: { id: "ws-1" } as never,
		options: { local: true, worktreePath } as never,
		signal: new AbortController().signal,
	});
}

describe("workspaces update --worktree-path", () => {
	test("sends a relative path resolved against this machine's cwd", async () => {
		hostHasWorktreePath = true;
		await invoke("moved/feature");
		expect(update).toHaveBeenLastCalledWith({
			id: "ws-1",
			worktreePath: resolve("moved/feature"),
		});
	});

	test("names an old host that ignored the path", async () => {
		hostHasWorktreePath = false;
		await expect(invoke("/repo/moved/feature")).rejects.toThrow(
			"This host is too old for --worktree-path",
		);
	});
});
