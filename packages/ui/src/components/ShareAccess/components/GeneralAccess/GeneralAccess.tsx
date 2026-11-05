import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../../ui/alert-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../ui/select";
import { toast } from "../../../ui/sonner";
import type {
	ShareConfirmation,
	ShareGeneralAccess,
	ShareGeneralOption,
} from "../../types";
import { OrganizationMark } from "./components/OrganizationMark";

interface GeneralAccessProps {
	general: ShareGeneralAccess;
	canManage: boolean;
	organizationName: string;
	organizationLogo: string | null;
}

export function GeneralAccess({
	general,
	canManage,
	organizationName,
	organizationLogo,
}: GeneralAccessProps) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const [pending, setPending] = useState<{
		to: string;
		confirmation: ShareConfirmation;
	} | null>(null);

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(
				errorMessage(error, t({ message: "Could not change who has access" })),
			);
		} finally {
			setBusy(false);
		}
	};

	const choose = (to: string) => {
		if (to === general.value) return;
		const confirmation = general.confirm?.(general.value, to) ?? null;
		if (confirmation) setPending({ to, confirmation });
		else void run(() => general.onChange(to));
	};

	const current = general.options.find(
		(option) => option.value === general.value,
	);
	const role = general.role;
	const showRole = role?.appliesTo.includes(general.value) ?? false;
	const currentRole = role?.options.find((option) => option.id === role.value);
	const iconOf = (option: ShareGeneralOption) =>
		option.organization ? (
			<OrganizationMark name={organizationName} logo={organizationLogo} />
		) : (
			option.icon
		);

	return (
		<div className="space-y-1.5">
			<p className="text-muted-foreground text-xs">
				<Trans>General access</Trans>
			</p>
			<div className="flex min-h-8 items-center gap-2">
				<span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted [&_svg]:size-3.5">
					{current ? iconOf(current) : null}
				</span>
				{canManage ? (
					<Select value={general.value} disabled={busy} onValueChange={choose}>
						<SelectTrigger
							size="sm"
							className="h-7 min-w-0 gap-1 border-none bg-transparent px-1.5 shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
							aria-label={t({ message: "Who can open it" })}
						>
							<SelectValue>
								<span className="truncate">{current?.label}</span>
							</SelectValue>
						</SelectTrigger>
						<SelectContent align="start">
							{general.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									<span className="grid size-5 place-items-center [&_svg]:size-3.5">
										{iconOf(option)}
									</span>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<span className="truncate px-1.5 text-sm">{current?.label}</span>
				)}
				<span className="flex-1" />
				{role && showRole && currentRole ? (
					canManage && role.options.length > 1 ? (
						<Select
							value={role.value}
							disabled={busy}
							onValueChange={(value) => void run(() => role.onChange(value))}
						>
							<SelectTrigger
								size="sm"
								className="h-7 shrink-0 gap-1 border-none bg-muted px-2.5 shadow-none hover:bg-accent dark:bg-muted dark:hover:bg-accent"
								aria-label={t({ message: "What general access allows" })}
							>
								<SelectValue>{currentRole.label}</SelectValue>
							</SelectTrigger>
							<SelectContent align="end" className="max-w-72">
								{role.options.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										<span className="flex flex-col items-start">
											<span>{option.label}</span>
											<span className="text-muted-foreground text-xs">
												{option.description}
											</span>
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<span className="shrink-0 px-1.5 text-muted-foreground text-sm">
							{currentRole.label}
						</span>
					)
				) : null}
			</div>
			{canManage ? null : (
				<p className="text-muted-foreground text-xs">
					<Trans>Only the owner can change this</Trans>
				</p>
			)}
			<AlertDialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{pending?.confirmation.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{pending?.confirmation.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								const to = pending?.to;
								setPending(null);
								if (to) void run(() => general.onChange(to));
							}}
						>
							{pending?.confirmation.actionLabel}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
