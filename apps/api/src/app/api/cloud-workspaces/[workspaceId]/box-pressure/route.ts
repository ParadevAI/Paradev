import { parseBoxPressure } from "@superset/shared/box-pressure";
import { reportSandboxBoxPressure } from "@superset/trpc/lib/sandbox";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
	const { workspaceId } = await params;
	const presented = request.headers
		.get("authorization")
		?.replace(/^Bearer\s+/i, "");
	if (!presented || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const body = (await request.json().catch(() => undefined)) as
		| { pressure?: unknown }
		| undefined;
	const pressure =
		body?.pressure === null ? null : parseBoxPressure(body?.pressure);
	if (body?.pressure !== null && !pressure) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	const outcome = await reportSandboxBoxPressure({
		workspaceId,
		presentedSecret: presented,
		pressure,
	});
	if (outcome === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (outcome === "unknown") {
		return Response.json({ error: "unknown workspace" }, { status: 404 });
	}
	return Response.json({ ok: true });
}
