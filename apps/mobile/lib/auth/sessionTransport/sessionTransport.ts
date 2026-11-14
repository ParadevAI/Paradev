import { authClient } from "../client";
import type { SessionFetch, SessionHeaders } from "./sessionTransport.types";

export const sessionHeaders: SessionHeaders = () => {
	const cookie = authClient.getCookie();
	const headers: Record<string, string> = {};
	if (cookie) headers.Cookie = cookie;
	return headers;
};

export const sessionFetch: SessionFetch = (input, init) => fetch(input, init);
