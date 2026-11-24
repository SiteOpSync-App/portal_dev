# Setting up a new client (or the dev site)

Each client has its own Google Sheet + Apps Script, and its own Cloudflare Pages project built from the same GitHub repo.
Names used below: client id `acme`, Pages project `acme-siteopsync` (gives `https://acme-siteopsync.pages.dev`). For dev use id `dev`, project `dev-siteopsync`.

## 1. Google Sheet and Apps Script
1. Open the template sheet > File > Make a copy. In the copy clear the real data: Users (keep a header row and add the first Admin with a 6+ digit PIN), AuditLog, QAReports, Invoices, Applications, ApplicationLines, ProjectInvoices, InstallStages, Installations, QAQuestions, Sites. Delete the Settings tab if present.
2. Extensions > Apps Script. Check `Code.gs` is the current release. Edit the constants at the top if needed: `ADMIN_CONTACT` (the name in the "site inactive" message) and `PHOTO_FOLDER` (give each client its own name if they share one Google account).
3. Run `setupQaFolder` once (approve the permissions) and `setupAutoLogoutTrigger` once.
4. Deploy > New deployment > Web app: execute as Me, who has access: Anyone. Copy the web app URL (ends `/exec`). For later releases: Deploy > Manage deployments > pencil > New version.

## 2. Superadmin
1. Open the superadmin site, + Add client: id `acme`, company name, the Pages address (step 3) and the Apps Script URL.
2. Switch on the sections they pay for. Applications needs Installations & progress.
3. Open the client card > Apps Script setup. In the client's Apps Script: Project settings > Script properties, add `REGISTRY_URL`, `CLIENT_ID` and `CLIENT_KEY` exactly as shown.
4. Changes reach the client app within about 5 minutes. Until the three properties are set, the client uses the Settings tab in its own sheet (everything on).

## 3. Cloudflare Pages project
1. Workers & Pages > Create > Pages > Connect to Git > the SiteOpSync repo. Project name: `acme-siteopsync` (cannot be renamed later).
2. Build command `node build.js`. Build output directory `dist`.
3. Settings > Environment variables (Production):
   - `APPS_SCRIPT_URL` the `/exec` URL from step 1 (required: the build fails without it)
   - `CLIENT_ID` `acme`
   - `COMPANY_NAME` e.g. `Acme Glazing Ltd`
   - `SHORT_NAME` e.g. `Acme` (optional; defaults to the company name without Ltd/Limited)
   - `LOGO` file name of the client's logo, committed in the repo root (default `company logo1.png`)
   - `SITE_ENV` `dev` for the dev site only (adds a DEV ribbon); leave out for clients
   - `NODE_VERSION` `20`
4. Save and deploy. Open the site: the footer should show the version, and the company name and logo should be the client's.

## 4. Test before handing over
- Admin PIN logs in to the dashboard; the tabs match the switched-on sections.
- A contractor PIN sees only the switched-on sections.
- Switch a section off in the superadmin, wait up to 5 minutes, refresh: it disappears, and its requests are refused.
- Add a site, scan a QR code, submit a QA report (if QA is on).

## Releasing a change to every client
1. Push to GitHub: every Pages project rebuilds from the same repo.
2. For each client, paste the new `Code.gs` into its Apps Script and Deploy > Manage deployments > New version.
3. Hard refresh (Ctrl+Shift+R) and check the footer shows matching versions.
