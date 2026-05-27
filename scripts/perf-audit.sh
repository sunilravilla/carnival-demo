#!/usr/bin/env bash
# Wave 2 performance audit — captures targeted latency metrics against the
# running backend (and optionally measures the frontend bundle size).
#
# Usage:
#   ./scripts/perf-audit.sh              # full audit + writes WAVE2_PERF.md
#   ./scripts/perf-audit.sh --no-bundle  # skip vite build (slow)

set -u
API="${API:-http://localhost:8000}"
PHONE="${PHONE:-9999999990}"
NOBUNDLE=0
[[ "${1:-}" == "--no-bundle" ]] && NOBUNDLE=1

OUT="WAVE2_PERF.md"

# Reset session so each measurement is on a clean cache + clean reservations
reset() {
  curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
    -d "{\"phone\":\"$PHONE\"}" >/dev/null
  curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$PHONE\"}" >/dev/null
}

# Time one POST. echoes elapsed seconds (float).
time_post() {
  local body="$1"
  local path="${2:-/api/agent-respond-elevenlabs}"
  curl -s -o /dev/null \
    -w "%{time_total}\n" \
    -X POST "$API$path" \
    -H "Content-Type: application/json" \
    -d "$body"
}

# Time SSE TTFT — wall-clock from POST to first non-empty `data:` line.
time_ttft() {
  local body="$1"
  python3 << EOF
import json, time, urllib.request
t0 = time.monotonic()
req = urllib.request.Request(
    "$API/api/agent-respond-stream",
    data=json.dumps($body).encode(),
    headers={"Content-Type": "application/json"},
)
r = urllib.request.urlopen(req, timeout=30)
ttft = None
for raw in r:
    s = raw.decode().strip()
    if s.startswith("data:"):
        payload = s[5:].strip()
        try:
            obj = json.loads(payload)
            if obj.get("type") == "text_delta" and obj.get("text"):
                ttft = time.monotonic() - t0
                break
        except Exception:
            pass
print(f"{ttft:.3f}" if ttft else "NA")
EOF
}

echo "Wave 2 performance audit — $(date '+%Y-%m-%d %H:%M:%S')"
echo

# ─────────────────────────────────────────────────────────────────────────
# 1. Backend warm-up (also seeds prompt cache)
# ─────────────────────────────────────────────────────────────────────────
reset
echo "Warming backend / Anthropic prompt cache..."
time_post '{"conversation_uuid":"warmup","messages":[{"role":"user","content":"hi"}]}' >/dev/null
echo "  done"
echo

# ─────────────────────────────────────────────────────────────────────────
# 2. End-to-end timing — single-card vs multi-card macro, 3 samples each
# ─────────────────────────────────────────────────────────────────────────
echo "Measuring end-to-end agent turns (3 samples per scenario)..."

single_samples=()
for i in 1 2 3; do
  reset
  t=$(time_post "{\"conversation_uuid\":\"perf-single-$i\",\"messages\":[{\"role\":\"user\",\"content\":\"book Pink Agave for 2 at 8\"}]}")
  single_samples+=("$t")
  echo "  single  [$i]: ${t}s"
done

land_samples=()
for i in 1 2 3; do
  reset
  t=$(time_post "{\"conversation_uuid\":\"perf-land-$i\",\"messages\":[{\"role\":\"user\",\"content\":\"land the Scarlet Statement look\"}]}")
  land_samples+=("$t")
  echo "  land    [$i]: ${t}s"
done

surprise_samples=()
for i in 1 2 3; do
  reset
  t=$(time_post "{\"conversation_uuid\":\"perf-surp-$i\",\"messages\":[{\"role\":\"user\",\"content\":\"arrange an anniversary surprise\"}]}")
  surprise_samples+=("$t")
  echo "  surp    [$i]: ${t}s"
done

bimini_samples=()
for i in 1 2 3; do
  reset
  t=$(time_post "{\"conversation_uuid\":\"perf-bim-$i\",\"messages\":[{\"role\":\"user\",\"content\":\"pre-board my Bimini day\"}]}")
  bimini_samples+=("$t")
  echo "  bimini  [$i]: ${t}s"
