import type { ComponentType } from "react";

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

/** Mounted once at the app root; draws prompts where the OS has no native one. */
export type AlertPromptHostComponent = ComponentType;
