import type { RegisteredCard } from "./types";

/** Acts as the client does: it sends back the confirm sentence the card last showed. */
export function asShown(card: RegisteredCard): RegisteredCard {
	return {
		...card,
		act: async (refs, action, ctx, input) => {
			const shown = await card.resolve(refs, ctx);
			return card.act(
				refs,
				action,
				ctx,
				input,
				shown.actions.find((item) => item.id === action)?.confirm,
			);
		},
	};
}
