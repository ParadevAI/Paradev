import type { UserMessage } from "@superset/chat/protocol";

export type DrawerQueue = {
	prompts: UserMessage[];
	paused: boolean;
	actionable: boolean;
	remove: (itemId: string) => Promise<void>;
	resume: () => Promise<void>;
	steer: (itemId: string) => Promise<void>;
};

export type DrawerExit = "composer" | "history";

export type WorkDrawerHandle = {
	focusLast: (options?: { actionableOnly?: boolean }) => boolean;
};
