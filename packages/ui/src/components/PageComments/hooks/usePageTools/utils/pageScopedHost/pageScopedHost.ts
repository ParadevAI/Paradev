import type { PageToolHost } from "../runPageToolCall";

export interface PageToolHostBinding {
	host?: PageToolHost;
	pageId?: string;
}

export function pageScopedHost(
	read: () => PageToolHostBinding,
	pageId: string | undefined,
): PageToolHost {
	const live = () => {
		const binding = read();
		if (!binding.host || binding.pageId !== pageId) {
			throw new Error("Page tools are unavailable");
		}
		return binding.host;
	};
	return {
		callTool: (request) => live().callTool(request),
		grant: (input) => live().grant(input),
		install: (plugin) => live().install(plugin),
		openUrl: (url) => {
			const binding = read();
			if (binding.host && binding.pageId === pageId) binding.host.openUrl(url);
		},
	};
}
