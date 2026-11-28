// Ubuntu 22.04 ships glibc 2.35 and libstdc++ from GCC 12; Debian 12 ships 2.36 and GCC 12.
export const LINUX_LIBC_FLOOR = {
	GLIBC: "2.35",
	GLIBCXX: "3.4.30",
} as const;

export const LINUX_LIBC_DEPENDS = [
	`libc6 (>= ${LINUX_LIBC_FLOOR.GLIBC})`,
	"libstdc++6 (>= 12)",
];
