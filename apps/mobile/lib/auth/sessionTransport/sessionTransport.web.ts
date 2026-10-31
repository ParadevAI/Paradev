import type { SessionFetch, SessionHeaders } from "./sessionTransport.types";

// The browser keeps the session cookie and sends it itself.
export const sessionHeaders: SessionHeaders = () => ({});

export const sessionFetch: SessionFetch = (input, init) =>
	fetch(input, { ...init, credentials: "include" });
