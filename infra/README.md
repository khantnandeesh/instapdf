# InstaPDF infrastructure

Two Terraform roots:

| Root | State | Creates |
|---|---|---|
| `infra/bootstrap/` | local (`terraform.tfstate`, git-ignored) | GCS state bucket `<project>-tfstate` (versioned, uniform access) and the required APIs |
| `infra/` | GCS bucket from bootstrap, prefix `instapdf/main` | Artifact Registry, Cloud Run `web-staging` / `web-prod`, per-env jobs bucket + runtime SA, per-env deployer SA, Workload Identity Federation, budget |

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
5. Set four GitHub **repository variables** (Settings > Secrets and variables > Actions > Variables).
   None are secret; no keys live in GitHub. Until `GCP_WIF_PROVIDER` and the
   env's deployer variable exist, the deploy jobs are skipped.
   ```sh
   gh variable set GCP_PROJECT_ID          --body "$GCP_PROJECT_ID"
   gh variable set GCP_WIF_PROVIDER        --body "$(terraform output -raw wif_provider)"
   gh variable set GCP_DEPLOYER_SA_STAGING --body "$(terraform output -json deployer_sa_emails | jq -r .staging)"
   gh variable set GCP_DEPLOYER_SA_PROD    --body "$(terraform output -json deployer_sa_emails | jq -r .prod)"
   ```
6. After the first staging and prod deploys, run `terraform plan` and confirm it
   shows no changes to the Cloud Run services (the fields gcloud writes are in
   `ignore_changes`; anything else that shows up should be added there or fixed).

If an org policy (`iam.allowedPolicyMemberDomains`) blocks `allUsers`, the
`run.invoker` binding fails; the services then need that policy relaxed for the project.

## Identity and access

| Identity | Can do | How it is scoped |
|---|---|---|
| WIF provider `github-oidc` | issue tokens at all | `repository_id == 1468806745`, `repository_owner_id == 148197396`, and either ref `refs/heads/main` (not in environment `production`) or ref `refs/tags/v*` in environment `production` |
| `gh-deploy-staging` | deploy + shift traffic on `web-staging`, push images | impersonable only by `attribute.ref = refs/heads/main` |
| `gh-deploy-prod` | deploy + shift traffic on `web-prod`, tag images | impersonable only by `attribute.environment = production` (which the condition allows only on `v*` tags) |
| `web-runtime-<env>` | objectAdmin on `<project>-jobs-<env>`, sign URLs as itself | nothing project-wide |

Both deployers have `run.developer` on their own service only, `run.viewer` on the
project (read-only, for gcloud polling), `artifactregistry.writer` on the `instapdf`
repo only, and `iam.serviceAccountUser` on their env's runtime SA only.

### One-time GitHub settings (repo owner)

Prod gating must not rely on the workflow file in the tagged commit, so GitHub
itself has to enforce it:

1. **Environment `production`** (Settings > Environments > New environment):
   Deployment branches and tags > "Selected branches and tags" > add tag rule `v*`.
   Optionally add yourself as a required reviewer.
2. **Tag ruleset** (Settings > Rules > Rulesets > New tag ruleset): target `v*`,
   enable "Restrict creations", "Restrict updates" and "Restrict deletions",
   bypass list = the repo owner only.

Without (1), the prod deploy job fails (its token cannot impersonate
`gh-deploy-prod`); without (2), anyone with write access could cut a release tag.

### Before F6 adds sensitive config

Both deployers hold project-level `run.viewer`, which can read every Cloud Run
service's configuration, including plain env vars. Before the worker adds any
sensitive setting, either pass it as a Secret Manager reference (never a plain
env var), or replace `run.viewer` with a minimal custom role.

## Job files and the 2-hour rule

Nothing writes to the jobs buckets yet. Their lifecycle rule deletes objects after
**at least 1 day** (GCS lifecycle works in whole days). It is a backstop and does
**not** meet the charter's 2-hour rule.

The 2-hour guarantee will come from a scale-to-zero cleaner that **must ship with
F6 (server worker), before any upload code goes live**: either Cloud Scheduler
every 15 minutes calling an authenticated cleanup endpoint on the worker, or a
Cloud Tasks delete enqueued per upload.

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
| `deploy-staging.yml` | CI succeeded for a push to `main`; manual (main only) | build `apps/web/Dockerfile` at the tested sha, push `web:<sha>`, deploy `web-staging` with `APP_VERSION=<sha>`, smoke test `/api/health` (200 and matching version) |
| `deploy-prod.yml` | tag `v*` | require the tagged commit to be on `main` and `web:<sha>` to exist (prod never builds), record the live revision, deploy `web-prod` with **0% traffic** tagged `candidate`, smoke test it, tag the image `web:<vX.Y.Z>`, shift 100% traffic, smoke test the live URL. If anything fails after the shift, traffic goes back to the recorded revision automatically. |

Terraform ignores the image, env vars, revision name, template labels/annotations
and the traffic split, so CI deploys and rollbacks are not reverted by the next
`terraform apply`. Because env is ignored, changing `APP_ENV` / `JOBS_BUCKET` later
means `gcloud run services update <svc> --update-env-vars ...` (or temporarily
removing `env` from `ignore_changes`).

## Rollback (one command)

```sh
gcloud run revisions list --service web-prod --region us-central1     # find the last good REV
gcloud run services update-traffic web-prod --region us-central1 --to-revisions=REV=100
```

A failed prod smoke test never receives traffic, so rollback is only needed for
problems found after the deploy job has finished (a failure during the job rolls back on its own).

## Cost estimate (monthly, idle to light traffic)

Prices for us-central1 (Tier 1), USD 1 ≈ INR 85.

| Item | Free tier | Expected use | Cost |
|---|---|---|---|
| Cloud Run (2 services, request-based billing, min 0) | 180k vCPU-s, 360k GiB-s, 2M requests | idle: 0; light testing well inside free tier | ₹0 |
| Artifact Registry storage | 0.5 GB | last 10 images + release (`v*`) images, shared layers, ~0.5–1.5 GB | ₹0–10 |
| GCS jobs buckets (2) | 5 GB-month (US regions) | empty until F6; then short-lived files, no soft delete | ₹0 |
| GCS state bucket | same | a few KB × ≤10 versions | ₹0 |
| Logging | 50 GiB ingest | far below | ₹0 |
| WIF, IAM, budgets, service accounts | free | | ₹0 |
| Egress | 1 GB/month free (North America) | light | ₹0–10 |
| **Total** | | | **~₹0–20, well under ₹1000** |

Worst-case ceiling: max instances are capped (3 staging, 5 prod), and the budget
alerts at ₹500 / ₹800 / ₹1000.
