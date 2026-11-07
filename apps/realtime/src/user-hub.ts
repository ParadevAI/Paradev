import type { ChannelRealtimeEvent } from "@superset/shared/channels";
import { Server } from "partyserver";
import type { RealtimeEnv } from "./types";

/**
 * One object per user. Holds that user's windows (hibernating) and forwards
 * the events the API addresses to them. The API decides who receives what,
 * so nothing here needs to know about channels or their members.
 */
export class UserHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	async publish(event: ChannelRealtimeEvent): Promise<void> {
		this.broadcast(JSON.stringify(event));
	}
}
