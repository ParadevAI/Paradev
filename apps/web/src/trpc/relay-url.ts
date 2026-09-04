import { env } from "../env";

// Relay base URL for host-service HTTP + WebSocket access.
export function getRelayUrl(): string {
	return env.NEXT_PUBLIC_RELAY_URL;
}
