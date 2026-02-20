import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/chat/host";
import { env } from "main/env.main";
import { getHashedDeviceId } from "main/lib/device-info";

const service = new ChatService({
	deviceId: getHashedDeviceId(),
	apiUrl: env.NEXT_PUBLIC_API_URL,
});

export const createChatServiceRouter = () => buildRouter(service);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
