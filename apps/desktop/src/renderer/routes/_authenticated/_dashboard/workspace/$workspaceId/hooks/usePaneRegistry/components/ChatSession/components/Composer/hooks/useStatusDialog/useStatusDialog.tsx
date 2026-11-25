import { type ReactNode, useCallback, useState } from "react";
import {
	type SessionStatusDetails,
	SessionStatusDialog,
} from "../../components/SessionStatusDialog";

export function useStatusDialog(details: SessionStatusDetails | undefined): {
	available: boolean;
	open: () => void;
	dialog: ReactNode;
} {
	const [isOpen, setIsOpen] = useState(false);
	const open = useCallback(() => setIsOpen(true), []);
	return {
		available: details !== undefined,
		open,
		dialog:
			details && isOpen ? (
				<SessionStatusDialog details={details} onOpenChange={setIsOpen} />
			) : null,
	};
}
