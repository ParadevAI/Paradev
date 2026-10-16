import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	LuAlignLeft,
	LuExternalLink,
	LuMapPin,
	LuUsers,
	LuVideo,
} from "react-icons/lu";
import type { CalendarEventView } from "../../types";
import { eventLine } from "../../utils/calendarTime";
import { LinkedText } from "../LinkedText";
import { FactRow } from "./components/FactRow";
import { GuestList } from "./components/GuestList";

interface CalendarEventFactsProps {
	event: CalendarEventView;
	/** Rows under the facts, such as the conflicts. */
	children?: ReactNode;
}

/** An event as Google's popover lays it out: title and time, where, who, and what it is about. */
export function CalendarEventFacts({
	event,
	children,
}: CalendarEventFactsProps) {
	const { t } = useLingui();
	return (
		<div className="flex flex-col gap-3 px-4 py-4">
			<div className="flex items-start gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3
						className={cn(
							"text-[17px] leading-snug text-foreground",
							event.cancelled && "line-through",
						)}
					>
						{event.title}
					</h3>
					<p className="text-[13px] text-muted-foreground">
						{eventLine(event)}
					</p>
				</div>
				<a
					href={event.url}
					target="_blank"
					rel="noreferrer"
					aria-label={t({ message: "Open in Google Calendar" })}
					className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuExternalLink className="size-4" strokeWidth={1.5} />
				</a>
			</div>
			{event.meetUrl && (
				<FactRow icon={<LuVideo strokeWidth={1.5} />}>
					<a
						href={event.meetUrl}
						target="_blank"
						rel="noreferrer"
						className="break-all text-primary underline-offset-2 hover:underline"
					>
						{event.meetUrl.replace(/^https?:\/\//, "")}
					</a>
				</FactRow>
			)}
			{event.location && (
				<FactRow icon={<LuMapPin strokeWidth={1.5} />}>
					{event.location}
				</FactRow>
			)}
			{event.guests.length > 0 && (
				<FactRow icon={<LuUsers strokeWidth={1.5} />}>
					<GuestList guests={event.guests} />
				</FactRow>
			)}
			{event.description && (
				<FactRow icon={<LuAlignLeft strokeWidth={1.5} />}>
					<p className="whitespace-pre-wrap break-words leading-relaxed">
						<LinkedText text={event.description} />
					</p>
				</FactRow>
			)}
			{children}
		</div>
	);
}
