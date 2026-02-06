# k6 HEC Load Test

Load testing for Lumi event collector via Splunk HEC integration using [k6](https://k6.io/).

## Overview

Generates high-volume synthetic events against Lumi's HEC endpoint to stress-test event ingestion and pipeline processing. Runs as a Kubernetes CronJob with 8 parallel pods, each driving 1000 virtual users (~80,000 events/sec total).

## Environments

| Environment | HEC Endpoint | Docker Image | CronJob |
|---|---|---|---|
| Dev | `splunk-hec.lumi-ent-v1.dev.imply.io` | `repo.cnc.imply.io/docker-local/k6-hec-loadtest-divy:v1` | `k8s/cronjob.yaml` |
| Staging | `splunk-hec.lumi-ent-v1.staging.imply.io` | `791934400897.dkr.ecr.us-east-1.amazonaws.com/k6-hec-loadtest-divy:staging-v1` | `k8s/cronjob-staging.yaml` |

## Pipelines

### Dev
- Grok parser (CPU-intensive regex)
- Lookup mapper (service category + severity lookups)
- Multiple regex extractors (error codes, endpoints, order IDs)

### Staging
- Value mapper (`_indexTime`, static host override)
- Redaction processor (SHA-256 hash user IDs, redact emails and IPs)

## Quick Start

### Run locally
```bash
# Dev (50 VUs, staged load)
k6 run hec-loadtest.js

# Staging (5 VUs, 30s)
k6 run --vus=5 --duration=30s hec-loadtest-k8s-staging.js
```

### Trigger on Kubernetes
```bash
# Staging (handles SSO login + kubectl context)
./run-staging.sh
```

### Build and push images

#### Dev (JFrog)
```bash
docker build -f Dockerfile -t repo.cnc.imply.io/docker-local/k6-hec-loadtest-divy:v1 .
docker push repo.cnc.imply.io/docker-local/k6-hec-loadtest-divy:v1
```

#### Staging (ECR)
```bash
docker buildx build --platform linux/amd64 -f Dockerfile.staging \
  -t 791934400897.dkr.ecr.us-east-1.amazonaws.com/k6-hec-loadtest-divy:staging-v1 --push .
```

> **Note:** Must build with `--platform linux/amd64` for EKS nodes (Apple Silicon builds won't work).

### Deploy CronJob
```bash
# Staging
kubectl apply -f k8s/cronjob-staging.yaml
```

CronJobs run daily at 16:00 UTC (8 AM PST). Each run lasts 1 hour.

## Files

| File | Description |
|---|---|
| `hec-loadtest.js` | Local dev load test (50 VUs, staged) |
| `hec-loadtest-k8s.js` | K8s dev load test (1000 VUs/pod) |
| `hec-loadtest-k8s-staging.js` | K8s staging load test (1000 VUs/pod) |
| `create-pipelines.sh` | Creates dev pipelines via API |
| `run-staging.sh` | Triggers staging load test on-demand |
| `test-timestamps.js` | Timestamp distribution utility |
| `Dockerfile` | Dev Docker image |
| `Dockerfile.staging` | Staging Docker image |
| `k8s/cronjob.yaml` | Dev CronJob manifest |
| `k8s/cronjob-staging.yaml` | Staging CronJob manifest |

## AWS Setup (Staging)

```bash
# Login
aws sso login --profile iow-ent-staging

# Connect to cluster
aws eks update-kubeconfig --name 95f7b151 --region us-east-1 --profile iow-ent-staging

# ECR login (for pushing images)
aws ecr get-login-password --region us-east-1 --profile iow-ent-staging | \
  docker login --username AWS --password-stdin 791934400897.dkr.ecr.us-east-1.amazonaws.com
```