done

# ─────────────────────────────────────────────────────────────────────────
# 3. Streaming TTFT (time to first text_delta)
# ─────────────────────────────────────────────────────────────────────────
echo
echo "Measuring streaming TTFT..."
reset
ttft1=$(time_ttft '{"conversation_uuid":"ttft-1","messages":[{"role":"user","content":"what is on tonight?"}]}')
ttft2=$(time_ttft '{"conversation_uuid":"ttft-2","messages":[{"role":"user","content":"book Extra Virgin at 7:30"}]}')
ttft3=$(time_ttft '{"conversation_uuid":"ttft-3","messages":[{"role":"user","content":"land the Ruby Tuxedo look"}]}')
echo "  TTFT chat:        ${ttft1}s"
echo "  TTFT single-tool: ${ttft2}s"
echo "  TTFT macro:       ${ttft3}s"

# ─────────────────────────────────────────────────────────────────────────
# 4. Direct multi-card endpoint (no LLM in path)
# ─────────────────────────────────────────────────────────────────────────
echo
echo "Measuring direct multi-card endpoint (no LLM)..."
reset
direct=$(time_post '{"location":"the pool deck"}' /api/champagne/order)
echo "  POST /api/champagne/order: ${direct}s"

# ─────────────────────────────────────────────────────────────────────────
# 5. ship_data memory growth — 20 reservation-adding turns
# ─────────────────────────────────────────────────────────────────────────
echo
echo "Measuring ship_data memory growth over 20 reservation turns..."
mem_growth=$(python3 << 'EOF'
import sys, tracemalloc
sys.path.insert(0, 'backend')
from app.services import ship_data
ship_data.set_active_guest('9999999990')
ship_data.reset_guest('9999999990')
tracemalloc.start()
snap_before = tracemalloc.take_snapshot()
for i in range(20):
    ship_data.add_reservation('dining', {
        'restaurant_id': f'mock-{i}', 'restaurant_name': f'Mock Resto {i}',
        'time': '19:00', 'party_size': 2, 'confirmation_id': f'X{i:05d}'
    })
    ship_data.add_folio_charge(f'Mock charge {i}', 25.0)
snap_after = tracemalloc.take_snapshot()
diff = snap_after.compare_to(snap_before, 'filename')
total = sum(s.size_diff for s in diff)
print(f"{total/1024:.1f}")
EOF
)
echo "  growth: ${mem_growth} KB"

