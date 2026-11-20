import type { ReactNode, Ref } from "react";

export interface InviteSearchBarHandle {
	focus: () => void;
	clearText: () => void;
}

export interface InviteSearchBarProps {
	ref?: Ref<InviteSearchBarHandle>;
	placeholder: string;
	onChangeText: (text: string) => void;
	onCancel: () => void;
}

/** The invite screen's field for names, emails and teams. */
export type InviteSearchBarComponent = (
	props: InviteSearchBarProps,
) => ReactNode;
