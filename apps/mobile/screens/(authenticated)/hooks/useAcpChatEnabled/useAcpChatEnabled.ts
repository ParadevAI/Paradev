import { useSession } from "@/lib/auth/client";

export function useAcpChatEnabled(): boolean {
	const { data: session } = useSession();
	return session?.user.experimentalChat === true;
}
