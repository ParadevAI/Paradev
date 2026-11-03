import { useLingui } from "@lingui/react/macro";
import {
	isSupportedLocale,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
} from "@superset/i18n";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiOutlineLanguage } from "react-icons/hi2";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";

const AUTO = "auto";

// The app already picked a locale from the system; this only corrects it
export function OnboardingLanguagePicker() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	const updateLocale = cloudTrpc.user.updateLocale.useMutation();
	const setLanguage = electronTrpc.settings.setLanguage.useMutation({
		onSuccess: async (_data, variables) => {
			await utils.settings.getLanguage.invalidate();
			updateLocale.mutate(
				{ locale: variables.language },
				{ onError: () => {} },
			);
		},
	});

	return (
		<Select
			value={language ?? AUTO}
			onValueChange={(value) => {
				track("language_changed", {
					from: language ?? AUTO,
					to: value,
					surface: "onboarding",
				});
				setLanguage.mutate({
					language: value === AUTO || !isSupportedLocale(value) ? null : value,
				});
			}}
		>
			<SelectTrigger
				size="sm"
				className="no-drag w-auto gap-1.5 border-none bg-transparent px-2 text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent"
				aria-label={t({
					message: "App display language",
				})}
			>
				<HiOutlineLanguage className="size-4" />
				<span>{t({ message: "Language" })}</span>
				<span className="text-foreground">
					<SelectValue />
				</span>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={AUTO}>{t({ message: "Auto (system)" })}</SelectItem>
				{SUPPORTED_LOCALES.map((locale) => (
					<SelectItem key={locale} value={locale}>
						{LOCALE_LABELS[locale]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
