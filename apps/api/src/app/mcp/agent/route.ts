import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCaller } from "@superset/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createContext } from "@/trpc/context";

const TURN_TOKEN_HEADER = "x-agent-turn-token";

type DevTools = ReturnType<typeof createCaller>["devTools"];

async function result(run: () => Promise<unknown>) {
	try {
		const value = await run();
		return {
			content: [{ type: "text" as const, text: JSON.stringify(value ?? null) }],
		};
	} catch (error) {
		const message =
			error instanceof TRPCError || error instanceof Error
				? error.message
				: String(error);
		return {
			isError: true,
			content: [{ type: "text" as const, text: message }],
		};
	}
}

/** The tools a Dev's main session uses, each acting under the caller's turn token. */
function devToolsServer(tools: DevTools): McpServer {
	const server = new McpServer({ name: "dev", version: "1.0.0" });
	server.registerTool(
		"reply",
		{
			description:
				"Post a message as yourself. `target` is the reply_to of the message you are answering (channel:<id> or channel:<id>/thread:<id>). Use it for every answer; people see nothing else you write.",
			inputSchema: { target: z.string(), body: z.string() },
		},
		(args) => result(() => tools.reply(args)),
	);
	server.registerTool(
		"list_work",
		{
			description:
				"The Paradev tasks you work on, newest first: taskId, slug (e.g. SUPER-12), title, status, pull request, a short summary of the latest report, and your sessions on each (writer or reviewer; queued, running, done, failed or stopped).",
			inputSchema: {},
		},
		() => result(() => tools.listWork()),
	);
	server.registerTool(
		"read_task",
		{
			description:
				"One task in full: its description, pull request, and each of your sessions on it with what it last reported.",
			inputSchema: { taskId: z.string() },
		},
		(args) => result(() => tools.readTask(args)),
	);
	server.registerTool(
		"start_task",
		{
			description:
				"Delegate work that needs code or a machine. It becomes a Paradev task that people can see, worked on by a session on its own box. Pass a title for new work, or the taskId of an existing task (one from list_work, or one someone assigned you) to work on that instead. role `writer` changes code and opens a pull request; `reviewer` reviews the pull request of an existing task (pass its taskId). A task has one writer at a time. Give complete instructions: the session knows only the task and what you write. It reports back to you when it finishes.",
			inputSchema: {
				taskId: z.string().optional(),
				title: z.string().optional(),
				instructions: z.string(),
				role: z.enum(["writer", "reviewer"]).optional(),
				environmentId: z.string().optional(),
			},
		},
		(args) => result(() => tools.startTask(args)),
	);
	server.registerTool(
		"message_task",
		{
			description:
				"Send more instructions to the task's latest writer session (or reviewer, with role), such as review feedback. It reports back again when done.",
			inputSchema: {
				taskId: z.string(),
				text: z.string(),
				role: z.enum(["writer", "reviewer"]).optional(),
			},
		},
		(args) => result(() => tools.messageTask(args)),
	);
	server.registerTool(
		"stop_task",
		{
			description:
				"Stop your sessions on a task that is no longer wanted. The task itself stays.",
			inputSchema: { taskId: z.string() },
		},
		(args) => result(() => tools.stopTask(args)),
	);
	server.registerTool(
		"remember",
		{
			description:
				"Keep a note for later, across all your conversations: a preference, a decision, a fact about the team.",
			inputSchema: { content: z.string() },
		},
		(args) => result(() => tools.remember(args)),
	);
	server.registerTool(
		"recall",
		{
			description: "Your notes, newest first; `query` filters by text.",
			inputSchema: { query: z.string().optional() },
		},
		(args) => result(() => tools.recall(args)),
	);
	server.registerTool(
		"list_environments",
		{
			description:
				"The environments (repositories) a task can run in, and which is your default.",
			inputSchema: {},
		},
		() => result(() => tools.listEnvironments()),
	);
	return server;
}

async function handle(req: Request): Promise<Response> {
	if (!req.headers.get(TURN_TOKEN_HEADER)) {
		return Response.json({ error: "No turn token." }, { status: 401 });
	}
	const context = await createContext({ req, resHeaders: new Headers() });
	const server = devToolsServer(createCaller(context).devTools);
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);
	return transport.handleRequest(req);
}

export const maxDuration = 300;

export { handle as GET, handle as POST, handle as DELETE };
