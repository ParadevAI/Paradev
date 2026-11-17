import {
	type ApiTaskActivity,
	type SyncSignal,
	type TaskActions,
	watchTaskActivity,
} from "@superset/chats-sync";
import { useEffect, useRef, useState } from "react";

/** A task's timeline while it is open: loaded once, then kept current from the chat's events. */
export function useTaskActivity(
	taskId: string,
	actions: Pick<TaskActions, "activity">,
	subscribe: (listener: (signal: SyncSignal) => void) => () => void,
) {
	const [view, setView] = useState<{
		activity: ApiTaskActivity[];
		loaded: boolean;
	}>({ activity: [], loaded: false });
	const watch = useRef<ReturnType<typeof watchTaskActivity> | null>(null);
	useEffect(() => {
		setView({ activity: [], loaded: false });
		const started = watchTaskActivity(
			taskId,
			actions,
			subscribe,
			(activity, loaded) => setView({ activity, loaded }),
		);
		watch.current = started;
		return () => {
			started.stop();
			watch.current = null;
		};
	}, [taskId, actions, subscribe]);
	return {
		...view,
		add: (entry: ApiTaskActivity) => watch.current?.add(entry),
	};
}
