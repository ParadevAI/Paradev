"use client";

import { useFormat } from "@superset/i18n/react";

import { toDate } from "../../utils/days";

export function useFormatDay() {
	const { formatDate } = useFormat();
	return (day: string) =>
		formatDate(toDate(day), { month: "short", day: "numeric" });
}
