const APPS_SCRIPT_URL = SITE_CONFIG.appsScriptUrl;   // set per deployment in config.js

// If nobody scans anything for this long, the PIN is cleared and the PIN screen returns.
const IDLE_LIMIT_MS = 2 * 60 * 1000;

// --- VERSION: current release is below. Keep ALL files on the same number (see README.md) ---
const APP_VERSION = "1.26.0";
let lastScriptV = "";

function cmpVer(a, b) {
    const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
    }
    return 0;
}

function showVersion(scriptV) {
    const el = document.getElementById("version-line");
    if (!el) return;
    if (scriptV) lastScriptV = scriptV;
    let text = "v" + APP_VERSION;
    let tip = "";
    const c = lastScriptV ? cmpVer(APP_VERSION, lastScriptV) : 0;
    if (c < 0) {
        text += " - out of date (latest is v" + lastScriptV + "), press Ctrl+Shift+R";
        tip = "Latest release is v" + lastScriptV + ". Hard refresh; if it stays on this version, the GitHub files need updating (see README).";
    } else if (c > 0) {
        text += " - script needs redeploying (script is v" + lastScriptV + ")";
        tip = "This page is newer than the script. Paste Code.gs into Apps Script and deploy a new version (see README).";
    }
    el.textContent = text;
    el.title = tip;
    el.classList.toggle("mismatch", c !== 0);
}

let userName = "";
let userSites = [];
let wasCheckedIn = false;
let checkedInSiteId = "";
let userRole = "Contractor";
let userCanInvoice = true;
let features = { attendance: true, qa: true, progress: true, applications: true, hours: true, qr: true, diary: true };   // sections this client has switched on
let loggedIn = false;
let currentScreen = "pin";
let atSentinel = false;   // true while the browser history holds one extra entry for "not on the home screen"
let ignorePop = 0;
let enteredPin = "";
let currentAction = "Check-In";
let html5QrCode = null;
let busy = false;
let handlingScan = false;
let idleTimer = null;
let pendingScan = null;

// --- Backend helper ---
// text/plain avoids a CORS preflight, which Apps Script can't answer.
async function callBackend(payload) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    showVersion(data.version);
    return data;
}

// --- Idle timeout / log out ---
function startIdleTimer(ms) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { appReload(); }, ms || IDLE_LIMIT_MS);
}

function logout() {
    clearTimeout(idleTimer);
    appReload(); // clears the PIN from memory and stops the camera
}

// --- PIN Pad Logic ---
function pressKey(num) {
    if (busy) return;
    if (enteredPin.length < 8) {
        enteredPin += num;
        updatePinDots();
    }
}

function clearPin() {
    if (busy) return;
    enteredPin = "";
    updatePinDots();
    document.getElementById("pin-error").innerText = "";
}

function updatePinDots() {
    const dots = "●".repeat(enteredPin.length) + "○".repeat(Math.max(0, 4 - enteredPin.length));
    document.getElementById("pin-dots").innerText = dots;
}

async function submitPin() {
    if (busy) return;
    const errorEl = document.getElementById("pin-error");

    if (enteredPin.length < 4) {
        errorEl.innerText = "Please enter your PIN.";
        return;
    }

    busy = true;
    errorEl.innerText = "Checking PIN...";

    try {
        const result = await callBackend({ type: "verify", pin: enteredPin });

        if (result.status !== "SUCCESS") {
            errorEl.innerText = (result.reason === "Invalid or Inactive PIN")
                ? "PIN not recognised. Try again."
                : (result.reason || "Something went wrong. Try again.");
            enteredPin = "";
            updatePinDots();
            return;
        }

        if (result.role === "Admin") {
            sessionStorage.setItem("adminToken", result.token);
            sessionStorage.setItem("adminName", result.name);
            location.href = "admin.html";
            return;
        }

        errorEl.innerText = "";
        features = result.features || features;
        const home = roleHome(result.role || "Contractor");
        if (!home) {
            errorEl.innerText = "Nothing is switched on for your account yet. Please ask an admin.";
            enteredPin = "";
            updatePinDots();
            return;
        }
        pinHash = await sha256(enteredPin);
        try { localStorage.setItem("known:" + pinHash, JSON.stringify({ name: result.name, role: result.role, sites: result.sites || [], canInvoice: result.canInvoice !== false, features: features })); } catch (err) {}
        setLocalCi(!!result.checkedIn, result.checkedInSiteId || "");
        userName = result.name;
        userSites = result.sites || [];
        wasCheckedIn = !!result.checkedIn;
        checkedInSiteId = result.checkedInSiteId || "";
        userRole = result.role || "Contractor";
        userCanInvoice = result.canInvoice !== false;   // invoicing can be switched off per person
        updateHoursLabels();
        loggedIn = true;
        buildNav();
        applyFeatures();

        // "Back to menu" only makes sense for people who have both options
        document.querySelectorAll(".back-btn").forEach((b) => b.classList.toggle("hidden", userRole !== "Contractor/QA"));
        document.querySelectorAll(".hours-btn").forEach((b) => b.classList.toggle("hidden", userRole !== "Contractor" || !features.hours));

        home();
    } catch (err) {
        // No signal: a PIN that has worked on this phone before still lets you scan; the server re-checks it when the scan is sent
        if (await offlineLogin()) return;
        errorEl.innerText = "No signal. Move to a spot with signal and try again. (After you've logged in once with signal, your PIN also works offline for check-in/out.)";
    } finally {
        busy = false;
    }
}

// --- What this client has switched on ---
function roleHome(role) {
    if (role === "Contractor/QA") return (features.attendance || features.qa || features.progress || features.hours || features.diary) ? openMenu : null;
    if (role === "QA") return features.qa ? () => openQa() : features.progress ? openProgress : features.diary ? openDiary : null;
    return features.attendance ? openAttendance : features.progress ? openProgress : features.hours ? openHours : features.diary ? openDiary : null;
}

function goHome() { const h = roleHome(userRole); if (h) h(); else appReload(); }

