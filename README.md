# DOKS SaaS Platform: Scalable Web Application on DigitalOcean Kubernetes

> **Case Study**: Deploying a scalable, highly available SaaS web application on DigitalOcean Kubernetes Service (DOKS) with load balancing, horizontal pod autoscaling, and cost optimisation.

---

## Architecture Overview

```
                        Internet
                           │
                    ┌──────▼───────┐
                    │  DigitalOcean │
                    │ Load Balancer │  ← Round-robin traffic distribution
                    └──────┬───────┘
                           │
              ┌────────────▼─────────────┐
              │    DOKS Cluster           │
              │  ┌────────┐ ┌────────┐   │
              │  │ Pod 1  │ │ Pod 2  │   │  ← Minimum 2 pods (HA)
              │  │Node.js │ │Node.js │   │
              │  └────────┘ └────────┘   │
              │       HPA (2–10 pods)    │  ← Auto-scales on CPU/Memory
              └──────────────────────────┘
                           │
              ┌────────────▼─────────────┐
              │  DO Container Registry   │  ← Private image storage
              └──────────────────────────┘
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| kubectl | 1.28+ | https://kubernetes.io/docs/tasks/tools/ |
| doctl | 1.100+ | `brew install doctl` or https://docs.digitalocean.com/reference/doctl/ |

---

## Step-by-Step Deployment Guide

### Step 1 — Authenticate with DigitalOcean

```bash
# Generate a Personal Access Token at: https://cloud.digitalocean.com/account/api/tokens
doctl auth init
# Paste your token when prompted
```

### Step 2 — Create a DOKS Cluster

```bash
doctl kubernetes cluster create saas-cluster \
  --region blr1 \
  --node-pool "name=worker-pool;size=s-2vcpu-4gb;count=2;auto-scale=true;min-nodes=2;max-nodes=5" \
  --wait

# Merge kubeconfig so kubectl works
doctl kubernetes cluster kubeconfig save saas-cluster

# Verify connection
kubectl get nodes
```

> **Cost tip**: `s-2vcpu-4gb` nodes cost ~$24/month each. A 2-node cluster costs ~$48/month base.

### Step 3 — Create a Container Registry

```bash
# Create a private registry (free tier: 1 repo, 500MB)
doctl registry create do-case-study --region blr1

# Login Docker to the registry
doctl registry login
```

### Step 4 — Build and Push the Docker Image

```bash
cd app/

# Build the image
docker build -t registry.digitalocean.com/saas-registry/saas-app:latest .

# Push to DO Container Registry
docker push registry.digitalocean.com/saas-registry/saas-app:latest
```

### Step 5 — Grant Cluster Access to Registry

```bash
# Integrate registry with cluster (creates imagePullSecret automatically)
doctl registry kubernetes-manifest | kubectl apply -f -
```

### Step 6 — Deploy to Kubernetes

```bash
# Update the image name in deployment.yaml first:
# Replace: registry.digitalocean.com/YOUR_REGISTRY/saas-app:latest
# With:    registry.digitalocean.com/saas-registry/saas-app:latest

# Apply all manifests in order
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-deployment.yaml
kubectl apply -f k8s/02-service.yaml
kubectl apply -f k8s/03-hpa.yaml
kubectl apply -f k8s/04-pdb.yaml
```

### Step 7 — Verify Deployment

```bash
# Check pods are running (should see 2 pods)
kubectl get pods -n saas-app

# Check the Load Balancer (wait 2-3 min for external IP)
kubectl get service saas-app-service -n saas-app

# Check HPA status
kubectl get hpa -n saas-app

# View logs
kubectl logs -l app=saas-app -n saas-app --tail=50
```

### Step 8 — Access the Application

```bash
# Get the external Load Balancer IP
LB_IP=$(kubectl get svc saas-app-service -n saas-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Application URL: http://$LB_IP"

# Open in browser
curl http://$LB_IP/health
```

---

## Testing Autoscaling

```bash
# Install hey (HTTP load generator)
brew install hey      # macOS
# or: go install github.com/rakyll/hey@latest

# Generate load to trigger HPA (run for 2-3 minutes)
hey -z 3m -c 50 http://$LB_IP/stress?duration=2

# In another terminal — watch HPA react in real time
kubectl get hpa saas-app-hpa -n saas-app --watch

# Watch pods scale up
kubectl get pods -n saas-app --watch
```

Expected output: pods scale from 2 → up to 10 as CPU > 50%, then scale back down after load stops.

---

## Cost Analysis

| Resource | Config | Monthly Cost |
|----------|--------|-------------|
| DOKS Control Plane | Managed | **Free** |
| Worker Nodes (2x `s-1vcpu-2gb`) | Base | ~$24 |
| Worker Nodes (max 5x, autoscaled) | Peak | ~$60 |
| DigitalOcean Load Balancer | Small | ~$15 |
| Container Registry | Starter | **Free** |
| Bandwidth | 2TB included | **Free** |
| **Total (normal load)** | | **~$39/month** |
| **Total (peak load)** | | **~$75/month** |

### Cost Optimisations Applied

1. **Free DOKS control plane** — DigitalOcean doesn't charge for the Kubernetes control plane (saves ~$72/month vs AWS EKS)
2. **HPA min=2** — Never runs more than needed; scales down after load drops
3. **Small Load Balancer** — `lb-small` sufficient for this workload
4. **Resource limits** — CPU/memory limits prevent any single pod from over-consuming
5. **Scale-down stabilisation** — 5-minute cooldown prevents thrashing and unnecessary scale-up/down cycles

---

## Cleanup

```bash
# Delete all resources
kubectl delete namespace saas-app

# Delete the cluster (stops billing for nodes)
doctl kubernetes cluster delete saas-cluster

# Delete Load Balancer (if not auto-deleted)
doctl compute load-balancer list
doctl compute load-balancer delete <LB_ID>
```

---

## Repository Structure

```
doks-case-study/
├── app/
│   ├── server.js          # Node.js Express application
│   ├── package.json       # Dependencies
│   ├── Dockerfile         # Multi-stage production Docker build
│   └── .dockerignore      # Exclude unnecessary files from image
├── k8s/
│   ├── 00-namespace.yaml  # Kubernetes namespace
│   ├── 01-deployment.yaml # App deployment with probes and resource limits
│   ├── 02-service.yaml    # LoadBalancer service with DO annotations
│   ├── 03-hpa.yaml        # Horizontal Pod Autoscaler (CPU + Memory)
│   └── 04-pdb.yaml        # Pod Disruption Budget for HA
└── README.md              # This file
```

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| 2 minimum replicas | High availability — 1 pod can fail without downtime |
| Rolling update strategy | Zero-downtime deployments |
| CPU target at 50% | Leaves headroom before pods are overwhelmed |
| 5-min scale-down window | Prevents cost thrashing from brief traffic spikes |
| Non-root container user | Security best practice |
| Multi-stage Docker build | Smaller image (~120MB vs ~900MB) = faster pulls |
| PodDisruptionBudget | Ensures HA during node maintenance/upgrades |

---

*Prepared by Shubh Kohli — DigitalOcean TAM Case Study*
