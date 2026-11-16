import { chatsBoxRoute } from "@superset/trpc/chats-box";

// A model call streams for as long as the model answers.
export const maxDuration = 300;

export { chatsBoxRoute as POST };
