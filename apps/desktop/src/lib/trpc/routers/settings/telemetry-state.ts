import { EventEmitter } from "node:events";
import { observable } from "@trpc/server/observable";

export interface TelemetryState {
	enabled: boolean;
	doNotTrack: boolean;
}

export function createTelemetryStateChannel(read: () => TelemetryState) {
	const events = new EventEmitter();
	return {
		read,
		publish() {
			events.emit("change", read());
		},
		observe() {
			return observable<TelemetryState>((emit) => {
				const notify = (state: TelemetryState) => emit.next(state);
				events.on("change", notify);
				notify(read());
				return () => {
					events.off("change", notify);
				};
			});
		},
	};
}
