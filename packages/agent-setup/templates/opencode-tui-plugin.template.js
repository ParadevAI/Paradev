{{MARKER}}
// OpenCode V2 rejects the V1 server plugin, and its shared background server
// cannot tell Superset terminals apart. The TUI runs in the terminal itself,
// so it reports the lifecycle of the root session it shows.
import { execFile } from "node:child_process";

const notifyPath = "{{NOTIFY_PATH}}";

export default {
  id: "superset-notify",
  setup(ctx) {
    if (!process.env.SUPERSET_TERMINAL_ID) return;

    let trackedSessionID = null;
    let busy = false;
    let pending = Promise.resolve();

    const notify = (hookEventName, sessionID, message) => {
      const payload = JSON.stringify({
        hook_event_name: hookEventName,
        session_id: sessionID,
        ...(typeof message === "string" && message.trim()
          ? { message: message.slice(0, 4000) }
          : {}),
      });
      pending = pending.then(
        () =>
          new Promise((resolve) => {
            execFile(
              "bash",
              [notifyPath, payload],
              { env: { ...process.env, SUPERSET_HOOK_HARNESS: "opencode" } },
              () => resolve(),
            );
          }),
      );
    };

    const isRoot = (sessionID) => !ctx.data.session.get(sessionID)?.parentID;

    const shownRootSessionID = () => {
      const route = ctx.ui.router.current();
      if (route?.type !== "session") return null;
      return ctx.data.session.root(route.sessionID) ?? route.sessionID;
    };

    const ownsSession = (sessionID) =>
      sessionID === trackedSessionID || sessionID === shownRootSessionID();

    const onBusy = (sessionID) => {
      if (sessionID !== trackedSessionID) {
        if (busy || sessionID !== shownRootSessionID()) return;
        trackedSessionID = sessionID;
      }
      if (busy) return;
      busy = true;
      notify("Start", sessionID);
    };

    const onStop = (sessionID, hookEventName, message) => {
      if (sessionID !== trackedSessionID || !busy) return;
      busy = false;
      notify(hookEventName, sessionID, message);
    };

    const unsubscribers = [
      ctx.data.on("session.execution.started", (event) => {
        if (isRoot(event.data.sessionID)) onBusy(event.data.sessionID);
      }),
      ctx.data.on("session.execution.succeeded", (event) => {
        onStop(event.data.sessionID, "Stop");
      }),
      ctx.data.on("session.execution.interrupted", (event) => {
        onStop(event.data.sessionID, "Stop");
      }),
      ctx.data.on("session.execution.failed", (event) => {
        const { sessionID, error } = event.data;
        onStop(sessionID, "Failed", error?.message);
      }),
      ctx.data.on("permission.asked", (event) => {
        const { sessionID } = event.data;
        if (isRoot(sessionID) && ownsSession(sessionID)) {
          notify("PermissionRequest", sessionID);
        }
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  },
};
