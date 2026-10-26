import { Trans, useLingui } from "@lingui/react/macro";
import {
	type AccountColor,
	accountColor,
} from "@superset/shared/account-colors";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Palette } from "lucide-react";
import { useState } from "react";
import { AccountColorEditor } from "./components/AccountColorEditor";

export function AccountColorPicker({
	accountLabel,
	color,
	dark,
	saving = false,
	onSave,
	onOpenChange,
}: {
	accountLabel: string;
	color: string | null | undefined;
	dark: boolean;
	saving?: boolean;
	onSave: (color: AccountColor | null) => Promise<void> | void;
	onOpenChange?: (open: boolean) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const changeOpen = (value: boolean) => {
		setOpen(value);
		onOpenChange?.(value);
	};
	const save = async (value: AccountColor | null) => {
		if (pending || saving) return;
		setPending(true);
		setFailed(false);
		try {
			await onSave(value);
			changeOpen(false);
		} catch {
			setFailed(true);
		} finally {
			setPending(false);
		}
	};
	const label = `${t({ message: "Account color" })} · ${accountLabel}`;
	return (
		<Popover open={open} onOpenChange={changeOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					aria-label={label}
					title={label}
					disabled={saving}
				>
					<Palette
						className="size-3.5"
						style={{ color: accountColor(color, dark) }}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-64 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-3"
				collisionPadding={8}
				onEscapeKeyDown={(event) => event.stopPropagation()}
			>
				<p className="text-xs font-medium">
					<Trans>Account color</Trans>
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					<Trans>Used in the menu bar and floating panel.</Trans>
				</p>
				<AccountColorEditor
					key={`${accountLabel}:${color}:${dark}`}
					color={color}
					dark={dark}
					saving={saving || pending}
					onSave={(value) => void save(value)}
				/>
				{failed && (
					<p role="alert" className="mt-2 text-xs text-destructive">
						<Trans>Could not save account color.</Trans>
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
