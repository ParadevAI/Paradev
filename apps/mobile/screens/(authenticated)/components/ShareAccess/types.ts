import type { LucideIcon } from "lucide-react-native";

export interface GeneralAccessOption {
	value: string;
	label: string;
	description: string;
	icon: LucideIcon;
	/** Shown with the organization's avatar instead of `icon`. */
	organization?: { name: string; logo: string | null };
}

export interface ShareConfirm {
	title: string;
	message: string;
	action: string;
	destructive?: boolean;
}

export interface GeneralAccess {
	value: string;
	options: GeneralAccessOption[];
	onChange: (next: string) => Promise<unknown>;
	confirm?: (from: string, to: string) => ShareConfirm | null;
	/** What general access lets people do, when the resource has more than one role. */
	role?: { value: string; onChange: (next: string) => Promise<unknown> };
}
