import { Trans } from "@lingui/react/macro";
import { useLayoutEffect, useRef } from "react";
import { LuCircleX, LuExternalLink } from "react-icons/lu";
import type { GithubFailedJobView } from "../../../../types";

interface FailedJobProps {
	job: GithubFailedJobView;
}

/** One failed job as GitHub's log view shows it: the step that failed, GitHub's error lines, its annotations, and the end of the log. */
export function FailedJob({ job }: FailedJobProps) {
	const { step } = job;
	const number = step?.number;
	const name = step?.name;
	const log = useRef<HTMLPreElement>(null);
	// The excerpt ends at the first error, so it opens at its end.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scrolls again when the text changes
	useLayoutEffect(() => {
		if (log.current) log.current.scrollTop = log.current.scrollHeight;
	}, [job.log]);
	return (
		<div data-job={job.id} className="flex min-w-0 flex-col gap-2">
			<div className="flex min-w-0 items-center gap-2 text-[13px]">
				<LuCircleX className="size-3.5 shrink-0 text-destructive" />
				<a
					href={job.url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground hover:underline"
				>
					<span className="truncate">{job.name}</span>
					<LuExternalLink className="size-3 shrink-0 opacity-60" />
				</a>
				{step && (
					<span className="shrink-0 text-xs text-muted-foreground">
						<Trans>
							Step {number}: {name}
						</Trans>
					</span>
				)}
			</div>
			{job.errors.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-xs text-destructive">
					{job.errors.map((error, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: error lines repeat and never reorder
						<li key={index} className="break-words">
							{error}
						</li>
					))}
				</ul>
			)}
			{job.annotations.length > 0 && (
				<ul className="flex flex-col gap-1.5 text-xs">
					{job.annotations.map((annotation, index) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: annotations repeat and never reorder
							key={index}
							className="flex min-w-0 flex-col gap-0.5"
						>
							<span className="truncate font-mono text-[11.5px] text-foreground">
								{annotation.path}
								{annotation.line === null ? "" : `:${annotation.line}`}
							</span>
							<span className="break-words text-muted-foreground">
								{annotation.message}
							</span>
						</li>
					))}
				</ul>
			)}
			{job.log && (
				<pre
					ref={log}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling log has to take keyboard focus
					tabIndex={0}
					className="max-h-64 select-text overflow-auto whitespace-pre rounded-md bg-[#0d1117] px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-[#e6edf3] outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{job.log}
				</pre>
			)}
		</div>
	);
}
