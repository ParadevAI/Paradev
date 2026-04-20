import { appRouter } from "@superset/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/trpc/context";

// Some procedures (automation.runNow → dispatchAutomation) do a workspace
// create over the relay which can take 30-60s for large repos. The default
// Vercel function timeout is too tight.
export const maxDuration = 60;

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext,
		onError: ({ path, error }) => {
			console.error(`❌ tRPC error on ${path ?? "<no-path>"}:`, error);
		},
	});

export { handler as GET, handler as POST };
