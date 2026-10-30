import { authClient } from "../client";
import type { SessionFetch, SessionHeaders } from "./sessionTransport.types";

export const sessionHeaders: SessionHeaders = () => {
	const cookie = authClient.getCookie();
	return cookie ? { Cookie: cookie } : {};
};

export const sessionFetch: SessionFetch = (input, init) => fetch(input, init);
