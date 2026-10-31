import type { ReactNode, Ref } from "react";

export interface SearchBarHandle {
	focus: () => void;
}

export interface SearchBarProps {
	ref?: Ref<SearchBarHandle>;
	placeholder: string;
	onChangeText: (text: string) => void;
	onCancel: () => void;
}

/** The search sheet's query field, in its header. */
export type SearchBarComponent = (props: SearchBarProps) => ReactNode;
