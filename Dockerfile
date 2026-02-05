# Dockerfile for k6 HEC load testing
# Extends official k6 image with our test script

FROM grafana/k6:latest

# Copy the k6 test script into the image
COPY hec-loadtest-k8s.js /scripts/hec-loadtest-k8s.js

# Set working directory
WORKDIR /scripts

# k6 is the entrypoint (inherited from base image)
# Default: run our script
# K8s will override with custom args: --vus=1000 --duration=1h
ENTRYPOINT ["k6"]
CMD ["run", "/scripts/hec-loadtest-k8s.js"]
