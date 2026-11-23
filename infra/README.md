# InstaPDF infrastructure

Two Terraform roots:

| Root | State | Creates |
|---|---|---|
| `infra/bootstrap/` | local (`terraform.tfstate`, git-ignored) | GCS state bucket `<project>-tfstate` (versioned, uniform access) and the required APIs |
| `infra/` | GCS bucket from bootstrap, prefix `instapdf/main` | Artifact Registry, Cloud Run `web-staging` / `web-prod`, jobs bucket, runtime + deployer service accounts, Workload Identity Federation, budget |

Everything scales to zero. No VMs, no Cloud SQL, `min_instance_count = 0`.

## One-time bootstrap

1. **Project owner, in the Cloud Console** (APIs & Services > Library), enable:
   Service Usage API, Cloud Resource Manager API, Cloud Billing API.
   Terraform cannot enable APIs until Service Usage itself is on.
2. Authenticate as an identity with Owner (or Editor + Project IAM Admin + Service Usage Admin)
   on the project. Never commit the key file:
   ```sh
   KEY=$(mktemp) && printf '%s' "$GCP_SA_KEY_JSON" > "$KEY"
   gcloud auth activate-service-account --key-file="$KEY"
   export GOOGLE_APPLICATION_CREDENTIALS="$KEY"
   ```
3. Bootstrap (state bucket + APIs):
   ```sh
   cd infra/bootstrap
   terraform init
   terraform apply -var="project_id=$GCP_PROJECT_ID"
   ```
4. Main root:
   ```sh
   cd infra
   terraform init -backend-config="bucket=${GCP_PROJECT_ID}-tfstate"
   terraform apply -var="project_id=$GCP_PROJECT_ID" \
                   -var="billing_account_id=XXXXXX-XXXXXX-XXXXXX"   # optional, see Budget
   ```
5. Set three GitHub **repository variables** (Settings > Secrets and variables > Actions > Variables).
   None are secret; no keys live in GitHub.
   ```sh
   gh variable set GCP_PROJECT_ID   --body "$GCP_PROJECT_ID"
   gh variable set GCP_WIF_PROVIDER --body "$(terraform output -raw wif_provider)"
   gh variable set GCP_DEPLOYER_SA  --body "$(terraform output -raw deployer_sa_email)"
   ```

If an org policy (`iam.allowedPolicyMemberDomains`) blocks `allUsers`, the
`run.invoker` binding fails; the services then need that policy relaxed for the project.

## Budget

`google_billing_budget` is created only when `billing_account_id` is set. It alerts
billing admins at 50%, 80% and 100% of INR 1000 actual spend, plus 100% forecast.

- The identity running `terraform apply` needs **Billing Account Costs Manager**
  (`roles/billing.costsManager`) on the billing account. Otherwise leave
  `billing_account_id` empty and have the owner create the budget in
  Billing > Budgets & alerts with the same thresholds.
- The budget currency must match the billing account's currency (INR).

## Deploys

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy-staging.yml` | push to `main`, manual | build `apps/web/Dockerfile`, push `web:<sha>`, deploy `web-staging`, smoke test `/api/health` |
| `deploy-prod.yml` | tag `v*` | reuse `web:<sha>` from staging (build if missing), deploy `web-prod` with **0% traffic** tagged `candidate`, smoke test the candidate URL, shift 100% traffic, smoke test again |

Terraform ignores the container image and traffic split, so CI deploys and manual
rollbacks are not reverted by the next `terraform apply`.

## Rollback (one command)

```sh
gcloud run revisions list --service web-prod --region us-central1     # find the last good REV
gcloud run services update-traffic web-prod --region us-central1 --to-revisions=REV=100
```

A failed prod smoke test never receives traffic, so rollback is only needed for
problems found after the shift.

## Cost estimate (monthly, idle to light traffic)

Prices for us-central1 (Tier 1), USD 1 ≈ INR 85.

| Item | Free tier | Expected use | Cost |
|---|---|---|---|
| Cloud Run (2 services, request-based billing, min 0) | 180k vCPU-s, 360k GiB-s, 2M requests | idle: 0; light testing well inside free tier | ₹0 |
| Artifact Registry storage | 0.5 GB | ≤10 images kept by cleanup policy, shared layers, ~0.5–1.5 GB | ₹0–10 |
| GCS jobs bucket | 5 GB-month (US regions) | files deleted within 1 day, no soft delete | ₹0 |
| GCS state bucket | same | a few KB × ≤10 versions | ₹0 |
| Logging | 50 GiB ingest | far below | ₹0 |
| WIF, IAM, budgets, service accounts | free | | ₹0 |
| Egress | 1 GB/month free (North America) | light | ₹0–10 |
| **Total** | | | **~₹0–20, well under ₹1000** |

Worst-case ceiling: max instances are capped (3 staging, 5 prod), and the budget
alerts at ₹500 / ₹800 / ₹1000.
