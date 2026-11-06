import type { ReactElement } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];
const HTML_REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];
const TEXT_REHYPE_PLUGINS = [rehypeSanitize];

export const MARKDOWN_CACHE_LIMITS = {
	entries: 64,
	contentLength: 100_000,
	totalContentLength: 500_000,
};

const cache = new Map<string, { element: ReactElement; length: number }>();
let cachedContentLength = 0;
const componentIds = new WeakMap<Partial<Components>, number>();
let nextComponentId = 0;

function componentId(components: Partial<Components>): number {
	let id = componentIds.get(components);
	if (id === undefined) {
		id = nextComponentId++;
		componentIds.set(components, id);
	}
	return id;
}

/**
 * Parsed markdown as React elements, cached by content so a remount or a
 * re-render does not parse the same text again. `components` must be stable.
 */
export function renderMarkdown({
	content,
	allowHtml,
	components,
}: {
	content: string;
	allowHtml: boolean;
	components: Partial<Components>;
}): ReactElement {
	const key = `${componentId(components)}:${allowHtml ? 1 : 0}:${content}`;
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit.element;
	}

	const element = Markdown({
		children: content,
		remarkPlugins: REMARK_PLUGINS,
		rehypePlugins: allowHtml ? HTML_REHYPE_PLUGINS : TEXT_REHYPE_PLUGINS,
		components,
	});
	if (content.length > MARKDOWN_CACHE_LIMITS.contentLength) return element;

	cache.set(key, { element, length: content.length });
	cachedContentLength += content.length;
	for (const [oldestKey, oldest] of cache) {
		if (
			cache.size <= MARKDOWN_CACHE_LIMITS.entries &&
			cachedContentLength <= MARKDOWN_CACHE_LIMITS.totalContentLength
		) {
			break;
		}
		cache.delete(oldestKey);
		cachedContentLength -= oldest.length;
	}
	return element;
}

export function markdownCacheSize(): number {
	return cache.size;
}
