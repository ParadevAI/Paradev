import { useEffect, useState } from "react";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "../../types";
import { matchesQuery } from "../useMentionSources";

/** One provider's results for a query and filters, as its submenu shows them. */
export function useProviderSearch(
	provider: ComposerMentionProvider,
	query: string,
	filters: ReadonlySet<string>,
): { entries: ComposerMentionEntry[]; isLoading: boolean } {
	const [entries, setEntries] = useState<ComposerMentionEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();
		const { source } = provider;
		setIsLoading(true);
		const pending =
			source.kind === "search"
				? source.search(query, controller.signal, { filters })
				: Promise.resolve(source.load(controller.signal)).then((loaded) =>
						loaded.filter((entry) => matchesQuery(entry, query)),
					);
		pending
			.then((next) => {
				if (controller.signal.aborted) return;
				setEntries(next);
				setIsLoading(false);
			})
			.catch(() => {
				if (controller.signal.aborted) return;
				setEntries([]);
				setIsLoading(false);
			});
		return () => controller.abort();
	}, [provider, query, filters]);

	return { entries, isLoading };
}
