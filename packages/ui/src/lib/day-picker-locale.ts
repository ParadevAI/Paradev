import type { SupportedLocale } from "@superset/i18n";
import type { Locale } from "react-day-picker";
import {
	cs,
	de,
	enUS,
	es,
	fr,
	id,
	it,
	ja,
	ko,
	nl,
	pl,
	ptBR,
	ru,
	tr,
	uk,
	vi,
	zhCN,
	zhTW,
} from "react-day-picker/locale";

const LOCALES: Record<SupportedLocale, Locale> = {
	en: enUS,
	ja,
	"zh-CN": zhCN,
	fr,
	ko,
	"zh-TW": zhTW,
	es,
	de,
	"pt-BR": ptBR,
	it,
	ru,
	tr,
	pl,
	nl,
	id,
	cs,
	vi,
	uk,
};

export const dayPickerLocale = (locale: string): Locale =>
	LOCALES[locale as SupportedLocale] ?? enUS;
