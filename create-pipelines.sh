#!/bin/bash
# Script to create CPU-intensive pipelines for k6 load testing
# These pipelines will match source="k6-loadtest" events

# Configuration
LUMI_API_URL="https://api.lumi-ent-v1.dev.imply.io"
# Bearer token from Lumi UI: copy from browser dev tools (Network tab > Authorization header)
# These tokens expire, so you'll need to refresh before running this script
AUTH_TOKEN="REPLACE_WITH_BEARER_TOKEN"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Creating CPU-intensive pipelines for k6 load testing..."
echo ""

# Pipeline 1: Grok Parser (CPU intensive - complex regex)
echo -e "${YELLOW}Creating Pipeline 1: Grok Parser Pipeline${NC}"
RESPONSE=$(curl -s -X POST "${LUMI_API_URL}/v0/pipelines" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -w "\n%{http_code}" \
  -d '{
    "name": "K6 Load Test - Grok Parser",
    "description": "CPU-intensive grok parsing for k6 load tests",
    "enabled": true,
    "searchQuery": "source=\"k6-loadtest\"",
    "processors": [
      {
        "type": "grok_parser",
        "name": "Parse structured log",
        "enabled": true,
        "parsingRules": [
          "%{TIMESTAMP_ISO8601:parsed_timestamp}%{SPACE}%{LOGLEVEL:parsed_level}%{SPACE}\\[%{DATA:parsed_service}\\]%{SPACE}%{GREEDYDATA:parsed_message}",
          ".*level.*:%{SPACE}*\"%{WORD:parsed_level}\".*message.*:%{SPACE}*\"%{DATA:parsed_message}\".*service.*:%{SPACE}*\"%{DATA:parsed_service}\".*"
        ]
      },
      {
        "type": "regex_parser",
        "name": "Extract user IDs",
        "enabled": true,
        "pattern": "user-([0-9]+)",
        "targetAttributes": [
          {"value": "extracted_user_number"}
        ]
      }
    ]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo -e "${GREEN}✓ Pipeline 1 created successfully${NC}"
  PIPELINE1_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  ID: $PIPELINE1_ID"
else
  echo -e "${RED}✗ Failed to create Pipeline 1 (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
fi

echo ""

# Pipeline 2: Lookup Mapper (CPU intensive - large lookup tables)
echo -e "${YELLOW}Creating Pipeline 2: Lookup Mapper Pipeline${NC}"
RESPONSE=$(curl -s -X POST "${LUMI_API_URL}/v0/pipelines" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -w "\n%{http_code}" \
  -d '{
    "name": "K6 Load Test - Lookup Mapper",
    "description": "CPU-intensive lookup mappings for k6 load tests",
    "enabled": true,
    "searchQuery": "source=\"k6-loadtest\"",
    "processors": [
      {
        "type": "lookup_mapper",
        "name": "Service category lookup",
        "enabled": true,
        "override": true,
        "lookupCsv": "service,category,priority,team\nauth-service,security,high,security-team\ndatabase,infrastructure,critical,platform-team\nmonitoring,observability,medium,sre-team\napi-gateway,frontend,high,api-team\ncache-service,infrastructure,medium,platform-team\npayment-service,business,critical,payments-team\norder-service,business,high,commerce-team"
      },
      {
        "type": "lookup_mapper",
        "name": "Log level severity lookup",
        "enabled": true,
        "override": true,
        "lookupCsv": "level,severity_num,alert_required,escalation_hours\nDEBUG,1,false,0\nINFO,2,false,0\nWARN,3,true,24\nERROR,4,true,2\nCRITICAL,5,true,0.5"
      },
      {
        "type": "arithmetic_processor",
        "name": "Calculate priority score",
        "enabled": true,
        "override": true,
        "formula": "severity_num * 10",
        "targetAttribute": {"value": "priority_score"},
        "replaceInvalidWithZero": true
      }
    ]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo -e "${GREEN}✓ Pipeline 2 created successfully${NC}"
  PIPELINE2_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  ID: $PIPELINE2_ID"
else
  echo -e "${RED}✗ Failed to create Pipeline 2 (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
fi

echo ""

# Pipeline 3: Multiple Regex Parsers (CPU intensive)
echo -e "${YELLOW}Creating Pipeline 3: Multiple Regex Pipeline${NC}"
RESPONSE=$(curl -s -X POST "${LUMI_API_URL}/v0/pipelines" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -w "\n%{http_code}" \
  -d '{
    "name": "K6 Load Test - Multiple Regex",
    "description": "Multiple regex processors for CPU load",
    "enabled": true,
    "searchQuery": "source=\"k6-loadtest\"",
    "processors": [
      {
        "type": "regex_parser",
        "name": "Extract error codes",
        "enabled": true,
        "pattern": "error[_-]?code[\"\\s:=]+([A-Z_]+)",
        "targetAttributes": [
          {"value": "error_code_extracted"}
        ]
      },
      {
        "type": "regex_parser",
        "name": "Extract endpoints",
        "enabled": true,
        "pattern": "/api/v[0-9]+/([a-z]+)",
        "targetAttributes": [
          {"value": "api_resource"}
        ]
      },
      {
        "type": "regex_parser",
        "name": "Extract order IDs",
        "enabled": true,
        "pattern": "ORD-([0-9]+)",
        "targetAttributes": [
          {"value": "order_number"}
        ]
      },
      {
        "type": "conditional_mapper",
        "name": "Set alert status",
        "enabled": true,
        "override": true,
        "targetAttribute": {"value": "should_alert"},
        "cases": [
          {
            "condition": "level=\"ERROR\"",
            "type": "static_value",
            "staticValue": "true"
          },
          {
            "condition": "level=\"CRITICAL\"",
            "type": "static_value",
            "staticValue": "true"
          },
          {
            "condition": "level=\"WARN\"",
            "type": "static_value",
            "staticValue": "maybe"
          }
        ]
      }
    ]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo -e "${GREEN}✓ Pipeline 3 created successfully${NC}"
  PIPELINE3_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  ID: $PIPELINE3_ID"
else
  echo -e "${RED}✗ Failed to create Pipeline 3 (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
fi

echo ""
echo -e "${GREEN}Done!${NC} Created pipelines for k6 load testing."
echo ""
echo "These pipelines will:"
echo "  - Match all events with source=\"k6-loadtest\""
echo "  - Run CPU-intensive processors (grok, regex, lookups)"
echo "  - Increase event-collector CPU utilization under load"
echo ""
echo "Run your k6 test now:"
echo "  cd /Users/divyanshu.mittal/code/k6"
echo "  k6 run hec-loadtest.js"