function applyFeatures() {
    const map = { attend: "attendance", qa: "qa", prog: "progress", hrs: "hours", diary: "diary" };
    for (const cls in map) document.querySelectorAll(".menu-card." + cls).forEach((b) => b.classList.toggle("hidden", !features[map[cls]]));
}

// --- Screens ---
function showScreen(name, title, sub) {
    ["pin", "menu", "scanner", "qa", "hours", "invoice", "invlist", "faq", "details", "diary"].forEach((x) => {
        document.getElementById(x + "-screen").classList.toggle("hidden", x !== name);
    });
    document.getElementById("app-title").innerText = title;
    document.getElementById("app-subtitle").innerText = sub;
    window.scrollTo(0, 0);
    currentScreen = name;
    syncHistory(name);
    updateNav(name);
}

// --- Phone back button and bottom navigation bar ---
// Back moves up one screen inside the app instead of leaving it. From a home screen it leaves as normal.
const isHomeScreen = (name) => name === "pin" || name === "menu" ||
    (name === "scanner" && userRole === "Contractor") || (name === "qa" && userRole === "QA");

function popSentinel() {
    if (atSentinel && history.state && history.state.app) { atSentinel = false; ignorePop++; history.back(); return true; }
    atSentinel = false;
    return false;
}

function syncHistory(name) {
    if (!isHomeScreen(name) && !atSentinel) { history.pushState({ app: 1 }, ""); atSentinel = true; }
    else if (isHomeScreen(name) && atSentinel) popSentinel();
}

function goUp() {
    const s = currentScreen;
    if (s === "scanner" || s === "qa") backToMenu();
    else if (s === "hours") hoursBack();
    else if (s === "invoice" || s === "invlist" || s === "details") backToHours();
    else if (s === "faq") closeFaq();
    else if (s === "diary") diaryBack();
}

window.addEventListener("popstate", () => {
    if (ignorePop > 0) { ignorePop--; return; }
    if (!atSentinel) return;
    atSentinel = false;
    goUp();
});

function appReload() {
    if (popSentinel()) setTimeout(() => location.reload(), 150);
    else location.reload();
}

function buildNav() {
    const dual = userRole === "Contractor/QA", con = userRole === "Contractor" || dual, qa = userRole === "QA" || dual, items = [];
    if (con && features.attendance) items.push(["scanner", "&#128338;", "Attendance", "openAttendance()"]);
    if (qa && features.qa) items.push(["qa", "&#128203;", "QA", "openQa()"]);
    if (features.progress) items.push(["progress", "&#9989;", "Progress", "openProgress()"]);
    if (features.diary) items.push(["diary", "&#128214;", "Diary", "openDiary()"]);
    if (con && features.hours) items.push(["hours", "&#129534;", "Hours", "openHours()"]);
    if (con && features.hours && userCanInvoice) items.push(["details", "&#128100;", "Details", "openDetails()"]);
    items.push(["out", "&#128682;", "Log out", "logout()"]);
    document.getElementById("bottom-nav").innerHTML = items.map((i) =>
        `<button type="button" data-s="${i[0]}" onclick="${i[3]}"><span>${i[1]}</span>${i[2]}</button>`).join("");
}

function updateNav(name) {
    const nav = document.getElementById("bottom-nav"), show = loggedIn && name !== "pin" && name !== "faq";
    nav.classList.toggle("hidden", !show);
    document.querySelector(".app-container").classList.toggle("has-nav", show);

    const backdrop = document.getElementById("screen-backdrop");
    const isPopup = loggedIn && name !== "pin" && name !== "menu";
    if (backdrop) backdrop.classList.toggle("hidden", !isPopup);

    const tab = name === "scanner" ? "scanner" : name === "qa" ? (qaMode === "progress" ? "progress" : "qa") : name === "details" ? "details" : name === "diary" ? "diary" : ["hours", "invoice", "invlist"].indexOf(name) >= 0 ? "hours" : "";
    nav.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.s === tab));
}

function openMenu() {
    showScreen("menu", "Logged in: " + userName, "Please select an option");
    startIdleTimer();
}

function openAttendance() {
    document.getElementById("contractor-greeting").innerText = wasCheckedIn
        ? `Welcome, ${userName}. You're currently checked in.`
        : `Welcome, ${userName}`;
    setAction(wasCheckedIn ? "Check-Out" : "Check-In");
    showScreen("scanner", "Site Attendance", "Scan site QR code");
    startIdleTimer();
    startCameraScanner();
}

function backToMenu() {
    try { if (html5QrCode) html5QrCode.stop().catch(() => {}); } catch (err) {}
    ["status-card", "retry-btn", "confirm-box", "nocheckin-box", "manual-form"].forEach((id) => {
        document.getElementById(id).classList.add("hidden");
    });
    pendingScan = null;
    if (userRole === "Contractor") { goHome(); return; }
    openMenu();
}

// --- Action Toggle Logic ---
function setAction(action) {
    currentAction = action;
    document.getElementById("btn-in").classList.toggle("active", action === "Check-In");
    document.getElementById("btn-out").classList.toggle("active", action === "Check-Out");
    startIdleTimer();
}

// --- Camera & Scanner Logic ---
async function startCameraScanner() {
    handlingScan = false;

    if (html5QrCode) {
        try { await html5QrCode.clear(); } catch (err) {}
    }
    html5QrCode = new Html5Qrcode("qr-reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (scannedSiteId) => {
            // The camera can report the same code several times before it stops: only act once
            if (handlingScan) return;
            handlingScan = true;
            html5QrCode.stop().catch(() => {});
            processScanAttempt(scannedSiteId);
        },
        () => {}
    ).catch(() => {
        showStatus("Camera permissions denied or unavailable.", "error");
        showRetry();
    });
}

function showRetry() {
    document.getElementById("retry-btn").classList.remove("hidden");
}

function retryScan() {
    startIdleTimer();
    document.getElementById("retry-btn").classList.add("hidden");
    document.getElementById("status-card").classList.add("hidden");
    startCameraScanner();
}

