export type PromptOptions = {
	title: string;
	message?: string;
	defaultValue?: string;
	placeholder?: string;
	confirmText?: string;
	cancelText?: string;
	selectText?: boolean;
};

/** Resolves the entered text, or null when cancelled. */
export type Prompt = (options: PromptOptions) => Promise<string | null>;
