import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@superset/ui/dialog";
import { useState } from "react";
import { LuShare2 } from "react-icons/lu";
import { UsageCardEditor } from "./components/UsageCardEditor";

export function ShareUsageCard({ hostUrl }: { hostUrl: string | null }) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-6 gap-1 px-2 text-[10px]"
					disabled={!hostUrl}
				>
					<LuShare2 className="size-3" />
					<Trans>Share usage</Trans>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						<Trans>Usage card</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Only selected stats go into your image and public link. Repository
							names and PR titles are never included.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{open && hostUrl && <UsageCardEditor key={hostUrl} hostUrl={hostUrl} />}
			</DialogContent>
		</Dialog>
	);
}
