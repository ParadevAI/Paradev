import type { HostDb } from "../../db";
import { hostSettings } from "../../db/schema";
import type { EventBus } from "../../events";
import { getDaemonClient } from "../../terminal/daemon-client-singleton";
import type { TerminalAgentStore } from "../../terminal-agents";
import { createKeepAwakeController } from "./controller";
import {
	isKeepAwakeSupported,
	readMacPower,
	startMacKeepAwakeLease,
} from "./macos";
import { bindingNeedsKeepAwake } from "./policy";

export type { KeepAwakeController } from "./controller";

export function readKeepAwakeEnabled(db: HostDb): boolean {
	return (
		db
			.select({ enabled: hostSettings.keepAwakeWhileAgentsWork })
			.from(hostSettings)
			.get()?.enabled ?? false
	);
}

export function startHostKeepAwake(args: {
	db: HostDb;
	store: TerminalAgentStore;
	eventBus: EventBus;
}) {
	const working = () => args.store.list().filter(bindingNeedsKeepAwake);
	return createKeepAwakeController({
		supported: isKeepAwakeSupported(),
		enabled: readKeepAwakeEnabled(args.db),
		hasWork: () => working().length > 0,
		confirmWork: async (signal) => {
			if (working().some((binding) => binding.chatSessionId)) return true;
			const daemon = await getDaemonClient();
			if (signal.aborted) return false;
			const sessions = await daemon.list();
			const liveIds = new Set(
				sessions
					.filter((session) => session.alive)
					.map((session) => session.id),
			);
			return working().some(
				(binding) => binding.chatSessionId || liveIds.has(binding.terminalId),
			);
		},
		readPower: readMacPower,
		startLease: startMacKeepAwakeLease,
		subscribe: (listener) => {
			args.store.on("change", listener);
			const unsubscribe = args.eventBus.onTerminalLifecycle(listener);
			return () => {
				args.store.off("change", listener);
				unsubscribe();
			};
		},
	});
}
