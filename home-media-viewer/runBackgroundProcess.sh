#!/bin/sh
set -eu
cd /home/node/app
# Development/manual one-shot requests use the same header authentication and bounded timeout.
exec node -e '
const token = process.env.PROCESS_TOKEN;
if (!token) throw new Error("PROCESS_TOKEN is required");
const base = process.env.BACKGROUND_URL || `http://localhost:${process.env.PORT || 3000}`;
fetch(new URL("/api/process/updateMetadata", base), {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout((Number(process.env.LONG_PROCESS_TIMEOUT_SEC || 120) + 60) * 1000),
}).then(async response => {
  await response.body?.cancel();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  console.log("Background indexing completed");
}).catch(() => { console.error("Background indexing failed"); process.exitCode = 1; });
'
