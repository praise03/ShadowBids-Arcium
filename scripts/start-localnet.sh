#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="$DIR/.anchor/test-ledger"
PID_FILE="$DIR/.localnet.pid"

cleanup() {
  echo "=== Cleanup ==="
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  docker compose -f "$DIR/artifacts/docker-compose-arx-env.yml" down -t 5 2>/dev/null || true
}

clean_docker_state() {
  echo "=== Cleaning Docker persistent state ==="
  rm -rf "$DIR/artifacts/private_shares_node_0" "$DIR/artifacts/public_inputs_node_0"
  rm -rf "$DIR/artifacts/private_shares_node_1" "$DIR/artifacts/public_inputs_node_1"
  rm -rf "$DIR/artifacts/arx_node_logs" "$DIR/artifacts/trusted_dealer_logs"
  echo "  Done"
}

patch_arx_configs() {
  local host_ip
  host_ip=$(ipconfig getifaddr en0 2>/dev/null || echo "192.168.18.3")
  echo "=== Patching ARX configs (host IP: $host_ip) ==="
  local patched=0

  # Patch docker-compose extra_hosts: host.docker.internal:host-gateway → host.docker.internal:<IP>
  if grep -q 'host.docker.internal:host-gateway' "$DIR/artifacts/docker-compose-arx-env.yml"; then
    sed -i '' "s/host\.docker\.internal:host-gateway/host.docker.internal:$host_ip/g" \
      "$DIR/artifacts/docker-compose-arx-env.yml"
    patched=$((patched + 1))
  fi

  # Patch all node/recovery/dealer configs: host.docker.internal → <IP> in URL values
  for f in "$DIR"/artifacts/node_config_*.toml \
           "$DIR"/artifacts/recovery_node_config_*.toml \
           "$DIR"/artifacts/trusted_dealer_config.toml; do
    if [ -f "$f" ] && grep -q 'host\.docker\.internal' "$f"; then
      sed -i '' "s/host\.docker\.internal/$host_ip/g" "$f"
      patched=$((patched + 1))
    fi
  done

  echo "  Patched $patched config files"
}

ensure_artifacts() {
  local count
  count=$(ls "$DIR"/artifacts/*.json 2>/dev/null | wc -l)
  if [ "$count" -lt 40 ]; then
    echo "=== Generating artifacts (arcium test --skip-build) ==="
    rm -rf "$LEDGER"
    arcium test --skip-build 2>&1 || true
    count=$(ls "$DIR"/artifacts/*.json 2>/dev/null | wc -l)
    if [ "$count" -lt 40 ]; then
      echo "ERROR: Only $count artifacts generated (need 40+)"
      exit 1
    fi
    echo "Generated $count artifacts"
  fi
}

start_validator() {
  echo "=== Starting validator ==="
  rm -rf "$LEDGER"
  
  solana-test-validator \
    --ledger "$LEDGER" \
    --reset \
    --bpf-program Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ "$DIR/artifacts/arcium_program_0.10.1.so" \
    --bpf-program F4tKBoryaS7kaQH2Hh1CxrQDRz4HRipVEztf5p5cT5wf "$DIR/target/deploy/shadow_bid.so" \
    --account-dir "$DIR/artifacts/" \
    --slots-per-epoch 32 \
    > /tmp/validator.log 2>&1 &
  
  echo $! > "$PID_FILE"
  
  echo -n "Waiting for validator..."
  for i in {1..30}; do
    if curl -s http://127.0.0.1:8899/health > /dev/null 2>&1; then
      echo " ready"
      return
    fi
    sleep 2
    echo -n "."
  done
  echo " timeout"
  exit 1
}

start_docker() {
  echo "=== Starting Arcium Docker nodes ==="
  docker compose -f "$DIR/artifacts/docker-compose-arx-env.yml" up -d \
    arx-node-0 arx-node-1 arcium-trusted-dealer 2>&1
  
  echo "Waiting for MXE key agreement (max 120s)..."
  MXE_PUBKEY="7RUQKfy3e1rgdpvEXvtit51JV3pWTYhCLMnCnRVyZaBu"
  for i in $(seq 1 60); do
    sleep 2
    RESP=$(curl -s -X POST http://127.0.0.1:8899 \
      -H 'Content-Type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$MXE_PUBKEY\",{\"encoding\":\"base64\"}]}" 2>/dev/null)
    DATA=$(echo "$RESP" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
val=d.get('result',{}).get('value')
if val:
    raw=base64.b64decode(val['data'][0])
    # Skip 8-byte discriminator; check if rest has non-zero data
    if len(raw) > 16 and any(b != 0 for b in raw[16:]):
        print('ready')
    else:
        print('waiting')
else:
    print('absent')
" 2>/dev/null || echo "waiting")
    if [ "$DATA" = "ready" ]; then
      echo " MXE keys ready (after $((i*2))s)"
      return
    fi
    echo -n "."
  done
  echo " MXE keys not confirmed (status=$DATA); continuing"
}

run_tests() {
  local test_file="${1:-tests/e2e-localnet.spec.ts}"
  echo "=== Running e2e tests: $test_file ==="
  cd "$DIR"
  TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
    yarn run ts-mocha -p ./tsconfig.json -t 1000000 "$test_file"
}

if [ "${1:-}" = "stop" ]; then
  cleanup
  echo "Stopped"
  exit 0
fi

trap cleanup EXIT
ensure_artifacts
clean_docker_state
patch_arx_configs
start_validator
start_docker
run_tests "${1:-tests/e2e-localnet.spec.ts}"
