# Reading index

A remote personal reading index. You mark a page or a passage from the desktop. This service fetches and stores it, builds a PageIndex-style heading tree (no embeddings), and runs a bounded optimize loop. Any model that speaks MCP can browse the tree. A text PDF of the same article is written for Notability's Import from Google Drive.

This is not part of PlantScout. Nothing under `plant-id-travel-app/` is required.

The GitHub CLI available when this directory was added is read-only and cannot create a repository. The service lives in `reading-index/` so it can be copied into its own repo later. No live GCP project was attached: `gcloud` was not installed, so nothing here has been deployed.

## What a human must connect before the first real save

1. A GCP project with billing, and `gcloud` authenticated as someone who can create Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry, and Cloud Scheduler.
2. Build and apply. From `reading-index/`:

   ```bash
   ./scripts/deploy.sh YOUR_PROJECT_ID
   ```

   Or apply Terraform yourself after pushing an image to Artifact Registry. `terraform.tfvars.example` lists the variables. There is no default project id.
3. Read the generated tokens (they are not in this repo):

   ```bash
   gcloud secrets versions access latest --secret reading-index-save-token
   gcloud secrets versions access latest --secret reading-index-mcp-token
   ```

   Open the Cloud Run URL, paste the save token into the capture page, and save a URL or a selection. The bookmarklet is built in the browser from that token.
