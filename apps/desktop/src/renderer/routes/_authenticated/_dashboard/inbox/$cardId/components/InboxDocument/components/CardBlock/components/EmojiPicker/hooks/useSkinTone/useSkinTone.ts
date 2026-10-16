import { useState } from "react";

const KEY = "slack.emojiSkinTone";

function read(): number {
	try {
		const tone = Number(localStorage.getItem(KEY));
		return tone >= 0 && tone <= 5 ? tone : 0;
	} catch {
		return 0;
	}
}

/** The reader's default skin tone, kept like Slack keeps it: one choice for every picker. */
export function useSkinTone(): [number, (tone: number) => void] {
	const [tone, setTone] = useState(read);
	return [
		tone,
		(next) => {
			setTone(next);
			try {
				localStorage.setItem(KEY, String(next));
			} catch {}
		},
	];
}
