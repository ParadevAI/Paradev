import { serveSlackFile } from "@superset/trpc/inbox-slack-files";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	return serveSlackFile(token);
}
