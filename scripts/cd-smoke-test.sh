#!/bin/bash
set -e

# Configuration
DEPLOY_URL="${DEPLOY_URL:-http://localhost:3001}"
MAX_RETRIES=${MAX_RETRIES:-30}
RETRY_DELAY=${RETRY_DELAY:-10}
MAX_RESPONSE_TIME=${MAX_RESPONSE_TIME:-5}

echo "Running smoke tests against: $DEPLOY_URL"

# Test 1: Health endpoint
echo "Test 1: Health endpoint check..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $MAX_RESPONSE_TIME "$DEPLOY_URL/health")
if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: Health endpoint returned HTTP $HTTP_STATUS (expected 200)"
  exit 1
fi
echo "PASS: Health endpoint returned 200"

# Test 2: Response time
echo "Test 2: Response time check..."
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time $MAX_RESPONSE_TIME "$DEPLOY_URL/health")
SLOW=$(node -e "console.log(Number(process.argv[1]) > Number(process.argv[2]) ? 'true' : 'false')" "$RESPONSE_TIME" "$MAX_RESPONSE_TIME")
if [ "$SLOW" = "true" ]; then
  echo "FAIL: Response time ${RESPONSE_TIME}s exceeds ${MAX_RESPONSE_TIME}s"
  exit 1
fi
echo "PASS: Response time ${RESPONSE_TIME}s"

# Test 3: JSON response validation
echo "Test 3: JSON response validation..."
RESPONSE=$(curl -s --max-time $MAX_RESPONSE_TIME "$DEPLOY_URL/health")
VALID_JSON=$(node -e "try { JSON.parse(process.argv[1]); console.log('true'); } catch { console.log('false'); }" "$RESPONSE" 2>/dev/null || echo "false")
if [ "$VALID_JSON" != "true" ]; then
  echo "FAIL: Health endpoint did not return valid JSON"
  exit 1
fi
echo "PASS: Valid JSON response"

# Test 4: API health endpoint
echo "Test 4: API health endpoint check..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $MAX_RESPONSE_TIME "$DEPLOY_URL/api/health" 2>/dev/null || echo "000")
if [ "$API_STATUS" = "200" ]; then
  echo "PASS: API health endpoint returned 200"
else
  echo "INFO: API health endpoint returned $API_STATUS (non-critical)"
fi

# Summary
echo ""
echo "All smoke tests passed!"

# Write to GitHub step summary if available
if [ -n "$GITHUB_STEP_SUMMARY" ]; then
  echo "### Smoke Test Results" >> "$GITHUB_STEP_SUMMARY"
  echo "| Test | Status |" >> "$GITHUB_STEP_SUMMARY"
  echo "|------|--------|" >> "$GITHUB_STEP_SUMMARY"
  echo "| Health endpoint (HTTP 200) | PASS |" >> "$GITHUB_STEP_SUMMARY"
  echo "| Response time (<${MAX_RESPONSE_TIME}s) | PASS (${RESPONSE_TIME}s) |" >> "$GITHUB_STEP_SUMMARY"
  echo "| Valid JSON response | PASS |" >> "$GITHUB_STEP_SUMMARY"
  echo "| Deploy URL | $DEPLOY_URL |" >> "$GITHUB_STEP_SUMMARY"
fi
