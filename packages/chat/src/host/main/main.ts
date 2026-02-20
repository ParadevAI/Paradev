import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { ChatService } from "../chat-service";
import { createChatServiceRouter } from "../router";

const deviceId = process.env.DEVICE_ID ?? "docker";
const electricUrl = process.env.ELECTRIC_URL ?? "";
const apiUrl = process.env.API_URL ?? "";
const organizationId = process.env.ORGANIZATION_ID ?? "";
const authToken = process.env.AUTH_TOKEN ?? "";
const port = Number(process.env.PORT ?? "3001");

const service = new ChatService({ deviceId, electricUrl, apiUrl });

async function main() {
	await service.start({ organizationId, authToken });

	const router = createChatServiceRouter(service);

	Bun.serve({
		port,
		fetch: (req) =>
			fetchRequestHandler({
				router,
				req,
				endpoint: "/trpc",
			}),
	});

	console.log(`[chat-host] Listening on port ${port}`);
}

main().catch(console.error);
