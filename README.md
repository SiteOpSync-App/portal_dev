# portal_dev


Staff check in and out by PIN + site QR code. Admins manage users, sites and hours from `admin.html`.

**Current release: 1.24.0**

## Where each file lives
| File | Goes in |
|---|---|
| `index.html`, `app.js`, `style.css`, `invoice.js`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | GitHub (check-in page; `invoice.js` is shared with the dashboard) |
| `admin.html`, `admin.js`, `admin.css` | GitHub (admin dashboard) |
| `company logo1.png` | GitHub |
| `Code.gs` | Google Apps Script (Extensions > Apps Script in the Google Sheet), NOT in GitHub |

## Version numbers (how to tell what's loaded)
The footer of both pages shows the version, e.g. `v1.0.2`.
- Plain grey `v1.0.2`: the page and the script match, so everything is up to date.
- Amber text: the page and script versions differ. "Out of date" means press Ctrl+Shift+R, and if that doesn't fix it the GitHub files need updating. "Script needs redeploying" means Code.gs in Apps Script needs a new deployment.

The version must match in all of these (change them together, same number):
1. `APP_VERSION` at the top of `app.js` and `admin.js`
2. `SCRIPT_VERSION` at the top of `Code.gs`
3. The `?v=` numbers on the script/style links in `index.html` and `admin.html`

## Releasing a change
1. Update the files in GitHub and bump the version numbers above.
2. Paste the new `Code.gs` into Apps Script, then Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
3. Wait a minute or two for GitHub Pages, hard refresh (Ctrl+Shift+R), check the footer shows matching versions.

