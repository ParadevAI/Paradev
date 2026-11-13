#!/usr/bin/env bash
cd /workspace/perf-bench
for rep in 1 2 3; do
  for n in A B C D E; do
    for mode in local cloud; do
      RUN_TAG=$rep node run.mjs /tmp/perf/out-$n $n $mode 1 > /dev/null 2>>/tmp/perf/matrix.log
    done
  done
  for n in B E; do RUN_TAG=$rep node run.mjs /tmp/perf/out-$n $n cloud 1 "&fix=1" > /dev/null 2>>/tmp/perf/matrix.log; done
done
echo DONE >> /tmp/perf/matrix.log
