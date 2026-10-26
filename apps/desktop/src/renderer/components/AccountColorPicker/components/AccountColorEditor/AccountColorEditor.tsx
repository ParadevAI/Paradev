import { Trans } from "@lingui/react/macro";
import {
	type AccountColor,
	accountColor,
	parseCustomAccountColor,
} from "@superset/shared/account-colors";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useId, useState } from "react";

export function AccountColorEditor({
	color,
	dark,
	saving,
	onSave,
}: {
	color: string | null | undefined;
	dark: boolean;
	saving: boolean;
	onSave: (color: AccountColor | null) => void;
}) {
	const id = useId();
	const initial = accountColor(color, dark) ?? "#d97757";
	const [draft, setDraft] = useState(initial);
	const custom = parseCustomAccountColor(draft);
	const invalid = !custom;
	return (
		<form
			className="mt-3 space-y-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (custom && !saving) onSave(custom);
			}}
		>
			<div className="space-y-1.5">
				<label htmlFor={`${id}-picker`} className="text-xs font-medium">
					<Trans>Color</Trans>
				</label>
				<input
					id={`${id}-picker`}
					type="color"
					value={custom ?? initial}
					disabled={saving}
					onChange={(event) => setDraft(event.currentTarget.value)}
					className="block h-14 w-full cursor-pointer rounded-md border border-input bg-transparent p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
				/>
			</div>
			<div className="space-y-1.5">
				<label htmlFor={`${id}-hex`} className="text-xs font-medium">
					<Trans>Hex color</Trans>
				</label>
				<Input
					id={`${id}-hex`}
					value={draft}
					onChange={(event) => setDraft(event.currentTarget.value)}
					onBlur={() => {
						if (custom) setDraft(custom);
					}}
					disabled={saving}
					maxLength={32}
					spellCheck={false}
					autoComplete="off"
					aria-invalid={invalid}
					aria-describedby={invalid ? `${id}-error` : undefined}
					className="h-8 font-mono text-xs"
				/>
				{invalid && (
					<p
						id={`${id}-error`}
						role="alert"
						className="text-xs text-destructive"
					>
						<Trans>Enter a six-digit hex color.</Trans>
					</p>
				)}
			</div>
			<div className="flex items-center justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="text-xs"
					disabled={saving || !color}
					onClick={() => onSave(null)}
				>
					<Trans>Default color</Trans>
				</Button>
				<Button type="submit" size="sm" disabled={saving || invalid}>
					<Trans>Save</Trans>
				</Button>
			</div>
		</form>
	);
}