// --- Location Capture & Logging ---
function processScanAttempt(siteId) {
    showStatus("Requesting GPS location...", "info");

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                sendLog(siteId, position.coords.latitude, position.coords.longitude);
            },
            () => {
                sendLog(siteId, "Denied", "Denied");
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    } else {
        sendLog(siteId, "Not Supported", "Not Supported");
    }
}

async function sendLog(siteId, lat, lng) {
    showStatus("Logging attendance...", "info");
    const queueId = uid(), scanTime = Date.now(), action = currentAction;

    try {
        const result = await callBackend({
            type: "log",
            pin: enteredPin,
            siteId: siteId,
            action: action,
            latitude: lat,
            longitude: lng,
            queueId: queueId
        });

        if (result.status === "SUCCESS") {
            // Success ends the session so the next person starts from the PIN screen
            setLocalCi(action === "Check-In", siteId);
            clearTimeout(idleTimer);
            showStatus(`✓ ${action} logged for ${result.name}`, "success");
            setTimeout(() => { appReload(); }, 3000);
        } else if (result.status === "ALREADY_CHECKED_IN") {
            // Ask before doing anything; nothing has been logged yet
            pendingScan = { siteId: siteId, lat: lat, lng: lng };
            startIdleTimer();
            showStatus("You're already checked in here. Did you mean to check out?", "info");
            document.getElementById("confirm-box").classList.remove("hidden");
        } else if (result.status === "NO_CHECK_IN") {
            // Ask before doing anything; nothing has been logged yet
            pendingScan = { siteId: siteId, lat: lat, lng: lng };
            startIdleTimer();
            showStatus("You're not checked in at this site. Did you mean to check in?", "info");
            document.getElementById("nocheckin-box").classList.remove("hidden");
        } else if (result.reason === "Invalid or Inactive PIN") {
            // PIN was switched off mid-session: retrying can't help
            showStatus(`${action} failed: ${result.reason}.`, "error");
            setTimeout(() => { appReload(); }, 4000);
        } else {
            // Stay logged in so they can try again
            showStatus(`${action} failed: ${result.reason || "unknown error"}.${result.logged ? " This attempt has been recorded." : ""}`, "error");
            showRetry();
        }
    } catch (err) {
        // No signal: keep the scan on the phone (with the time and GPS position) and send it later
        enqueue({ queueId: queueId, pin: enteredPin, siteId: siteId, action: action, latitude: lat, longitude: lng, clientTime: scanTime });
        setLocalCi(action === "Check-In", siteId);
        clearTimeout(idleTimer);
        showStatus(`No signal. Your ${action} is saved on this phone but is NOT recorded yet. It will send by itself once you have signal. Keep this page open if you can, or open it again later.`, "info");
        setTimeout(() => { appReload(); }, 8000);
    }
}

function showStatus(message, type) {
    const card = document.getElementById("status-card");
    const text = document.getElementById("status-text");
    card.classList.remove("hidden", "info", "success", "error");
    card.classList.add(type);
    text.innerText = message;
}

// --- "Did you mean to check out?" ---
function confirmCheckout() {
    document.getElementById("confirm-box").classList.add("hidden");
    if (!pendingScan) return;
    setAction("Check-Out");
    sendLog(pendingScan.siteId, pendingScan.lat, pendingScan.lng);
}

function declineCheckout() {
    document.getElementById("confirm-box").classList.add("hidden");
    pendingScan = null;
    clearTimeout(idleTimer);
    showStatus("OK, nothing has been logged.", "info");
    setTimeout(() => { appReload(); }, 3000);
}

// --- "Did you mean to check in?" ---
function confirmCheckIn() {
    document.getElementById("nocheckin-box").classList.add("hidden");
    if (!pendingScan) return;
    setAction("Check-In");
    sendLog(pendingScan.siteId, pendingScan.lat, pendingScan.lng);
}

function declineCheckIn() {
    document.getElementById("nocheckin-box").classList.add("hidden");
    pendingScan = null;
    clearTimeout(idleTimer);
    showStatus("OK, nothing has been logged.", "info");
    setTimeout(() => { appReload(); }, 3000);
}

// --- "I forgot to check in": comment + optional manual arrival time ---
function showManualForm() {
    document.getElementById("nocheckin-box").classList.add("hidden");
    document.getElementById("status-card").classList.add("hidden");
    document.getElementById("manual-error").innerText = "";
    document.getElementById("manual-form").classList.remove("hidden");
    startIdleTimer();
}

function cancelManual() {
    document.getElementById("manual-form").classList.add("hidden");
    pendingScan = null;
    clearTimeout(idleTimer);
    showStatus("OK, nothing has been logged.", "info");
    setTimeout(() => { appReload(); }, 3000);
}

async function submitManualCheckout() {
    if (busy || !pendingScan) return;

    const errorEl = document.getElementById("manual-error");
    const comment = document.getElementById("manual-comment").value.trim();

    if (!comment) {
        errorEl.innerText = "Please add your check-in time and the reason.";
        return;
    }

    busy = true;
    errorEl.innerText = "Submitting...";

    try {
        const result = await callBackend({
            type: "log",
            pin: enteredPin,
            siteId: pendingScan.siteId,
            action: "Check-Out",
            latitude: pendingScan.lat,
            longitude: pendingScan.lng,
            manual: true,
            comment: comment
        });

        if (result.status === "SUCCESS") {
            clearTimeout(idleTimer);
            document.getElementById("manual-form").classList.add("hidden");
            showStatus(`✓ Check-Out logged for ${result.name} (no check-in recorded)`, "success");
            setTimeout(() => { appReload(); }, 3000);
        } else if (result.reason === "Invalid or Inactive PIN") {
            document.getElementById("manual-form").classList.add("hidden");
            showStatus(`Check-Out failed: ${result.reason}.`, "error");
            setTimeout(() => { appReload(); }, 4000);
        } else {
            errorEl.innerText = result.reason || "Something went wrong. Please try again.";
        }
    } catch (err) {
        errorEl.innerText = "Network issue. Please try again.";
    } finally {
        busy = false;
    }
}

// Typing a comment counts as activity, so the idle log-out doesn't interrupt it
document.getElementById("manual-comment").addEventListener("input", startIdleTimer);

