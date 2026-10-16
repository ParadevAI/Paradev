import { serveEmailImage } from "@superset/trpc/inbox-email-images";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	return serveEmailImage(token);
}
