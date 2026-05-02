# Crucible GCP Alerts

Create these once per GCP project after enabling Cloud Run, Cloud SQL, and Billing Budget APIs.

```bash
gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT_ID" \
  --display-name="Crucible beta budget" \
  --budget-amount=50USD \
  --threshold-rule=percent=0.5,basis=current-spend \
  --threshold-rule=percent=0.8,basis=current-spend \
  --threshold-rule=percent=1.0,basis=current-spend
```

Recommended Cloud Monitoring alerts:

- Cloud Run `run.googleapis.com/request_count` with 5xx ratio > 2% over 5 minutes.
- Cloud Run `run.googleapis.com/container/cpu/utilizations` > 80% over 10 minutes.
- Cloud SQL `cloudsql.googleapis.com/database/cpu/utilization` > 80% over 10 minutes.
- Cloud SQL `cloudsql.googleapis.com/database/disk/utilization` > 75%.

Keep Cloud SQL automated backups and PITR enabled with at least 7 days of retention.