// --- Quality Assurance inspection ---
// The questions are kept by the admins (QA Checklist tab) and depend on the report type chosen.
let QA_CHECKS = [];
let qaType = "";
let qaInstalls = [], qaInstallPrev = "", qaProjectPrev = "";
let qaMode = "standard", qaStages = [], qaHasSetup = true;   // "progress" = the Progress page: tick stages, then QA unlocks
const QA_IDLE_MS = 15 * 60 * 1000;   // longer idle limit while filling in a report
const QA_MAX_PHOTOS = 6;          // extra photos at the end of the form
const QA_MAX_PER_CHECK = 3;       // photos per question
let qaPhotos = [];
let qaCheckPhotos = {};
let qaResults = {};

const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jsArg = (v) => escHtml(JSON.stringify(String(v)));
const qaMsg = (t, ok) => {
    const el = document.getElementById("qa-msg");
    el.innerText = t;
    el.style.color = ok ? "#4ade80" : "";
};

function openProgress() { return openQa("progress"); }

async function openQa(mode) {
    qaMode = mode === "progress" ? "progress" : "standard";
    showScreen("qa", qaMode === "progress" ? "Installation Progress" : "Quality Assurance", qaMode === "progress" ? "Tick stages, then QA" : "Inspection report");
    document.getElementById("qa-project").innerHTML = '<option value="">Select project...</option>' +
        userSites.map((x) => `<option value="${escHtml(x.id)}">${escHtml(x.name)}</option>`).join("");
    document.getElementById("qa-inspector").value = userName;
    document.getElementById("qa-date").value = new Date().toLocaleDateString("en-GB");
    document.getElementById("qa-type").value = "";
    qaType = "";
    QA_CHECKS = []; qaResults = {}; qaPhotos = []; qaCheckPhotos = {};
    qaInstalls = []; qaStages = []; qaHasSetup = true; qaInstallPrev = ""; qaProjectPrev = "";
    fillQaInstalls();
    applyQaInstall("");
    document.getElementById("qa-extra").value = "";
    document.getElementById("qa-checks").innerHTML = '<p class="note-small">Choose an installation to load the questions.</p>';
    renderThumbs();
    qaMsg("");
    const proj = document.getElementById("qa-project");
    if (!loadQaDraft()) {
        // If they're checked in, default the project to the site they're checked in at
        if (!proj.value && checkedInSiteId) proj.value = checkedInSiteId;
        qaProjectPrev = proj.value;
        loadQaInstalls(proj.value);
    }
    showQaProject();
    startIdleTimer(QA_IDLE_MS);
}

// Project details for the chosen project (set on the project card in the dashboard)
function showQaProject() {
    const s = userSites.find((x) => x.id === document.getElementById("qa-project").value) || {};
    document.getElementById("qa-projno").value = s.projectNo || "";
    document.getElementById("qa-address").value = s.address || "";
    document.getElementById("qa-contractor").value = s.contractor || "";
    document.getElementById("qa-installer").value = s.installer || "";
}

