export interface AskOnceDeps {
	isAllowed: () => boolean;
	wasAsked: () => Promise<boolean>;
	markAsked: () => Promise<void>;
	ask: () => Promise<unknown>;
}

/** A denial is final: the card is a nicety, not worth a second prompt. */
export async function askOnce(deps: AskOnceDeps): Promise<boolean> {
	try {
		if (deps.isAllowed()) return true;
		if (await deps.wasAsked()) return false;
		await deps.markAsked();
		await deps.ask();
		return deps.isAllowed();
	} catch {
		return false;
	}
}
