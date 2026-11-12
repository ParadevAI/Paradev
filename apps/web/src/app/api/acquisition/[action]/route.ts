import { auth } from "@superset/auth/server";
import { acquisitionHttp, captureAcquisition } from "@/lib/acquisition-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
	request: Request,
	{ params }: { params: Promise<{ action: string }> },
) {
	const { action } = await params;
	if (action !== "bind") return acquisitionHttp.web(request, action);
	const session = await auth.api.getSession({ headers: request.headers });
	return acquisitionHttp.bind(
		request,
		session?.user.id ?? null,
		captureAcquisition,
	);
}
export { handle as GET, handle as POST };
