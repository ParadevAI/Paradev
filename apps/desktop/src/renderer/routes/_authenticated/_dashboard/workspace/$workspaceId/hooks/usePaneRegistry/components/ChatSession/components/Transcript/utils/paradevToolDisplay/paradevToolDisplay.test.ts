import { expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import {
	PARADEV_TOOL_LABELS,
	paradevToolChips,
	paradevToolLabel,
} from "./paradevToolDisplay";

function call(server: string, tool: string, patch: Partial<ToolCall> = {}) {
	return {
		id: "call",
		kind: "tool_call",
		startedAtMs: 0,
		title: `mcp__${server}__${tool}`,
		toolKind: "other",
		toolName: `mcp__${server}__${tool}`,
		status: "completed",
		content: [],
		mcpServer: { name: server, tool },
		...patch,
	} satisfies ToolCall;
}

const MCP_TOOLS_DIR = `${import.meta.dir.slice(
	0,
	import.meta.dir.lastIndexOf("/apps/desktop/"),
)}/packages/mcp/src/tools`;

async function registeredToolNames(): Promise<string[]> {
	const names: string[] = [];
	const files = new Bun.Glob("**/*.ts").scan(MCP_TOOLS_DIR);
	for await (const file of files) {
		if (file.endsWith(".test.ts")) continue;
		const source = await Bun.file(`${MCP_TOOLS_DIR}/${file}`).text();
		for (const match of source.matchAll(
			/defineTool\(server, \{\s*name: "([a-z_]+)"/g,
		)) {
			names.push(match[1] as string);
		}
	}
	return names;
}

test("every registered Paradev tool has a label", async () => {
	const names = await registeredToolNames();
	expect(names.length).toBeGreaterThanOrEqual(45);
	const missing = names.filter(
		(name) => !Object.hasOwn(PARADEV_TOOL_LABELS, name),
	);
	expect(missing).toEqual([]);
});

test("a Paradev tool reads as its action under either server key", () => {
	expect(paradevToolLabel(call("superset", "tasks_list"))?.message).toBe(
		"Listed tasks",
	);
	expect(
		paradevToolLabel(call("paradev", "tasks_list", { status: "running" }))
			?.message,
	).toBe("Listing tasks");
});

test("another server or an unknown tool keeps no label", () => {
	expect(paradevToolLabel(call("github", "tasks_list"))).toBeNull();
	expect(paradevToolLabel(call("superset", "toString"))).toBeNull();
});

test("a created task, workspace or page shows a chip from its result", () => {
	expect(
		paradevToolChips(
			call("superset", "tasks_create", {
				rawOutput: { structuredContent: { task: { title: "Fix login" } } },
			}),
		),
	).toEqual([{ kind: "task", label: "Fix login" }]);
	expect(
		paradevToolChips(
			call("paradev", "workspaces_create", {
				content: [
					{
						type: "text",
						text: JSON.stringify({ workspace: { name: "login-fix" } }),
					},
				],
			}),
		),
	).toEqual([{ kind: "workspace", label: "login-fix" }]);
	expect(
		paradevToolChips(
			call("superset", "pages_publish", {
				rawOutput: { structuredContent: { title: "Report" } },
			}),
		),
	).toEqual([{ kind: "page", label: "Report" }]);
});

test("a failed call or an unexpected result shows no chip", () => {
	const created = {
		rawOutput: { structuredContent: { task: { title: "A" } } },
	};
	expect(
		paradevToolChips(
			call("superset", "tasks_create", { ...created, status: "failed" }),
		),
	).toEqual([]);
	expect(
		paradevToolChips(
			call("superset", "tasks_create", {
				content: [{ type: "text", text: "not json" }],
			}),
		),
	).toEqual([]);
});
