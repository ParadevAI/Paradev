import type { PageToolCallRequest } from "@superset/shared/page-tools";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export function readToolCall(
	data: unknown,
): { id: string; request: PageToolCallRequest | null } | null {
	if (!isRecord(data) || typeof data.id !== "string") return null;
	const request = data.request;
	if (
		!isRecord(request) ||
		typeof request.plugin !== "string" ||
		typeof request.tool !== "string" ||
		!isRecord(request.args)
	) {
		return { id: data.id, request: null };
	}
	return {
		id: data.id,
		request: { plugin: request.plugin, tool: request.tool, args: request.args },
	};
}