## Google Sheet tabs
- **Users:** Name | PIN | Status (Active/Inactive) | Role. Admin PINs must be 6-8 digits.
  Roles: `Contractor` (goes straight to Site Attendance), `QA` (straight to the QA inspection), `Contractor/QA` (sees a menu with both; the QA project defaults to the site they're checked in at), `Admin` (dashboard). Blank counts as Contractor.
- **Sites:** SiteID | SiteName | Latitude | Longitude | RadiusMetres | Status (Active/Inactive)
- **AuditLog:** Timestamp | Name | Action | Site ID | Site Name | Status | Reason | Dist | Google Maps Link | Check-Out Time | Check-Out Dist | Check-Out Map | User Comments | Admin Comments

- **Invoices** (created automatically): Invoice ID | Submitted | Contractor | Period From | Period To | Total Hours | Total Amount | Status | Breakdown. Contractors build these from "My Hours" (weekly, Monday to Sunday); hours come from the AuditLog and are worked out by the script, the contractor only enters the hourly rate for each day. Resubmitting the same week updates that invoice. Shifts with no check-out are not counted until an admin corrects them.
- **QAReports** (created automatically): Timestamp | Inspector | Site ID | Site Name | Overall | Checks | Photos (links). QA photos are saved in a Google Drive folder called "Site QA Photos" (in the Drive of the account that owns the script). Share that folder with anyone who needs to open the photo links. After first pasting Code.gs, run `setupQaFolder` once in Apps Script to give it Drive permission.
- QA checklist items are the `QA_CHECKS` list near the top of the QA section in `app.js`.

- **Users** also has columns M (Invoicing On/Off) and N (Invoice History On/Off); blank means On. Set them with the toggles in the Add/Edit user window.
- **Users** also has optional columns E-L (Business Name, Address, Company Reg No, VAT No, UTR, Email, Phone, Payment Details). They are filled in from the dashboard's Add/Edit user window and printed on that contractor's invoices.

**QAReports** also has columns H (Check Photos: the Drive file ids for each question's photos) and I (Additional Notes). Added automatically.

**Parked:** the `functions/` folder and `schema.sql` are for a possible later move to Cloudflare (D1 + R2). Don't upload them to GitHub while the app runs on Google Sheets.

**QAQuestions** (created automatically with the original three questions): ID | Question | Description | Status. Edited from the dashboard's QA Checklist tab; re-ordering swaps rows.

The FAQ shown on the login page is plain text in `index.html` (search for "Help & FAQ"). Check the wording, especially how long records are kept, matches what the company actually does.

Rules: check-in/out only within the site's RadiusMetres (125m if blank); anyone still checked in at 23:00 is closed automatically (needs `setupAutoLogoutTrigger` run once in Apps Script).

## Changelog
- **1.24.0** Daily diary (feature switch "diary"). Everyone except admin: one entry per job per day, jobs auto-listed from check-ins, notes plus before and after photos from camera or gallery, saved as a draft until submitted (Diary sheet tab, photos in the "Site Diary Photos" Drive folder). Admin: Diary tab with a month calendar coloured by job or contractor, filters, and entry detail with photos.
- **1.22.0** Project invoices (ProjectInvoices tab). Once the main contractor has responded to an application, create a numbered invoice (IGL-0001...) from its agreed lines, with optional retention, VAT (or reverse charge) and CIS. PDF view, cancel and re-invoice. Invoice numbers are never reused.
- **1.21.0** Applications for payment. Per project, Generate application claims every ticked stage not already awaiting a response or agreed (Applications / ApplicationLines tabs). Record the main contractor's response by ticking agreed lines; declined lines carry forward to the next application. Claimed stages can't be unticked. Application PDF.
- **1.20.0** Payment stages and pricing. Each project has customisable stages with a % each (must total 100) and a rate per m2 per product (Sites column K). Installations have length, height and an optional price override (Installations I-K), so price is worked out automatically. New Progress page: tick stages per installation (InstallStages tab) and the QA form unlocks when every stage is ticked. Dashboard: Stages & rates on each project card, size / price / stages columns on Installations.
- **1.19.0** Projects tab: View button opens a project overview with % of installations inspected, passed/failed/not started, per-product counts and the latest QA report for each installation. QAReports gains column T (Installation ID).
- **1.18.0** Installations tab (Installations sheet tab): the office sets up each window, door or curtain wall per project (reference, phase, elevation / level, drawings). The QA form picks from that list or "Ad hoc" for free typing. New Doors product. QA reports save the installation details (QAReports O-S).
- **1.17.0** Sites tab is now Projects (cards). Each site has Project number, Address / postcode and Installer (Sites H-J) as well as Main contractor (G). The QA form shows them when a project is chosen and each QA report saves them (QAReports K-N) and prints them in its header. QA reports end with a large-photo appendix.
- **1.16.0** Sites have a Main contractor field (Sites column G). It shows on the QA form when a project is chosen and is saved on each QA report (QAReports column K) and its PDF.
- **1.15.0** Two QA report types (Windows, Curtain Walling). Each question has an answer type (Pass/Fail/N/A, Accept/Decline or free text), a mandatory flag and a choice of which answers need a photo. QA Checklist tab has a report dropdown. QAQuestions gains columns E-H, QAReports gains column J (Report Type).
- **1.14.0** QA: a photo for every question unless the answer is N/A (up to 3 per question), plus an optional "Additional information" section with notes and extra photos. The QA report (View and PDF) shows each question's photos under it.
- **1.13.0** Admins can add, edit, re-order, deactivate and delete QA questions (QA Checklist tab, stored on the QAQuestions sheet tab). Completed reports keep the wording they were completed with.
- **1.12.1** The contractor button now just says "My invoices".
- **1.12.0** Admin: View pop-up for invoices and QA reports (with Download PDF). Contractors: "Details" tab in the bottom bar. Nicer green tick on the PIN pad.
- **1.11.0** App-style bottom navigation bar and phone back button moves up a screen instead of leaving the app. Admin: "Email" button on users with an email address opens a pre-filled onboarding draft in Outlook (the wording is in `admin.js`, search for `onboardBody`). QA report PDF opens its window straight away so pop-up blockers allow it.
- **1.10.0** Admin: QA report PDF (branded) and delete report / delete photos. Contractors can edit their own invoice details. Offline fix: the service worker now saves the main files at install, so the app opens with no signal.
- **1.9.1** Invoice buttons no longer flash up briefly for people with invoicing switched off.
- **1.9.0** Installable as a web app on phones (manifest + icons; "Install app" button on Android). To change the app icon, replace the three icon files with your own PNGs of the same sizes (192, 512, 512).
- **1.8.2** People with invoicing switched off see "My hours" and "View Hours" only, with no mention of invoices.
- **1.8.1** Failed scans (too far, GPS off, unknown or inactive site) are logged again; only wrong-PIN entries are not stored. The On site tab is replaced by an "On site" pill in the Hours table.
- **1.8.0** Wrong-PIN attempts are no longer stored. Admin can delete invoices. Contractors can view their invoices for this and last tax year with year-to-date totals. Per-user switches for Invoicing and Invoice history. Help & FAQ on the login page. Removed the roll-call print.
- **1.7.1** Removed the SitePulse/KE2 branding (and config.js); footer credit is "Built by Karl Harris" again. Fixes the offline queue not starting if a page file was missing.
- **1.7.0** Richer user records (business/address/VAT etc.) that fill in invoices, role toggles.
- **1.6.0** Admin: On site now (with printable roll call), Needs attention list, Add shift. Check-in page: works with poor signal (saved scans send later, PIN works offline once used on that phone).
- **1.5.3** Default check-in radius is now 125m (new sites and sites with no radius set).
- **1.5.2** Location picker: radius slider and box, circle resizes live and is saved with the location.
- **1.5.1** QA Reports photo viewer: large pop-out with next/previous and thumbnails.
- **1.5.0** Contractors: My Hours + daily-rate invoices (PDF). Admin: Invoices tab, "Generate an unused PIN" button.
- **1.4.0** Each site has its own check-in radius (RadiusMetres), set in the dashboard; the map picker circle follows it.
- **1.3.1** Adding a site no longer asks for a Site ID: it is filled in automatically from the site name (and kept if the site is renamed, so printed QR codes keep working).
- **1.3.0** Admin dashboard: QA Reports tab (filter, see results, view photos).
- **1.2.0** Roles: Contractor, QA, Contractor/QA and Admin decide where people land after their PIN.
- **1.1.0** Contractor menu (Site Attendance / Quality Assurance) and QA inspection form with photos.
- **1.0.2** Footer shows just the version number (amber warning only if page and script differ).
- **1.0.1** Refresh button on the admin dashboard; clearer version mismatch messages; README.
- **1.0.0** Version numbers in the footer; location picker; QR generator; admin dashboard; manual check-out; auto log-out.

Built by Karl Harris
