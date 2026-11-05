{{MARKER}}
// OpenCode V2 rejects the V1 server plugin, and its shared background server
// cannot tell Superset terminals apart. The TUI runs in the terminal itself,
// so it reports the root sessions this terminal shows while they run.
import { execFile } from "node:child_process";

const notifyPath = {{NOTIFY_PATH}};

export default {
  id: "superset-notify",
  setup(ctx) {
    if (!process.env.SUPERSET_TERMINAL_ID) return;

    const running = new Set();
    const finished = new Set();
    const owned = new Set();
    const blockers = new Map();
    let reported = "idle";
    let reportedSessionID = null;
    let lastSessionID = null;
    let failure = null;
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

    const rootOf = (sessionID) => ctx.data.session.root(sessionID) ?? sessionID;
    const isRoot = (sessionID) => !ctx.data.session.get(sessionID)?.parentID;

    const shownRootID = () => {
      const route = ctx.ui.router.current();
      return route?.type === "session" ? rootOf(route.sessionID) : null;
    };

    const primarySessionID = () => {
      const shown = shownRootID();
      if (shown && owned.has(shown)) return shown;
      return owned.values().next().value ?? lastSessionID;
    };

    const sync = () => {
      const blocked = [...owned].some((id) => blockers.get(id)?.size);
      const state = owned.size === 0 ? "idle" : blocked ? "blocked" : "working";
      const sessionID = primarySessionID();
      if (state === reported && (state === "idle" || sessionID === reportedSessionID)) return;
      if (state === "working") notify("Start", sessionID);
      if (state === "blocked") notify("PermissionRequest", sessionID);
      if (state === "idle") {
        notify(failure ? "Failed" : "Stop", sessionID, failure?.message);
        failure = null;
      }
      reported = state;
      reportedSessionID = sessionID;
    };

    const own = (rootID) => {
      owned.add(rootID);
      lastSessionID = rootID;
    };

    const reconcileShownRoot = () => {
      const shown = shownRootID();
      if (!shown || owned.has(shown)) return;
      const started =
        running.has(shown) ||
        (!finished.has(shown) && ctx.data.session.status(shown) === "running");
      if (started) {
        running.add(shown);
        own(shown);
        sync();
      }
    };

    const endTurn = (sessionID, outcome) => {
      running.delete(sessionID);
      finished.add(sessionID);
      if (!owned.delete(sessionID)) return;
      blockers.delete(sessionID);
      lastSessionID = sessionID;
      if (outcome) failure = outcome;
      sync();
    };

    const block = (sessionID, requestID) => {
      const rootID = rootOf(sessionID);
      if (!owned.has(rootID)) return;
      const ids = blockers.get(rootID) ?? new Set();
      ids.add(requestID);
      blockers.set(rootID, ids);
      sync();
    };

    const unblock = (sessionID, requestID) => {
      const ids = blockers.get(rootOf(sessionID));
      if (!ids?.delete(requestID)) return;
      sync();
    };

    const unsubscribers = [
      ctx.data.on("session.execution.started", ({ data }) => {
        if (!isRoot(data.sessionID)) return;
        running.add(data.sessionID);
        finished.delete(data.sessionID);
        if (data.sessionID === shownRootID()) own(data.sessionID);
        sync();
      }),
      ctx.data.on("session.execution.succeeded", ({ data }) => endTurn(data.sessionID)),
      ctx.data.on("session.execution.interrupted", ({ data }) => endTurn(data.sessionID)),
      ctx.data.on("session.execution.failed", ({ data }) =>
        endTurn(data.sessionID, { message: data.error?.message }),
      ),
      ctx.data.on("session.deleted", ({ data }) => endTurn(data.sessionID)),
      ctx.data.on("permission.asked", ({ data }) => block(data.sessionID, data.id)),
      ctx.data.on("permission.replied", ({ data }) => unblock(data.sessionID, data.requestID)),
      ctx.data.on("form.created", ({ data }) => block(data.form.sessionID, data.form.id)),
      ctx.data.on("form.replied", ({ data }) => unblock(data.sessionID, data.id)),
      ctx.data.on("form.cancelled", ({ data }) => unblock(data.sessionID, data.id)),
    ];
    const routePoll = setInterval(reconcileShownRoot, ctx.options?.routePollMs ?? 1000);
    routePoll.unref?.();
    reconcileShownRoot();

    return async () => {
      clearInterval(routePoll);
      for (const unsubscribe of unsubscribers) unsubscribe();
      await pending;
    };
  },
};
