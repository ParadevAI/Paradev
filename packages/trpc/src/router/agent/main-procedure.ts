import { db } from "@superset/db/client";
import { agentSessions } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { agentProcedure } from "../../trpc";

/** Only a Dev's main session delegates and speaks; its tasks report back instead. */
export const mainProcedure = agentProcedure.use(async ({ ctx, next }) => {
	const [session] = await db
		.select({ kind: agentSessions.kind })
		.from(agentSessions)
		.where(eq(agentSessions.id, ctx.agentTurn.sessionId))
		.limit(1);
	if (session?.kind !== "main") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only a Dev's main session can use this tool.",
		});
	}
	return next();
});
