import { authClient } from "renderer/lib/auth-client";

export function useAcpChatEnabled(): boolean {
	const { data: session } = authClient.useSession();
	return session?.user.experimentalChat === true;
}
