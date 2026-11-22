import { Trans } from "@lingui/react/macro";
import { formatCurrency } from "@superset/i18n/format";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@superset/ui/dialog";
import { useReducedMotion } from "framer-motion";
import { electronTrpc } from "renderer/lib/electron-trpc";
import revealFilm from "./assets/paradev-reveal-dialog.mp4";
import revealEndFrame from "./assets/paradev-reveal-dialog-end.jpg";

const ANNOUNCEMENT_URL = `${COMPANY.MARKETING_URL}/blog/superset-is-now-paradev`;
const SEED_AMOUNT_USD = 11_500_000;

interface BrandRenameDialogProps {
	onDismiss: () => void;
}

export function BrandRenameDialog({ onDismiss }: BrandRenameDialogProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const reduceMotion = useReducedMotion();

	const formerName = BRAND.FORMER_NAME;
	const productName = BRAND.NAME;
	const amount = formatCurrency(SEED_AMOUNT_USD, "USD", {
		notation: "compact",
		maximumFractionDigits: 1,
	});

	const readAnnouncement = () => {
		openUrl.mutate(ANNOUNCEMENT_URL);
		onDismiss();
	};

	return (
		<Dialog open modal onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent
				className="max-w-lg gap-0 overflow-hidden rounded-none p-0"
				showCloseButton={false}
			>
				<video
					src={revealFilm}
					poster={revealEndFrame}
					autoPlay={!reduceMotion}
					loop
					muted
					playsInline
					preload="auto"
					aria-hidden
					className="aspect-[1280/560] w-full bg-[#100f0e] object-cover"
				/>
				<div className="p-5">
					<DialogTitle className="text-base font-semibold">
						<Trans>
							{formerName} is now {productName}!
						</Trans>
					</DialogTitle>
					<DialogDescription className="mt-2 text-[13px]">
						<Trans>Everything carries over.</Trans>{" "}
						<Trans>
							We raised an {amount} seed round to help you run an army of coding
							agents.
						</Trans>
					</DialogDescription>
					<DialogFooter className="mt-5 flex-row justify-end gap-2">
						<Button variant="ghost" size="sm" onClick={onDismiss}>
							<Trans>Got it</Trans>
						</Button>
						<Button size="sm" onClick={readAnnouncement}>
							<Trans>Read announcement</Trans>
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