4. Optional Google Drive, so Notability can import the PDF. The upload runs as you, with the refresh token from `gcloud auth application-default login`. On the first save it finds or creates a folder named Reading in your My Drive and puts the PDF there. Commands for this project are in [Turn on Drive upload](#turn-on-drive-upload). In Notability, use Import from Google Drive. Notability has no API; this service does not create Notability notes and does not ship an Apple Shortcut.
5. Optional model summaries. Add a real key as a new version of `reading-index-model-api-key` and set `MODEL_BASE_URL` to an OpenAI-compatible `/v1` base (and `MODEL_NAME` if needed). Without those, summaries stay extractive. The placeholder value `unused` is ignored. No Vertex calls are made.

Until those exist, `POST /save` has nowhere to run except a local process with tokens you choose yourself.

## Behavior

`POST /save` with `Authorization: Bearer $SAVE_TOKEN` accepts:

```json
{ "url": "https://example.com/story", "title": "", "text": "", "source_kind": "page" }
```

`source_kind` is `page`, `selection`, or `pdf`. If `url` is set and `text` is empty, the server fetches the page and extracts the title, headings, and body. Private, link-local, and metadata addresses are refused. The original text and a generated PDF go to Cloud Storage when `GCS_BUCKET` is set, or to `DATA_DIR` in tests and local runs. The document is inserted as `pending`, then the tree is built in the same request. Status becomes `ready`, or `failed` with `error` stored. Drive upload is skipped, and recorded as skipped, when Drive credentials are not configured. A Drive failure does not fail the save. With a user refresh token, the PDF is uploaded into a folder named Reading in that user's My Drive, or into `DRIVE_FOLDER_ID` when that is set.

The tree:

- The library is the set of documents.
- A page or PDF is split on markdown headings into section nodes. Heading level sets `parent_id`.
- A selection is one node, even if the highlight contains heading marks.
- Each node has a title, a summary, and a body. The first summary is the opening text. `page_start` and `page_end` are estimated at about 3000 characters per page.

`POST /internal/optimize` (Cloud Scheduler, `OPTIMIZE_TOKEN`, or `SAVE_TOKEN` if the optimize token is unset) runs one bounded pass, default 20 nodes or documents:

- builds trees for `pending` documents and retries `failed` ones
- splits a section whose body is longer than 2400 characters
- merges adjacent leaf siblings that are both shorter than 280 characters
- replaces a missing or placeholder summary with the first sentence or two, or with the model when `MODEL_API_KEY` and `MODEL_BASE_URL` are both set
- reads the latest `loop_runs` row first and skips an edit whose signature is already recorded there
- writes one `loop_runs` row with `considered`, `changed`, `skipped`, and why

There is no second queue. Pending work that does not fit in the cap waits for the next scheduler tick.

## MCP

Stateless Streamable HTTP JSON-RPC on `POST /mcp` with `Authorization: Bearer $MCP_TOKEN`. `GET /mcp` returns 405. Tools:

- `browse` with no arguments lists the library. With `document_id` it returns that document's section tree. Titles and summaries only.
- `read_nodes` with `node_ids` returns body text for those nodes.

Cursor client config:

```json
{
  "mcpServers": {
    "reading-index": {
      "url": "https://YOUR_CLOUD_RUN_URL/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

A call looks like:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "browse", "arguments": {} } }
```

## Capture

`GET /` is a page where you paste a URL or text and save it. The save token is typed into the page and kept in `localStorage`. It is not rendered by the server. The bookmarklet posts the current page URL, and the selection when there is one, to `/save`. Fetching and indexing happen on the server. Some sites' content security policies block bookmarklet `fetch`; the form is the fallback.

## Local run

```bash
cd reading-index
npm install
SAVE_TOKEN=dev-save MCP_TOKEN=dev-mcp npm run dev
```

Without `DATABASE_URL` (or `INSTANCE_CONNECTION_NAME` plus `DB_USER`, `DB_PASSWORD`, and `DB_NAME`) the process uses an in-memory repository. Originals and PDFs go to `./data`. Production mode (`NODE_ENV=production`, set in the image) refuses to start without tokens, a database, and `GCS_BUCKET`.

Local Drive upload reads `DRIVE_CREDENTIALS_JSON`, or the authorized-user file at `DRIVE_CREDENTIALS_FILE` (the ADC JSON `gcloud auth application-default login` writes). Cloud Run receives `DRIVE_CREDENTIALS_JSON` from Secret Manager when `enable_drive` is true.

Schema: `sql/schema.sql`. Documents have the requested columns plus `error`, `original_uri`, `pdf_uri`, `drive_file_id`, and `drive_status` so a failed build and the PDF location can be stored.

## Tests

```bash
npm test
```

Covers heading split, single-node selections, optimizer split / merge / summary, the identical-edit guard, the pass cap, and that `browse` does not return bodies.

## GCP shape

| Piece | Choice |
| --- | --- |
| Compute | One Cloud Run service |
| Database | Cloud SQL Postgres 16, `db-f1-micro`, zonal, 10 GB SSD |
| Objects | One bucket, public access prevented |
| Secrets | Save token, MCP token, optimize token, DB password, model API key, optional user Drive OAuth JSON |
| Schedule | Cloud Scheduler `POST /internal/optimize` every 15 minutes |
| Not used | Document AI, Vertex, Pub/Sub, Workflows |

Terraform state contains generated passwords and tokens. Keep the state private. Cloud Run allows unauthenticated HTTP so the capture page and bookmarklet can reach it; `/save`, `/mcp`, and `/internal/optimize` still require bearer tokens. An organization policy that blocks `allUsers` as `run.invoker` will reject the public IAM binding; the capture page needs that binding or an equivalent front door.

To destroy the database later, set `deletion_protection = false` on `google_sql_database_instance.postgres` and apply again before `terraform destroy`.

## Turn on Drive upload

This deployment is project `resonant-apex-447322-t6`. Cloud Run is [https://reading-index-q56uyiyzxq-uc.a.run.app](https://reading-index-q56uyiyzxq-uc.a.run.app). The image is `us-central1-docker.pkg.dev/resonant-apex-447322-t6/reading-index/app:latest`.

The running service is the previous image. Rebuild it before `terraform apply`, or Cloud Run keeps the old Drive upload code. Saves, the index, and the Cloud Storage PDF already work. These commands only turn on user-OAuth Drive upload.

From the repo root on your Mac:

1. Sign in. A browser window opens. The script requests `https://www.googleapis.com/auth/drive.file` plus `openid` and `https://www.googleapis.com/auth/userinfo.email`, then prints the ADC JSON path.

   ```bash
   ./reading-index/scripts/drive-login.sh
   ```

2. Set the quota project, then enable the Drive API. The quota project is written into the ADC file, so do this before uploading the secret.

   ```bash
   gcloud auth application-default set-quota-project resonant-apex-447322-t6
   gcloud services enable drive.googleapis.com --project=resonant-apex-447322-t6
   ```

3. Upload that ADC JSON as a new version of secret `reading-index-drive-credentials`. If the login script printed a different path, use that path.

   ```bash
   gcloud secrets versions add reading-index-drive-credentials \
     --data-file="$HOME/.config/gcloud/application_default_credentials.json" \
     --project=resonant-apex-447322-t6
   ```

4. Rebuild and push the image.

   ```bash
   gcloud builds submit reading-index \
     --tag us-central1-docker.pkg.dev/resonant-apex-447322-t6/reading-index/app:latest \
     --project=resonant-apex-447322-t6
   ```

5. Apply Terraform with Drive enabled. This mounts the secret as `DRIVE_CREDENTIALS_JSON`. The app finds or creates the Reading folder, so this apply does not set a folder id.

   ```bash
   terraform -chdir=reading-index/terraform init
   terraform -chdir=reading-index/terraform apply \
     -var="project_id=resonant-apex-447322-t6" \
     -var="region=us-central1" \
     -var="container_image=us-central1-docker.pkg.dev/resonant-apex-447322-t6/reading-index/app:latest" \
     -var="enable_drive=true"
   ```

Save a page at the Cloud Run URL. The PDF is in the Reading folder in your Google Drive. In Notability, use Import from Google Drive.
