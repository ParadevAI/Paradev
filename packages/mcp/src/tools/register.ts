import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { McpCallerKind, McpContext } from "../auth";
import type { McpToolCallEmitter, ToolDef } from "../define-tool";
import * as agentsCreate from "./agents/create";
import * as agentsList from "./agents/list";
import * as automationsCreate from "./automations/create";
import * as automationsDelete from "./automations/delete";
import * as automationsGet from "./automations/get";
import * as automationsGetPrompt from "./automations/get_prompt";
import * as automationsList from "./automations/list";
import * as automationsLogs from "./automations/logs";
import * as automationsPause from "./automations/pause";
import * as automationsResume from "./automations/resume";
import * as automationsRun from "./automations/run";
import * as automationsSetPrompt from "./automations/set_prompt";
import * as automationsTriggerOptions from "./automations/trigger_options";
import * as automationsUpdate from "./automations/update";
import * as devsChannelTasks from "./devs/channel_tasks";
import * as devsListEnvironments from "./devs/list_environments";
import * as devsListWork from "./devs/list_work";
import * as devsMessageTask from "./devs/message_task";
import * as devsReadChannel from "./devs/read_channel";
import * as devsReadTask from "./devs/read_task";
import * as devsRecall from "./devs/recall";
import * as devsRemember from "./devs/remember";
import * as devsReply from "./devs/reply";
import * as devsRoutineUpdate from "./devs/routine_update";
import * as devsStartTask from "./devs/start_task";
import * as devsStopTask from "./devs/stop_task";
import * as hostsList from "./hosts/list";
import * as organizationMembersList from "./organization/members/list";
import * as pagesCommentsList from "./pages/comments/list";
import * as pagesCommentsReply from "./pages/comments/reply";
import * as pagesCommentsResolve from "./pages/comments/resolve";
import * as pagesGet from "./pages/get";
import * as pagesList from "./pages/list";
import * as pagesPublish from "./pages/publish";
import * as pagesPull from "./pages/pull";
import * as pagesStorage from "./pages/storage";
import * as pagesVersions from "./pages/versions";
import * as projectsList from "./projects/list";
import * as tasksCreate from "./tasks/create";
import * as tasksDelete from "./tasks/delete";
import * as tasksGet from "./tasks/get";
import * as tasksList from "./tasks/list";
import * as tasksStatusesList from "./tasks/statuses/list";
import * as tasksUpdate from "./tasks/update";
import * as terminalsClose from "./terminals/close";
import * as terminalsCreate from "./terminals/create";
import * as terminalsList from "./terminals/list";
import * as terminalsRead from "./terminals/read";
import * as terminalsSend from "./terminals/send";
import * as workspacesCreate from "./workspaces/create";
import * as workspacesDelete from "./workspaces/delete";
import * as workspacesList from "./workspaces/list";
import * as workspacesUpdate from "./workspaces/update";

const TOOLS: ToolDef[] = [
	tasksList.tool,
	tasksGet.tool,
	tasksCreate.tool,
	tasksUpdate.tool,
	tasksDelete.tool,
	tasksStatusesList.tool,
	organizationMembersList.tool,
	automationsList.tool,
	automationsGet.tool,
	automationsGetPrompt.tool,
	automationsCreate.tool,
	automationsUpdate.tool,
	automationsSetPrompt.tool,
	automationsDelete.tool,
	automationsPause.tool,
	automationsResume.tool,
	automationsTriggerOptions.tool,
	automationsRun.tool,
	automationsLogs.tool,
	workspacesList.tool,
	workspacesCreate.tool,
	workspacesUpdate.tool,
	workspacesDelete.tool,
	agentsCreate.tool,
	agentsList.tool,
	terminalsCreate.tool,
	terminalsList.tool,
	terminalsSend.tool,
	terminalsRead.tool,
	terminalsClose.tool,
	pagesList.tool,
	pagesGet.tool,
	pagesVersions.tool,
	pagesPull.tool,
	pagesStorage.getStorageTool,
	pagesStorage.setStorageTool,
	pagesStorage.removeStorageTool,
	pagesPublish.tool,
	pagesCommentsList.tool,
	pagesCommentsReply.tool,
	pagesCommentsResolve.tool,
	projectsList.tool,
	hostsList.tool,
	devsReply.tool,
	devsListWork.tool,
	devsReadTask.tool,
	devsStartTask.tool,
	devsMessageTask.tool,
	devsStopTask.tool,
	devsRemember.tool,
	devsRecall.tool,
	devsListEnvironments.tool,
	devsReadChannel.tool,
	devsChannelTasks.tool,
	devsRoutineUpdate.tool,
];