async function loadQaQuestions(type, draft) {
    const box = document.getElementById("qa-checks");
    qaResults = {}; qaCheckPhotos = {};
    if (!type) { QA_CHECKS = []; box.innerHTML = '<p class="note-small">Choose an installation to load the questions.</p>'; return; }
    box.innerHTML = '<p class="note-small">Loading questions...</p>';
    const key = "qaQuestions:" + type;
    try {
        const r = await callBackend({ type: "qaQuestions", pin: enteredPin, reportType: type,
                                      installId: qaMode === "progress" ? document.getElementById("qa-install").value : "", viaProgress: qaMode === "progress" });
        if (document.getElementById("qa-type").value !== type) return;   // they changed their mind while loading
        if (r.status !== "SUCCESS") { QA_CHECKS = []; box.innerHTML = `<p class="error-msg">${escHtml(r.reason || "Could not load the questions.")}</p>`; return; }
        QA_CHECKS = r.questions;
        try { localStorage.setItem(key, JSON.stringify(r.questions)); } catch (err) {}
    } catch (err) {
        try { QA_CHECKS = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { QA_CHECKS = []; }
    }
    renderQaChecks();
    if (draft && draft.type === type) applyQaDraft(draft);
}

function qaControl(c) {
    if (c.type === "TEXT") return "";
    const opts = c.type === "ACCEPT" ? [["ACCEPT", "ACCEPT"], ["DECLINE", "DECLINE"]] : [["PASS", "PASS"], ["FAIL", "FAIL"], ["NA", "N/A"]];
    return `<div class="seg" data-id="${c.id}">` + opts.map((o) => `<button type="button" data-r="${o[0]}">${o[1]}</button>`).join("") + "</div>";
}

function renderQaChecks() {
    const box = document.getElementById("qa-checks");
    if (!QA_CHECKS.length) { box.innerHTML = '<p class="note-small">No questions have been set up for this report yet. Please tell an admin.</p>'; return; }
    box.innerHTML = QA_CHECKS.map((c) => {
        const text = c.type === "TEXT";
        return `
        <div class="qa-check">
            <div class="qa-check-head">
                <div><strong>${escHtml(c.title)}${c.mandatory ? " *" : ""}</strong><small>${escHtml(c.desc)}</small></div>
                ${qaControl(c)}
            </div>
            <textarea id="qn-${c.id}" rows="${text ? 3 : 2}" maxlength="${text ? 500 : 300}" placeholder="${text ? "Your answer" : "Notes/Defects"}"></textarea>
            <div class="qa-photo hidden" id="qp-${c.id}">
                <label class="photo-drop small" id="qpl-${c.id}">&#128247; Add photo <small>(required)</small>
                    <input type="file" accept="image/*" multiple hidden data-q="${c.id}">
                </label>
                <div class="thumbs" id="qt-${c.id}"></div>
            </div>
        </div>`;
    }).join("");
    QA_CHECKS.forEach(qaPhotoBox);
}

function qaPhotoBox(c) {
    const box = document.getElementById("qp-" + c.id);
    if (!box) return;
    const res = c.type === "TEXT" ? "TEXT" : qaResults[c.id];
    const show = c.photoOn.length > 0 && !!res && res !== "NA";
    box.classList.toggle("hidden", !show);
    if (res === "NA") qaCheckPhotos[c.id] = [];
    renderCheckThumbs(c.id);
}

function setQaResult(id, result) {
    qaResults[id] = result;
    document.querySelectorAll(`.seg[data-id="${id}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.r === result));
    const c = QA_CHECKS.find((x) => x.id === id);
    if (c) qaPhotoBox(c);
}

function renderCheckThumbs(id) {
    const list = qaCheckPhotos[id] || [];
    const c = QA_CHECKS.find((x) => x.id === id);
    const res = c && c.type === "TEXT" ? "TEXT" : qaResults[id];
    const required = !!c && c.photoOn.indexOf(res) >= 0;
    document.getElementById("qt-" + id).innerHTML = list.map((p, i) =>
        `<div class="thumb"><img src="${p}" alt="Photo ${i + 1}"><button type="button" onclick="removeCheckPhoto('${id}', ${i})">&times;</button></div>`).join("");
    const label = document.getElementById("qpl-" + id);
    label.classList.toggle("hidden", list.length >= QA_MAX_PER_CHECK);
    label.firstChild.textContent = list.length ? "\u{1F4F7} Add another photo " : "\u{1F4F7} Add photo ";
    label.querySelector("small").textContent = (!list.length && required) ? "(required)" : "(optional)";
}

function removeCheckPhoto(id, i) { (qaCheckPhotos[id] || []).splice(i, 1); renderCheckThumbs(id); }

function resizeImage(file, maxPx, quality) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, (maxPx || 1024) / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src);
            resolve(c.toDataURL("image/jpeg", quality || 0.65));
        };
        img.src = URL.createObjectURL(file);
    });
}

function renderThumbs() {
    document.getElementById("qa-thumbs").innerHTML = qaPhotos.map((p, i) =>
        `<div class="thumb"><img src="${p}" alt="Photo ${i + 1}"><button type="button" onclick="removePhoto(${i})">&times;</button></div>`).join("");
}

function removePhoto(i) { qaPhotos.splice(i, 1); renderThumbs(); }

function qaDraftKey() { return "qaDraft:" + userName + (qaMode === "progress" ? ":p" : ""); }

function saveQaDraft() {
    const draft = { project: document.getElementById("qa-project").value, install: document.getElementById("qa-install").value, type: document.getElementById("qa-type").value,
                    ref: document.getElementById("qa-ref").value, phase: document.getElementById("qa-phase").value, level: document.getElementById("qa-level").value,
                    drawings: document.getElementById("qa-drawings").value, results: qaResults, notes: {} };
    QA_CHECKS.forEach((c) => { draft.notes[c.id] = document.getElementById("qn-" + c.id).value; });
    try {
        localStorage.setItem(qaDraftKey(), JSON.stringify(draft));
        qaMsg("Draft saved on this device. Photos are not kept in drafts.", true);
    } catch (err) {
        qaMsg("Couldn't save the draft on this device.");
    }
}

function applyQaDraft(d) {
    QA_CHECKS.forEach((c) => {
        if (d.results && d.results[c.id]) setQaResult(c.id, d.results[c.id]);
        const n = document.getElementById("qn-" + c.id);
        if (n) n.value = (d.notes && d.notes[c.id]) || "";
    });
    qaMsg("Draft restored. Add your photos again.", true);
}

// Returns true when a saved draft with a project was found (it then loads the installations itself)
function loadQaDraft() {
    try {
        const d = JSON.parse(localStorage.getItem(qaDraftKey()) || "null");
        if (!d || !d.project || !userSites.some((x) => x.id === d.project)) return false;
        document.getElementById("qa-project").value = d.project;
        qaProjectPrev = d.project;
        loadQaInstalls(d.project, d);
        return true;
    } catch (err) { return false; }
}

// Installations the office has set up for the chosen project (cached on the phone for poor signal)
async function loadQaInstalls(siteId, draft) {
    qaInstalls = []; qaStages = []; qaHasSetup = true;
    let offlineErr = "";
    if (siteId) {
        const progress = qaMode === "progress", key = "qaInstalls:" + siteId;
        try {
            const r = await callBackend({ type: progress ? "progressList" : "qaInstalls", pin: enteredPin, siteId: siteId });
            if (document.getElementById("qa-project").value !== siteId) return;   // they changed project while loading
            if (r.status === "SUCCESS") {
                qaInstalls = r.installs;
                if (progress) { qaStages = r.stages || []; qaHasSetup = r.hasSetup !== false; }
                else { try { localStorage.setItem(key, JSON.stringify(qaInstalls)); } catch (err) {} }
            }
        } catch (err) {
            if (progress) offlineErr = "No signal. Ticking stages needs a signal, please try again.";
            else { try { qaInstalls = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { qaInstalls = []; } }
        }
    }
    fillQaInstalls();
    renderStages(offlineErr);
    if (draft && draft.install && (draft.install === "__adhoc" || qaInstalls.some((i) => i.id === draft.install))) {
        document.getElementById("qa-install").value = draft.install;
        qaInstallPrev = draft.install;
        applyQaInstall(draft.install, draft);
    }
}

function fillQaInstalls(keep) {
    const sel = document.getElementById("qa-install"), progress = qaMode === "progress";
    sel.innerHTML = '<option value="">Select installation...</option>' +
        qaInstalls.map((i) => {
            const n = progress ? " [" + qaStages.filter((s) => (i.done || []).indexOf(s.id) >= 0).length + "/" + qaStages.length + "]" : "";
            return `<option value="${escHtml(i.id)}">${escHtml(i.product + " - " + i.ref + (i.level ? " (" + i.level + ")" : "") + n)}</option>`;
        }).join("") +
        (progress ? "" : '<option value="__adhoc">Ad hoc (not listed)</option>');
    sel.value = keep || "";
}

// A listed installation fills the details and the report type; Ad hoc lets the inspector type them in
function applyQaInstall(id, d) {
    const adhoc = id === "__adhoc", inst = qaInstalls.find((i) => i.id === id);
    const fields = { ref: "qa-ref", phase: "qa-phase", level: "qa-level", drawings: "qa-drawings" };
    for (const k in fields) {
        const el = document.getElementById(fields[k]);
        el.readOnly = !adhoc;
        el.value = inst ? (inst[k] || "") : (adhoc && d ? (d[k] || "") : "");
        el.placeholder = adhoc ? "Type here" : "";
    }
    const typeEl = document.getElementById("qa-type");
    typeEl.disabled = !adhoc;
    typeEl.value = inst ? inst.product : (adhoc && d ? (d.type || "") : "");
    qaType = typeEl.value;
    if (qaMode === "progress") {
        renderStages();
        if (qaStagesComplete(inst) && canQa()) loadQaQuestions(qaType, d);
        else { QA_CHECKS = []; qaResults = {}; qaCheckPhotos = {}; document.getElementById("qa-checks").innerHTML = ""; }
        return;
    }
    loadQaQuestions(qaType, d);
}

// ---- Progress page: tick the payment stages; the QA form below unlocks when every stage is ticked ----
const canQa = () => userRole === "QA" || userRole === "Contractor/QA";
const qaInstObj = () => qaInstalls.find((i) => i.id === document.getElementById("qa-install").value);
const qaStagesComplete = (inst) => !!inst && qaStages.length > 0 && qaStages.every((s) => (inst.done || []).indexOf(s.id) >= 0);

function renderStages(err) {
    const box = document.getElementById("qa-stages"), body = document.getElementById("qa-body");
    if (qaMode !== "progress") { box.classList.add("hidden"); body.classList.remove("hidden"); return; }
    box.classList.remove("hidden");
    body.classList.add("hidden");
    const note = (t) => { box.innerHTML = `<p class="note-small">${escHtml(t)}</p>` + (err ? `<p class="error-msg">${escHtml(err)}</p>` : ""); };
    const inst = qaInstObj();
    if (!document.getElementById("qa-project").value) return note("Choose a project to see its installations.");
    if (!qaHasSetup) return note("Progress tracking hasn't been set up for this project yet. Ask an admin to set up its stages.");
    if (!qaInstalls.length) return note("No installations have been set up for this project yet.");
    if (!inst) return note("Choose an installation to tick off its stages.");
    const doneN = qaStages.filter((s) => (inst.done || []).indexOf(s.id) >= 0).length, complete = doneN === qaStages.length;
    const qa = inst.qa ? `<p class="note-small">Last QA inspection: <b>${escHtml(inst.qa.overall)}</b> on ${inst.qa.ts.slice(8, 10)}/${inst.qa.ts.slice(5, 7)}/${inst.qa.ts.slice(0, 4)}</p>` : "";
    box.innerHTML = `<div class="stage-box"><h3>Stages: ${doneN} of ${qaStages.length} complete</h3>` +
        `<div class="stage-bar"><div style="width:${qaStages.length ? Math.round(doneN / qaStages.length * 100) : 0}%"></div></div>` +
        qaStages.map((s) => `<label class="stage-row"><input type="checkbox" data-stage="${escHtml(s.id)}"${(inst.done || []).indexOf(s.id) >= 0 ? " checked" : ""}> ${escHtml(s.name)}</label>`).join("") +
        (complete
            ? `<p class="stage-ok">&#10003; All stages complete. ${canQa() ? "QA inspection unlocked below." : "A QA inspector can now carry out the QA inspection."}</p>`
            : `<p class="note-small">The QA inspection unlocks when every stage is ticked.</p>`) +
        qa + (err ? `<p class="error-msg">${escHtml(err)}</p>` : "") + "</div>";
    if (complete && canQa()) body.classList.remove("hidden");
}

document.getElementById("qa-stages").addEventListener("change", async (e) => {
    const cb = e.target.closest("input[data-stage]"), inst = qaInstObj();
    if (!cb || !inst) return;
    cb.disabled = true;
    try {
        const r = await callBackend({ type: "stageSet", pin: enteredPin, installId: inst.id, stageId: cb.dataset.stage, done: cb.checked });
        if (r.status === "SUCCESS") {
            inst.done = r.done;
            fillQaInstalls(inst.id);
            renderStages();
            if (qaStagesComplete(inst) && canQa() && !QA_CHECKS.length) loadQaQuestions(qaType);
        } else {
            renderStages(r.reason || "Could not save that tick. Please try again.");
        }
    } catch (err) {
        renderStages("No signal. Your tick was not saved, please try again.");
    }
});

const hasQaWork = () => Object.keys(qaResults).length > 0 || Object.values(qaCheckPhotos).some((l) => l && l.length) ||
    QA_CHECKS.some((c) => { const n = document.getElementById("qn-" + c.id); return !!n && n.value.trim() !== ""; });

document.getElementById("qa-project").addEventListener("change", (e) => {
    const next = e.target.value;
    if (next !== qaProjectPrev && hasQaWork() && !confirm("Changing the project clears your answers and photos. Continue?")) { e.target.value = qaProjectPrev; return; }
    qaProjectPrev = next;
    qaInstallPrev = "";
    qaMsg("");
    showQaProject();
    qaInstalls = [];
    fillQaInstalls();
    applyQaInstall("");
    loadQaInstalls(next);
});

document.getElementById("qa-install").addEventListener("change", (e) => {
    const next = e.target.value;
    if (next !== qaInstallPrev && hasQaWork() && !confirm("Changing the installation clears your answers and photos. Continue?")) { e.target.value = qaInstallPrev; return; }
    qaInstallPrev = next;
    qaMsg("");
    applyQaInstall(next);
});

// Report type can only be changed for an ad hoc installation
document.getElementById("qa-type").addEventListener("change", (e) => {
    const next = e.target.value;
    if (next !== qaType && hasQaWork() && !confirm("Changing the report type clears your answers and photos for the questions. Continue?")) { e.target.value = qaType; return; }
    qaType = next;
    qaMsg("");
    loadQaQuestions(next);
});

async function submitQa() {
    if (busy) return;
    const siteId = document.getElementById("qa-project").value;
    if (!siteId) return qaMsg("Please choose the project.");
    const installId = document.getElementById("qa-install").value;
    if (!installId) return qaMsg("Please choose the installation, or Ad hoc if it isn't listed.");
    const reportType = document.getElementById("qa-type").value;
    if (!reportType) return qaMsg("Please choose the report type.");
    const ref = document.getElementById("qa-ref").value.trim();
    if (!ref) return qaMsg("Please enter a reference for the installation.");
    if (!QA_CHECKS.length) return qaMsg("There are no questions to answer for this report.");

    const checks = [];
    for (const c of QA_CHECKS) {
        const notes = document.getElementById("qn-" + c.id).value.trim();
        const result = c.type === "TEXT" ? (notes ? "TEXT" : "") : qaResults[c.id];
        if (!result) {
            if (c.mandatory) return qaMsg(`Please answer "${c.title}".`);
            continue;
        }
        if ((result === "FAIL" || result === "DECLINE") && !notes) return qaMsg(`Please add notes/defects for "${c.title}".`);
        const shots = result === "NA" ? [] : (qaCheckPhotos[c.id] || []);
        if (c.photoOn.indexOf(result) >= 0 && !shots.length) return qaMsg(`Please add a photo for "${c.title}".`);
        checks.push({ qid: c.id, item: c.title, result: result, notes: notes, photos: shots });
    }
    if (!checks.length) return qaMsg("Please answer at least one question.");

    busy = true;
    qaMsg("Uploading report and photos. This can take a minute...", true);
    try {
        const r = await callBackend({ type: "qa", pin: enteredPin, siteId: siteId, reportType: reportType, installId: installId === "__adhoc" ? "" : installId, viaProgress: qaMode === "progress",
                                      ref: ref, phase: document.getElementById("qa-phase").value.trim(), level: document.getElementById("qa-level").value.trim(),
                                      drawings: document.getElementById("qa-drawings").value.trim(), checks: checks, photos: qaPhotos,
                                      extra: document.getElementById("qa-extra").value.trim() });
        if (r.status === "SUCCESS") {
            try { localStorage.removeItem(qaDraftKey()); } catch (err) {}
            qaMsg("✓ Inspection report submitted. Thank you.", true);
            setTimeout(qaMode === "progress" ? () => openQa("progress") : (userRole === "Contractor/QA" ? openMenu : () => appReload()), 2500);
        } else {
            qaMsg(r.reason || "Something went wrong. Please try again.");
        }
    } catch (err) {
        qaMsg("Network issue. Your answers are still here, please try again.");
    } finally {
        busy = false;
    }
}

document.getElementById("qa-checks").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]");
    if (b) setQaResult(b.parentElement.dataset.id, b.dataset.r);
});

