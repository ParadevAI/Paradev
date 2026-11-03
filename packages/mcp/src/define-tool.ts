import type { ToolAnnotations } from "@modelcontextprotocol/server";
import type { ZodRawShape, z } from "zod";
import type { McpCallerKind, McpContext } from "./auth";

/**
 * A tool's input may be declared either as a raw shape — the common case, one
 * entry per argument — or as a whole `ZodObject`. Use the object form when the
 * tool needs a cross-field rule: a raw shape has nowhere to hang a `.refine()`,
 * so a constraint like "exactly one of id or slug" would otherwise go
 * undeclared and surface only as a runtime error on a call the model thought
 * was well-formed.
 *
 * Refinements aren't expressible in JSON Schema and are simply absent from
 * the listing — state the rule in `description` as well.
 */
export type ToolInput = ZodRawShape | z.ZodObject;

export type ToolInputOf<Input extends ToolInput> = Input extends z.ZodType
	? z.output<Input>
	: Input extends ZodRawShape
		? z.output<z.ZodObject<Input>>
		: never;

export interface ToolDef<
	Input extends ToolInput = ToolInput,
	Output extends ZodRawShape = ZodRawShape,
	Caller extends McpCallerKind = McpCallerKind,
> {
	name: string;
	/** One text for every caller, or one per caller. */
	description: string | Partial<Record<NoInfer<Caller>, string>>;
	/** Who sees and may call the tool. People only, when left out. */
	callers?: readonly Caller[];
	annotations?: ToolAnnotations;
	inputSchema?: Input;
	outputSchema?: Output;
	handler(
		input: ToolInputOf<Input>,
		ctx: Extract<McpContext, { kind: Caller }>,
	): Promise<unknown>;
}

export function defineTool<
	Input extends ToolInput,
	Output extends ZodRawShape = ZodRawShape,
	Caller extends McpCallerKind = "person",
>(def: ToolDef<Input, Output, Caller>): ToolDef<Input, Output, Caller> {
	return def;
}

export interface McpToolCallEvent {
	toolName: string;
	callerKind: McpCallerKind;
	/** The person, or for a Dev the person it is working for. */
	userId: string;
	agentId: string | null;
	organizationId: string;
	source: McpContext["source"];
	clientLabel: string | null;
	durationMs: number;
	success: boolean;
	errorMessage?: string;
}

export type McpToolCallEmitter = (event: McpToolCallEvent) => void;
