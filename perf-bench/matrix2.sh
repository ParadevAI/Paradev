#!/usr/bin/env bash
cd /workspace/perf-bench
for rep in 1 2 3; do
  for n in B E; do RUN_TAG=$rep node run.mjs /tmp/perf/out-$n $n cloud 1 "&fix=1" >/dev/null 2>>/tmp/perf/matrix2.log; done
done
for rep in 1 2; do
  for n in C D E; do for mode in local cloud; do
    THROTTLE=4 RUN_TAG=$rep node run.mjs /tmp/perf/out-$n $n $mode 1 >/dev/null 2>>/tmp/perf/matrix2.log
  done; done
  THROTTLE=4 RUN_TAG=$rep node run.mjs /tmp/perf/out-E E cloud 1 "&fix=1" >/dev/null 2>>/tmp/perf/matrix2.log
done
echo DONE >> /tmp/perf/matrix2.log
