import { Trans } from "@lingui/react/macro";
import { Textarea } from "@superset/ui/textarea";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";

interface NamingInstructionsFieldProps {
	id: string;
	/** `null` means no instructions are set. */
	savedValue: string | null;
	placeholder: string;
	/** Blank saves as `null`, which clears the setting. */
	save: (instructions: string | null) => Promise<unknown>;
	onSaved?: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 500;
const SAVED_INDICATOR_MS = 2000;

export function NamingInstructionsField({
	id,
	savedValue: savedInstructions,
	placeholder,
	save,
	onSaved,
}: NamingInstructionsFieldProps) {
	const savedValue = savedInstructions ?? "";
	const [value, setValue] = useState(savedValue);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

	// Ask the DOM instead of tracking focus in a ref: a focus-tracking ref
	// wedges stuck-true if the field unmounts while focused (same rationale
	// as SparseCheckoutSection).
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const latestValueRef = useRef(value);
	const lastSavedRef = useRef(savedValue);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveInFlightRef = useRef(false);
	const queuedValueRef = useRef<string | null>(null);
	const isMountedRef = useRef(true);
	const saveRef = useRef(save);
	saveRef.current = save;
	const onSavedRef = useRef(onSaved);
	onSavedRef.current = onSaved;

	useEffect(() => {
		// Don't clobber an in-progress edit when the saved value refetches.
		const isFocused =
			!!textareaRef.current && document.activeElement === textareaRef.current;
		if (isFocused || debounceTimerRef.current || saveInFlightRef.current) {
			return;
		}
		setValue(savedValue);
		latestValueRef.current = savedValue;
		lastSavedRef.current = savedValue;
	}, [savedValue]);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
			if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
		};
	}, []);

	const flushSave = useCallback(async (next: string): Promise<void> => {
		// Remember the latest intent while a request is in flight; the
		// `finally` below drains it once this attempt settles.
		if (saveInFlightRef.current) {
			queuedValueRef.current = next;
			return;
		}
		if (next.trim() === lastSavedRef.current.trim()) {
			queuedValueRef.current = null;
			return;
		}

		if (savedTimerRef.current) {
			clearTimeout(savedTimerRef.current);
			savedTimerRef.current = null;
		}
		setSaveStatus("saving");
		saveInFlightRef.current = true;
		try {
			await saveRef.current(next.trim() || null);
			lastSavedRef.current = next;
			if (!isMountedRef.current) return;
			setSaveStatus("saved");
			savedTimerRef.current = setTimeout(() => {
				setSaveStatus("idle");
				savedTimerRef.current = null;
			}, SAVED_INDICATOR_MS);
			onSavedRef.current?.();
		} catch (err) {
			console.warn("[naming-instructions/save] failed", err);
			if (isMountedRef.current) setSaveStatus("error");
		} finally {
			saveInFlightRef.current = false;
			const pending = queuedValueRef.current;
			queuedValueRef.current = null;
			if (pending !== null && isMountedRef.current) {
				void flushSave(pending);
			}
		}
	}, []);

	const handleChange = useCallback(
		(nextValue: string) => {
			setValue(nextValue);
			latestValueRef.current = nextValue;
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				void flushSave(latestValueRef.current);
			}, SAVE_DEBOUNCE_MS);
		},
		[flushSave],
	);

	const handleBlur = useCallback(() => {
		// Commit immediately on the way out instead of leaving the last
		// keystrokes sitting in the debounce window.
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
		void flushSave(latestValueRef.current);
	}, [flushSave]);

	return (
		<>
			<Textarea
				ref={textareaRef}
				id={id}
				value={value}
				onChange={(e) => handleChange(e.target.value)}
				onBlur={handleBlur}
				placeholder={placeholder}
				rows={3}
				spellCheck={false}
				className="text-sm resize-y min-h-[calc(3lh+1.125rem)]"
			/>
			<div className="flex h-4 items-center justify-end text-xs text-muted-foreground">
				{saveStatus === "saving" && (
					<span>
						<Trans>Saving…</Trans>
					</span>
				)}
				{saveStatus === "saved" && (
					<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
						<HiCheckCircle className="h-3.5 w-3.5" />
						<Trans>Saved</Trans>
					</span>
				)}
				{saveStatus === "error" && (
					<span className="select-text cursor-text text-destructive">
						<Trans>Couldn't save — edit or click away to retry</Trans>
					</span>
				)}
			</div>
		</>
	);
}