export function toolsFor(kind: McpCallerKind): ToolDef[] {
	return TOOLS.filter((tool) => (tool.callers ?? ["person"]).includes(kind));
}

export interface RegisterToolsOptions {
	kind: McpCallerKind;
	/** Null serves the tool list only: every call is refused. */
	context: McpContext | null;
	onToolCall?: McpToolCallEmitter;
}

export function registerTools(
	server: McpServer,
	{ kind, context, onToolCall }: RegisterToolsOptions,
): void {
	for (const tool of toolsFor(kind)) {
		server.registerTool(
			tool.name,
			{
				description: descriptionFor(tool, kind),
				...(tool.annotations ? { annotations: tool.annotations } : {}),
				inputSchema: asObject(tool.inputSchema),
				...(tool.outputSchema
					? { outputSchema: asObject(tool.outputSchema) }
					: {}),
			},
			async (input: unknown) => {
				if (!context) return errorResult("Unauthorized");
				return callTool(tool, input, context, onToolCall);
			},
		);
	}
}

function descriptionFor(tool: ToolDef, kind: McpCallerKind): string {
	const text =
		typeof tool.description === "string"
			? tool.description
			: tool.description[kind];
	if (!text) throw new Error(`${tool.name} has no description for ${kind}`);
	return text;
}

function asObject(schema: ToolDef["inputSchema"]): z.ZodObject {
	if (schema instanceof z.ZodObject) return schema;
	return z.object(schema ?? {});
}

async function callTool(
	tool: ToolDef,
	input: unknown,
	context: McpContext,
	onToolCall: McpToolCallEmitter | undefined,
): Promise<CallToolResult> {
	const startedAt = Date.now();
	const report = (success: boolean, errorMessage?: string) => {
		try {
			onToolCall?.({
				toolName: tool.name,
				callerKind: context.kind,
				userId:
					context.kind === "dev" ? context.principal.askerId : context.userId,
				agentId: context.kind === "dev" ? context.principal.agentId : null,
				organizationId:
					context.kind === "dev"
						? context.principal.organizationId
						: context.organizationId,
				source: context.source,
				clientLabel: context.clientLabel,
				durationMs: Date.now() - startedAt,
				success,
				...(errorMessage ? { errorMessage: errorMessage.slice(0, 500) } : {}),
			});
		} catch (error) {
			console.error("[mcp] tool-call emitter threw:", error);
		}
	};
	try {
		const result = await tool.handler(input as never, context as never);
		report(true);
		return successResult(result, context.kind);
	} catch (error) {
		const message = describeError(error);
		report(false, message);
		return errorResult(message);
	}
}

function errorResult(message: string): CallToolResult {
	return { isError: true, content: [{ type: "text", text: message }] };
}

function successResult(data: unknown, kind: McpCallerKind): CallToolResult {
	const value = data ?? null;
	return {
		structuredContent:
			value && typeof value === "object" && !Array.isArray(value)
				? (value as Record<string, unknown>)
				: { result: value },
		content: [
			{
				type: "text",
				text:
					kind === "dev"
						? JSON.stringify(value)
						: JSON.stringify(value, null, 2),
			},
		],
	};
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
