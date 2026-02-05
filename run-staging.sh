#!/bin/bash
# Manually trigger k6 load test on staging cluster
# Usage: ./run-staging.sh

set -e

PROFILE="iow-ent-staging"
CLUSTER="95f7b151"
REGION="us-east-1"
JOB_NAME="k6-staging-manual-$(date +%s)"

# 1. Ensure AWS SSO session is active
echo "Checking AWS SSO session..."
if ! aws sts get-caller-identity --profile "$PROFILE" &>/dev/null; then
  echo "SSO session expired. Logging in..."
  aws sso login --profile "$PROFILE"
fi

# 2. Ensure kubectl is pointing to staging cluster
CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "")
if [[ "$CURRENT_CONTEXT" != *"$CLUSTER"* ]]; then
  echo "Switching kubectl to staging cluster..."
  aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION" --profile "$PROFILE"
fi

# 3. Trigger the job
echo ""
echo "Triggering k6 load test: $JOB_NAME"
kubectl create job --from=cronjob/k6-hec-loadtest-staging "$JOB_NAME" -n default

echo ""
sleep 5
kubectl get pods -n default -l "job-name=$JOB_NAME" --no-headers

echo ""
echo "Useful commands:"
echo "  kubectl get pods -n default -l job-name=$JOB_NAME"
echo "  kubectl logs -f \$(kubectl get pods -n default -l job-name=$JOB_NAME -o name | head -1)"
echo "  kubectl delete job $JOB_NAME -n default"