// photos for a single question
document.getElementById("qa-checks").addEventListener("change", async (e) => {
    const inp = e.target.closest("input[data-q]");
    if (!inp) return;
    const id = inp.dataset.q, list = (qaCheckPhotos[id] = qaCheckPhotos[id] || []);
    for (const f of Array.from(inp.files).slice(0, QA_MAX_PER_CHECK - list.length)) list.push(await resizeImage(f));
    inp.value = "";
    renderCheckThumbs(id);
});

document.getElementById("qa-file").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files).slice(0, QA_MAX_PHOTOS - qaPhotos.length);
    for (const f of files) qaPhotos.push(await resizeImage(f));
    e.target.value = "";
    renderThumbs();
});

// Typing or tapping in the report counts as activity
["input", "click"].forEach((ev) =>
    document.getElementById("qa-screen").addEventListener(ev, () => startIdleTimer(QA_IDLE_MS)));

// --- My hours & invoices ---
let weekOffset = 0;
let hoursData = null;
let lastInvoice = null;

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dmyFull = (s) => s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
const dmyShort = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
const hmText = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const gbp = (n) => "\u00A3" + Number(n).toFixed(2);

function weekRange() {   // Monday to Sunday
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
    const from = isoDate(d);
    d.setDate(d.getDate() + 6);
    return { from: from, to: isoDate(d) };
}

