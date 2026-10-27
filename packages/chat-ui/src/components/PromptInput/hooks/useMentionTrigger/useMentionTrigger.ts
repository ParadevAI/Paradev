import { useCallback, useMemo, useState } from "react";
import type { ComposerMentionProvider } from "../../types";
import { matchToken } from "../../utils/matchToken";

const DEFAULT_TRIGGER = "@";

const triggerOf = (provider: ComposerMentionProvider) =>
	provider.trigger ?? DEFAULT_TRIGGER;

/**
 * Opens the mention menu on any provider's trigger character and narrows the
 * providers to that trigger's. Browsing with no typed trigger shows "@".
 */
export function useMentionTrigger(
	providers: ComposerMentionProvider[],
	mentionQuery: string | null,
) {
	const [trigger, setTrigger] = useState(DEFAULT_TRIGGER);
	const triggers = useMemo(
		() => [...new Set(providers.map(triggerOf))],
		[providers],
	);
	const matchTrigger = useCallback(
		(text: string) => {
			for (const candidate of triggers) {
				const match = matchToken(text, candidate);
				if (match) {
					setTrigger(candidate);
					return match;
				}
			}
			return null;
		},
		[triggers],
	);
	const active = mentionQuery == null ? DEFAULT_TRIGGER : trigger;
	const activeProviders = useMemo(
		() => providers.filter((provider) => triggerOf(provider) === active),
		[providers, active],
	);
	return { matchTrigger, activeProviders };
}