# ─────────────────────────────────────────────────────────────────────────
# 6. (Optional) Frontend bundle size
# ─────────────────────────────────────────────────────────────────────────
bundle_kb="(skipped)"
if [[ "$NOBUNDLE" -eq 0 ]] && command -v npx >/dev/null 2>&1; then
  echo
  echo "Building frontend (vite build)..."
  if (cd frontend && VITE_DEMO_BRAND=virgin npm run build > /tmp/perf-build.log 2>&1); then
    # Find the main bundle and report its size + gzipped size
    main_js=$(ls -S frontend/dist/assets/*.js 2>/dev/null | head -1)
    if [[ -n "$main_js" ]]; then
      raw_kb=$(($(wc -c < "$main_js") / 1024))
      gz_kb=$(gzip -c "$main_js" | wc -c | awk '{ printf "%.0f", $1/1024 }')
      bundle_kb="raw ${raw_kb}KB · gzipped ${gz_kb}KB"
      echo "  bundle: $bundle_kb"
    else
      bundle_kb="(no main bundle found)"
    fi
  else
    bundle_kb="(build failed — see /tmp/perf-build.log)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────
# 7. Compute averages + write report
# ─────────────────────────────────────────────────────────────────────────
avg() {
  python3 -c "import sys; a=[float(x) for x in sys.argv[1:]]; print(f'{sum(a)/len(a):.3f}')" "$@"
}
single_avg=$(avg "${single_samples[@]}")
land_avg=$(avg "${land_samples[@]}")
surp_avg=$(avg "${surprise_samples[@]}")
bim_avg=$(avg "${bimini_samples[@]}")

# Pass/fail vs plan targets (from /Users/sunilravilla/.claude/plans/ok-since-we-are-unified-acorn.md)
flag() {
  python3 -c "import sys; v=float(sys.argv[1]); t=float(sys.argv[2]); print('✅' if v <= t else '⚠️')" "$1" "$2"
}

cat > "$OUT" << EOF
# Wave 2 — Performance Audit

Captured: $(date '+%Y-%m-%d %H:%M:%S')
Backend: \`$API\` · Guest: \`$PHONE\`

## Metrics vs Targets

| Metric | Target | Measured | |
|---|---|---|---|
| Direct champagne endpoint (no LLM) | <100 ms | $(python3 -c "print(f'{float($direct)*1000:.0f}')") ms | $(flag $direct 0.100) |
| End-to-end single-card turn | <3.5 s | ${single_avg}s avg | $(flag $single_avg 3.5) |
| End-to-end macro turn (\`land_the_look\`) | <5.0 s | ${land_avg}s avg | $(flag $land_avg 5.0) |
| End-to-end macro turn (\`arrange_surprise\`) | <5.0 s | ${surp_avg}s avg | $(flag $surp_avg 5.0) |
| End-to-end macro turn (\`prebook_bimini_day\`) | <5.0 s | ${bim_avg}s avg | $(flag $bim_avg 5.0) |
| Streaming TTFT — chat (no tool) | <0.8 s | ${ttft1}s | $(flag $ttft1 0.8) |
| Streaming TTFT — single-tool turn | <0.8 s for finalize | ${ttft2}s (includes tool-selection) | — |
| Streaming TTFT — macro turn | <0.8 s for finalize | ${ttft3}s (includes tool-selection) | — |
| \`ship_data\` memory · 20 reservation turns | <5 MB ($(echo "5*1024" | bc) KB) | ${mem_growth} KB | $(python3 -c "print('✅' if float('$mem_growth') < 5120 else '⚠️')") |
| Frontend bundle (Virgin build) | <30 KB delta gzipped | $bundle_kb | — (baseline not captured pre-Wave 2) |

## Raw samples

- single-card (\`book_dining\` for Pink Agave): ${single_samples[*]} → avg ${single_avg}s
- macro \`land_the_look\`: ${land_samples[*]} → avg ${land_avg}s
- macro \`arrange_surprise\`: ${surprise_samples[*]} → avg ${surp_avg}s
- macro \`prebook_bimini_day\`: ${bimini_samples[*]} → avg ${bim_avg}s

## Notes

- TTFT for tool-bearing prompts inherently includes the phase-1 JSON tool-selection round-trip (~1.5–2.5 s on Claude Sonnet 4.5) BEFORE the streaming finalize starts. The <0.8 s target applies to the finalize phase alone; only the chat-no-tool TTFT is a direct apples-to-apples measure of that.
- Macro tools (\`land_the_look\`, \`arrange_surprise\`, \`prebook_bimini_day\`) intentionally do more compute server-side (4–5 cards built from existing tool helpers) but most of the latency is the LLM passes, not the Python compute.
- Anthropic prompt cache hit rate is not directly captured here — would require modifying \`llm_client.py\` to log \`cache_read_input_tokens\`. The system prompt is cached via ephemeral \`cache_control\` so warm sessions reuse it; first call after restart pays the full cost.
- React render time per 4-card payload: not captured here. Use Chrome DevTools Performance tab and look at the \`ConciergeCard\` render frames after a \`land_the_look\` invocation. Target <100 ms.

## How to re-run

\`\`\`bash
./scripts/perf-audit.sh             # full
./scripts/perf-audit.sh --no-bundle # skip frontend build (faster)
\`\`\`
EOF

echo
echo "Report written to $OUT"
echo
cat "$OUT" | sed 's/^/    /'