function weekDays(from) {
    const out = [], d = new Date(from + "T12:00:00");
    for (let i = 0; i < 7; i++) { out.push(isoDate(d)); d.setDate(d.getDate() + 1); }
    return out;
}

function dayMinutes() {
    const m = {};
    hoursData.shifts.forEach((s) => { m[s.day] = (m[s.day] || 0) + s.mins; });
    return m;
}

function openHours() {
    weekOffset = 0;
    // invoice buttons stay hidden unless this person has invoicing on (known from login), so they never flash up
    document.getElementById("btn-prepare").classList.toggle("hidden", !userCanInvoice);
    document.getElementById("btn-myinv").classList.toggle("hidden", !userCanInvoice);
    document.getElementById("btn-details").classList.toggle("hidden", !userCanInvoice);
    showScreen("hours", "My Hours", "Completed shifts");
    startIdleTimer(QA_IDLE_MS);
    loadHours();
}

function hoursBack() { goHome(); }

function shiftWeek(n) {
    weekOffset = Math.min(0, weekOffset + n);   // no future weeks
    loadHours();
}

async function loadHours() {
    const { from, to } = weekRange(), msg = document.getElementById("hours-msg");
    document.getElementById("week-label").innerText = `${dmyFull(from)} - ${dmyFull(to)}`;
    msg.innerText = "Loading...";
    try {
        const r = await callBackend({ type: "hours", pin: enteredPin, from: from, to: to });
        if (r.status !== "SUCCESS") { msg.innerText = r.reason || "Could not load your hours."; return; }
        msg.innerText = "";
        hoursData = { from: from, to: to, shifts: r.shifts, incomplete: r.incomplete, invoice: r.invoice, details: r.details || {}, canInvoice: r.canInvoice !== false };
        const invOn = r.canInvoice !== false;   // invoicing can be switched off per person
        document.getElementById("btn-prepare").classList.toggle("hidden", !invOn);
        document.getElementById("btn-myinv").classList.toggle("hidden", !invOn);
        document.getElementById("btn-details").classList.toggle("hidden", !invOn);
        lastInvoice = null;
        renderHours();
    } catch (err) {
        msg.innerText = "Network issue. Please try again.";
    }
}

