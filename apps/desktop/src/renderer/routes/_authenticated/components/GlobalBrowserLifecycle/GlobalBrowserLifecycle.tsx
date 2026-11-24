import { useAgentBrowserReveal } from "./hooks/useAgentBrowserReveal";
import { useBrowserOpenRequests } from "./hooks/useBrowserOpenRequests";
import { useGlobalBrowserLifecycle } from "./hooks/useGlobalBrowserLifecycle";

export function GlobalBrowserLifecycle() {
	useGlobalBrowserLifecycle();
	useBrowserOpenRequests();
	useAgentBrowserReveal();
	return null;
}
