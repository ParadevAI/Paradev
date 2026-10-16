import { serveGmailFile } from "@superset/trpc/inbox-gmail-files";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	return serveGmailFile(token);
}
