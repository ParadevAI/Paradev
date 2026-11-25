import { randomUUID } from "node:crypto";
import { z } from "zod";

const SESSION_HEADER = "mcp-session-id";

export function callerSessionId(req: Request): string | undefined {
	const id = req.headers.get(SESSION_HEADER);
	return id && z.uuid().safeParse(id).success ? id : undefined;
}

export function withIssuedSessionId(
	req: Request,
	response: Response,
): Response {
	if (req.method === "POST" && !req.headers.has(SESSION_HEADER)) {
		response.headers.set(SESSION_HEADER, randomUUID());
	}
	return response;
}
