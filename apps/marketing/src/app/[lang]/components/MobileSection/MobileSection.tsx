import { Trans } from "@lingui/react/macro";
import { HiArrowDown } from "react-icons/hi2";
import { PhoneShowcase } from "../PhoneShowcase";

export function MobileSection() {
	return (
		<section
			id="mobile"
			aria-labelledby="mobile-heading"
			className="scroll-mt-24 overflow-hidden pb-16 sm:pb-24"
		>
			<div className="mx-auto max-w-6xl px-6 text-center sm:px-8">
				<HiArrowDown
					aria-hidden="true"
					className="mx-auto mb-5 size-6 text-muted-foreground/40"
				/>
				<h2
					id="mobile-heading"
					className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight leading-[1.1] text-foreground"
				>
					<Trans>Start work from anywhere</Trans>
				</h2>
				<p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
					<Trans>Mobile, Cloud, or bring your own fleet</Trans>
				</p>
				<div className="mt-12 sm:mt-20">
					<PhoneShowcase layout="spread" />
				</div>
			</div>
		</section>
	);
}
