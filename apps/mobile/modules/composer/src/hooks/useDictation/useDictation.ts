import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import {
	type DictationErrorCode,
	type DictationSession,
	dictation,
} from "../../utils/dictation";
import { joinDraft } from "../../utils/joinDraft";

export type DictationState = "idle" | "starting" | "recording";

interface UseDictationOptions {
	getDraft: () => string;
	setDraft: (text: string) => void;
	onError?: (message: string) => void;
}

/**
 * Dictation into the draft. Words in progress show at the end of the draft
 * and are replaced as they firm up; typing during dictation becomes the new
 * base, so it is never overwritten.
 */
export function useDictation({
	getDraft,
	setDraft,
	onError,
}: UseDictationOptions) {
	const { t } = useLingui();
	const [state, setState] = useState<DictationState>("idle");
	const [level, setLevel] = useState(0);
	const session = useRef<DictationSession | null>(null);
	const text = useRef({ base: "", heard: "", partial: "" });
	const callbacks = useRef({ setDraft, onError });
	callbacks.current = { setDraft, onError };

	useEffect(() => () => session.current?.cancel(), []);

	const errorMessage = (code: DictationErrorCode, heardSomething: boolean) => {
		if (code === "permission") {
			return t({
				message:
					"Microphone access is not allowed. Allow it in your device settings to dictate.",
			});
		}
		if (heardSomething) {
			return t({
				message: "Dictation stopped. What was heard so far is in your message.",
			});
		}
		if (code === "network") {
			return t({ message: "Dictation needs a network connection." });
		}
		if (code === "language") {
			return t({ message: "Dictation is not available in this language." });
		}
		return t({ message: "Could not start dictation" });
	};

	const show = () => {
		const { base, heard, partial } = text.current;
		callbacks.current.setDraft(joinDraft(joinDraft(base, heard), partial));
	};

	const start = async () => {
		if (state !== "idle") return;
		text.current = { base: getDraft(), heard: "", partial: "" };
		setState("starting");
		const started = await dictation.start({
			onPartial: (partial) => {
				text.current.partial = partial;
				setState("recording");
				show();
			},
			onFinal: (final) => {
				text.current.heard = joinDraft(text.current.heard, final);
				text.current.partial = "";
				show();
			},
			onLevel: (next) => {
				setState("recording");
				setLevel(next);
			},
			onError: (code) => {
				const { heard, partial } = text.current;
				callbacks.current.onError?.(errorMessage(code, !!(heard || partial)));
			},
			onEnd: () => {
				if (text.current.partial) {
					text.current.heard = joinDraft(
						text.current.heard,
						text.current.partial,
					);
					text.current.partial = "";
					show();
				}
				session.current = null;
				setLevel(0);
				setState("idle");
			},
		});
		if (!started) {
			setState("idle");
			return;
		}
		session.current = started;
		setState((current) => (current === "starting" ? "recording" : current));
	};

	const stop = () => session.current?.stop();

	/** The user typed while dictating: what they typed is the new base. */
	const rebase = (draft: string) => {
		if (!session.current) return;
		text.current = { base: draft, heard: "", partial: "" };
	};

	return {
		available: dictation.available,
		state,
		level,
		start,
		stop,
		rebase,
	};
}