function renderHours() {
    const rows = hoursData.shifts.map((s) =>
        `<tr><td>${dmyShort(s.day)}</td><td>${escHtml(s.site)}</td><td>${s.inT}</td><td>${s.outT}</td><td>${hmText(s.mins)}</td></tr>`).join("");
    document.getElementById("t-shifts").innerHTML =
        "<tr><th>Date</th><th>Site</th><th>In</th><th>Out</th><th>Hours</th></tr>" +
        (rows || '<tr><td colspan="5">No completed shifts this week</td></tr>');
    document.getElementById("hours-total").innerText = hmText(hoursData.shifts.reduce((a, s) => a + s.mins, 0));

    let note = "";
    if (hoursData.incomplete) note += `${hoursData.incomplete} shift(s) have no check-out and aren't counted until an admin corrects them. `;
    if (hoursData.invoice && hoursData.canInvoice) note += `Invoice submitted ${dmyFull(hoursData.invoice.submitted.slice(0, 10))}. Submitting again updates it.`;
    document.getElementById("hours-note").innerText = note;
}

// --- Invoice ---
function openInvoice() {
    if (!hoursData || !hoursData.shifts.length) { document.getElementById("hours-msg").innerText = "There are no completed hours to invoice this week."; return; }
    const mins = dayMinutes(), saved = {};
    if (hoursData.invoice) hoursData.invoice.days.forEach((d) => { saved[d.date] = d.rate; });
    const lastRate = localStorage.getItem("rate:" + userName) || "";

    document.getElementById("inv-period").innerText = `Invoice period ${dmyFull(hoursData.from)} to ${dmyFull(hoursData.to)}. Tap a rate to change it for that day.`;
    document.getElementById("t-invoice").innerHTML =
        "<tr><th>Date</th><th>Day</th><th>Hours</th><th>Rate (&pound;/hr)</th><th>Total</th></tr>" +
        weekDays(hoursData.from).map((day) => {
            const h = Math.round((mins[day] || 0) / 60 * 100) / 100;
            const weekday = new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" });
            const rate = saved[day] !== undefined ? saved[day] : (h ? lastRate : "");
            return `<tr><td>${dmyShort(day)}</td><td>${weekday}</td><td>${h.toFixed(2)}</td>` +
                   `<td><input class="rate" type="number" inputmode="decimal" min="0" step="0.5" data-day="${day}" data-h="${h}" value="${rate}" ${h ? "" : "disabled"}></td>` +
                   `<td class="d-total">${gbp(h * (Number(rate) || 0))}</td></tr>`;
        }).join("");
    document.getElementById("inv-msg").innerText = "";
    lastInvoice = null;
    recalcInvoice();
    showScreen("invoice", "Invoice", "Set your rate for each day");
    startIdleTimer(QA_IDLE_MS);
}

function invoiceFromScreen() {
    const days = [];
    let totalHours = 0, totalAmount = 0;
    document.querySelectorAll("#t-invoice .rate").forEach((inp) => {
        const h = Number(inp.dataset.h), rate = Number(inp.value) || 0;
        if (!h) return;
        const total = Math.round(h * rate * 100) / 100;
        days.push({ date: inp.dataset.day, hours: h, rate: rate, total: total });
        totalHours += h;
        totalAmount += total;
    });
    return { days: days, totalHours: Math.round(totalHours * 100) / 100, totalAmount: Math.round(totalAmount * 100) / 100 };
}

function recalcInvoice() {
    document.querySelectorAll("#t-invoice .rate").forEach((inp) => {
        inp.closest("tr").querySelector(".d-total").innerText = gbp(Number(inp.dataset.h) * (Number(inp.value) || 0));
    });
    const inv = invoiceFromScreen();
    document.getElementById("inv-hours").innerText = inv.totalHours.toFixed(2);
    document.getElementById("inv-sum").innerText = gbp(inv.totalAmount);
}

function backToHours() {
    showScreen("hours", "My Hours", "Completed shifts");
    if (hoursData) renderHours();
}

async function submitInvoice() {
    if (busy) return;
    const msg = document.getElementById("inv-msg"), rates = {};
    for (const inp of document.querySelectorAll("#t-invoice .rate")) {
        if (!Number(inp.dataset.h)) continue;
        if (!(Number(inp.value) > 0)) { msg.style.color = ""; msg.innerText = `Please enter an hourly rate for ${dmyShort(inp.dataset.day)}.`; return; }
        rates[inp.dataset.day] = Number(inp.value);
    }
    busy = true;
    msg.style.color = "#4ade80";
    msg.innerText = "Submitting invoice...";
    try {
        const r = await callBackend({ type: "invoice", pin: enteredPin, from: hoursData.from, to: hoursData.to, rates: rates });
        if (r.status === "SUCCESS") {
            lastInvoice = r.invoice;
            const last = Object.values(rates).pop();
            try { localStorage.setItem("rate:" + userName, String(last)); } catch (err) {}
            msg.innerText = "✓ Invoice submitted to Admin. You can download a PDF below.";
        } else {
            msg.style.color = "";
            msg.innerText = r.reason || "Something went wrong. Please try again.";
        }
    } catch (err) {
        msg.style.color = "";
        msg.innerText = "Network issue. Please try again.";
    } finally {
        busy = false;
    }
}

function downloadInvoice() {
    const inv = lastInvoice || Object.assign(
        { id: "", contractor: userName, from: hoursData.from, to: hoursData.to, submitted: "", details: hoursData.details || {} }, invoiceFromScreen());
    printInvoice(inv);
}

document.getElementById("t-invoice").addEventListener("input", () => { recalcInvoice(); startIdleTimer(QA_IDLE_MS); });

// --- Poor signal: offline PIN, saved scans and automatic retry ---
const QUEUE_KEY = "scanQueue";
let pinHash = "";
let flushing = false;
let noteTimer = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const getQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (err) { return []; } };

async function sha256(t) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder
