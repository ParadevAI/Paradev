import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import { readKeepAwakeEnabled } from "../../../runtime/keep-awake";
import { machineOnlyProcedure, router } from "../../index";
import { getHostWorktreeBaseDir } from "./worktree-location";

const localPowerProcedure = machineOnlyProcedure.use(({ ctx, next }) => {
	if (ctx.isLocalCaller !== true) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Power settings can only be changed from this computer.",
		});
	}
	return next({ ctx });
});

export const powerRouter = router({
	get: localPowerProcedure.query(({ ctx }) => ({
		enabled: readKeepAwakeEnabled(ctx.db),
		supported: ctx.runtime.keepAwake?.supported === true,
	})),
	set: localPowerProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(({ ctx, input }) => {
			if (input.enabled && !ctx.runtime.keepAwake?.supported) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Keep-awake is not supported on this host.",
				});
			}
			getHostWorktreeBaseDir(ctx);
			ctx.db
				.update(hostSettings)
				.set({ keepAwakeWhileAgentsWork: input.enabled })
				.where(eq(hostSettings.id, 1))
				.run();
			ctx.runtime.keepAwake?.setEnabled(input.enabled);
			return { enabled: input.enabled };
		}),
});
