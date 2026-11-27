import type { DesktopWindow } from "@superset/shared/desktop-windows";
import { TRPCError } from "@trpc/server";
import {
	bridgeErrorDetail,
	bridgeFetch,
} from "../../../runtime/browser-bridge/bridge-fetch";
import type { HostServiceContext } from "../../../types";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";

async function listDesktopWindows(
	ctx: HostServiceContext,
): Promise<DesktopWindow[]> {
	if (!ctx.browserBridge) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "No desktop app is attached to this host.",
		});
	}
	const res = await bridgeFetch(
		ctx.browserBridge,
		"GET",
		"/windows",
		undefined,
		"Desktop app",
	);
	if (res.ok) return (res.body as { windows: DesktopWindow[] }).windows;
	const detail = bridgeErrorDetail(res.body);
	if (res.status === 404 && !detail) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The desktop app on this host is too old to list its windows. Update it and try again.",
		});
	}
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: detail ?? `Desktop app error (${res.status})`,
	});
}

export const windowsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const windows = await listDesktopWindows(ctx);
		return {
			windows: windows.map((window) => ({
				...window,
				workspaceName: window.workspaceId
					? (getLocalWorkspace(ctx.db, window.workspaceId)?.name ?? null)
					: null,
			})),
		};
	}),
});
