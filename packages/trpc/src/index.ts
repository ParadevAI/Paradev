// Root router and types

export { TURN_TOKEN_HEADER } from "./lib/agent-turn/turn-token";
export type { DevPrincipal } from "./principal";
export type { AppRouter, RouterInputs, RouterOutputs } from "./root";
export { appRouter, createCaller } from "./root"; // tRPC utilities
export type { AgentCaller, TRPCContext } from "./trpc";
export {
	adminProcedure,
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	devFromTurnToken,
	personProcedure,
	publicProcedure,
} from "./trpc";
