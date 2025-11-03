"use client";

import { useEffect } from "react";

interface WaitlistModalProps {
	isOpen: boolean;
	onClose: () => void;
}

declare global {
	interface Window {
		Tally?: {
			openPopup: (
				formId: string,
				options?: {
					layout?: "default" | "modal";
					width?: number;
					emoji?: {
						text?: string;
						animation?: string;
					};
					hiddenFields?: Record<string, string>;
					onOpen?: () => void;
					onClose?: () => void;
					onSubmit?: (payload: unknown) => void;
				},
			) => void;
			closePopup: (formId: string) => void;
		};
	}
}

export function WaitlistModal({ isOpen, onClose }: WaitlistModalProps) {
	useEffect(() => {
		if (isOpen && typeof window !== "undefined" && window.Tally) {
			window.Tally.openPopup("wv7Q0A", {
				layout: "modal",
				width: 500,
				onClose: () => {
					onClose();
				},
			});
		}
	}, [isOpen, onClose]);

	useEffect(() => {
		// Close popup when component unmounts or isOpen becomes false
		return () => {
			if (typeof window !== "undefined" && window.Tally) {
				window.Tally.closePopup("wv7Q0A");
			}
		};
	}, []);

	return null;
}
