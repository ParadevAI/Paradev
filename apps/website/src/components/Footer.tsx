"use client";

import { motion } from "framer-motion";

export function Footer() {
	return (
		<footer className="bg-black border-t border-zinc-800">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12">
				<motion.div
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="flex flex-col sm:flex-row justify-between items-center gap-4"
				>
					<div className="flex items-center gap-2">
						<span className="text-white font-bold text-2xl">⊇</span>
						<span className="text-white font-semibold">Superset</span>
					</div>
					<p className="text-zinc-400 text-sm">
						© {new Date().getFullYear()} Superset. All rights reserved.
					</p>
				</motion.div>
			</div>
		</footer>
	);
}
