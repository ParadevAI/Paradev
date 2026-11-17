import { fireEvent } from "@testing-library/react";

export function expandRunCards(container: HTMLElement) {
	for (;;) {
		const folded = container.querySelector<HTMLButtonElement>(
			'[data-subagent-run-card] button[aria-expanded="false"]',
		);
		if (!folded) return;
		fireEvent.click(folded);
	}
}
