const EXTENSION_ORIGIN = "chrome-extension://";
// Both reach the renderer's whole JS heap, which extension content scripts
// share with the page: a pause inside one, or a heap snapshot.
const REFUSED_DOMAINS = new Set(["Debugger", "HeapProfiler"]);

interface ContextParams {
	contextId?: unknown;
	executionContextId?: unknown;
	uniqueContextId?: unknown;
	context?: { id?: unknown; uniqueId?: unknown; origin?: unknown };
	exceptionDetails?: { executionContextId?: unknown };
}

/**
 * Hides extension content-script worlds from an agent's CDP session. A content
 * script can message its extension, so a password manager's world must stay
 * out of an agent's reach. A command may name only a context this session saw
 * created outside an extension: context ids are small numbers an agent could
 * otherwise guess without ever enabling Runtime.
 */
export function createExtensionWorldFilter() {
	const hidden = new Set<unknown>();
	const visible = new Set<unknown>();
	const isHidden = (id: unknown) => id !== undefined && hidden.has(id);
	const isUnknown = (id: unknown) => id !== undefined && !visible.has(id);

	return {
		shows(method: string, params: unknown): boolean {
			const p = (params ?? {}) as ContextParams;
			if (method === "Runtime.executionContextCreated") {
				const { id, uniqueId, origin } = p.context ?? {};
				if (
					typeof origin !== "string" ||
					!origin.startsWith(EXTENSION_ORIGIN)
				) {
					visible.add(id);
					visible.add(uniqueId);
					return true;
				}
				hidden.add(id);
				hidden.add(uniqueId);
				return false;
			}
			return (
				!isHidden(p.executionContextId) &&
				!isHidden(p.exceptionDetails?.executionContextId)
			);
		},
		refusal(method: string, params: unknown): string | null {
			if (REFUSED_DOMAINS.has(method.split(".")[0] as string)) {
				return `${method} is not available in a browser pane`;
			}
			const p = (params ?? {}) as ContextParams;
			const named = [p.contextId, p.executionContextId, p.uniqueContextId];
			if (named.some(isHidden)) {
				return "That execution context belongs to a browser extension";
			}
			return named.some(isUnknown)
				? "Unknown execution context. Enable Runtime and use an id from Runtime.executionContextCreated"
				: null;
		},
	};
}
