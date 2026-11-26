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

// --- Matching thin-stroke SVG icons across cards, camera/photo controls, and bottom nav ---
const UI_ICONS = {
    attendance: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    qa: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 5-3.2 8.2-7 9-3.8-.8-7-4-7-9V6l7-3z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
    progress: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M9 12l2 2 4-4"/></svg>',
    diary: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></svg>',
    hours: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    details: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9"/><path d="M10 12h11"/><path d="M17 8l4 4-4 4"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    gallery: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
};

function iconSvg(name) {
    return UI_ICONS[name] || "";
}

function hydrateStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
        const svg = iconSvg(el.dataset.icon);
        if (svg) el.innerHTML = svg;
    });
    document.querySelectorAll("[data-photo-drop]").forEach((el) => {
        const ic = el.querySelector(".photo-drop-icon");
        if (ic && !ic.innerHTML.trim()) ic.innerHTML = iconSvg("camera");
    });
}

function initialsOf(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] || "" : "")).toUpperCase();
}

function updateUserPill(name, role) {
    const pill = document.getElementById("user-pill");
    if (!pill) return;
    if (!loggedIn || !name) {
        pill.classList.add("hidden");
        pill.innerHTML = "";
        return;
    }
    const escN = escHtml(name);
    const escR = escHtml(role || "Field");
    pill.innerHTML = `<span class="user-avatar" aria-hidden="true">${escHtml(initialsOf(name))}</span><span class="user-meta"><b>${escN}</b><small>${escR}</small></span>`;
    pill.classList.remove("hidden");
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
let qaMode = "standard";   // "progress" = the Progress page: tick stages, then QA unlocks
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
    loggedIn = false;
    updateUserPill("", "");
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
        updateUserPill(userName, userRole);
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
    if (name === "pin") updateUserPill("", "");
    else if (loggedIn) updateUserPill(userName, userRole);
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
    if (con && features.attendance) items.push(["scanner", iconSvg("attendance"), "Attendance", "openAttendance()"]);
    if (qa && features.qa) items.push(["qa", iconSvg("qa"), "QA", "openQa()"]);
    if (features.progress) items.push(["progress", iconSvg("progress"), "Progress", "openProgress()"]);
    if (features.diary) items.push(["diary", iconSvg("diary"), "Diary", "openDiary()"]);
    if (con && features.hours) items.push(["hours", iconSvg("hours"), "Hours", "openHours()"]);
    if (con && features.hours && userCanInvoice) items.push(["details", iconSvg("details"), "Details", "openDetails()"]);
    items.push(["out", iconSvg("logout"), "Log out", "logout()"]);
    document.getElementById("bottom-nav").innerHTML = items.map((i) =>
        `<button type="button" data-s="${i[0]}" onclick="${i[3]}"><span class="nav-ic" aria-hidden="true">${i[1]}</span><span class="nav-lbl">${i[2]}</span></button>`).join("");
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
    showScreen("menu", "Site Portal", "Please select an option");
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
            setLocalCi(action === "Check-In", siteId);
            clearTimeout(idleTimer);
            showStatus(`✓ ${action} logged for ${result.name}`, "success");
            setTimeout(() => { appReload(); }, 3000);
        } else if (result.status === "ALREADY_CHECKED_IN") {
            pendingScan = { siteId: siteId, lat: lat, lng: lng };
            startIdleTimer();
            showStatus("You're already checked in here. Did you mean to check out?", "info");
            document.getElementById("confirm-box").classList.remove("hidden");
        } else if (result.status === "NO_CHECK_IN") {
            pendingScan = { siteId: siteId, lat: lat, lng: lng };
            startIdleTimer();
            showStatus("You're not checked in at this site. Did you mean to check in?", "info");
            document.getElementById("nocheckin-box").classList.remove("hidden");
        } else if (result.reason === "Invalid or Inactive PIN") {
            showStatus(`${action} failed: ${result.reason}.`, "error");
            setTimeout(() => { appReload(); }, 4000);
        } else {
            showStatus(`${action} failed: ${result.reason || "unknown error"}.${result.logged ? " This attempt has been recorded." : ""}`, "error");
            showRetry();
        }
    } catch (err) {
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

document.getElementById("manual-comment").addEventListener("input", startIdleTimer);

// --- Quality Assurance inspection ---
let QA_CHECKS = [];
let qaType = "";
let qaInstalls = [], qaInstallPrev = "", qaProjectPrev = "";
let qaStages = [], qaHasSetup = true;
const QA_IDLE_MS = 15 * 60 * 1000;
const QA_MAX_PHOTOS = 6;
const QA_MAX_PER_CHECK = 3;
let qaPhotos = [];
let qaCheckPhotos = {};
let qaResults = {};

const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
        if (!proj.value && checkedInSiteId) proj.value = checkedInSiteId;
        qaProjectPrev = proj.value;
        loadQaInstalls(proj.value);
    }
    showQaProject();
    startIdleTimer(QA_IDLE_MS);
}

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
        if (document.getElementById("qa-type").value !== type) return;
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
                <label class="photo-drop small" id="qpl-${c.id}"><span class="photo-drop-icon" aria-hidden="true">${iconSvg("camera")}</span><span class="photo-drop-lbl">Add photo</span> <small>(required)</small>
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
    const lblText = label.querySelector(".photo-drop-lbl");
    if (lblText) lblText.textContent = list.length ? "Add another photo" : "Add photo";
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

async function loadQaInstalls(siteId, draft) {
    qaInstalls = []; qaStages = []; qaHasSetup = true;
    let offlineErr = "";
    if (siteId) {
        const progress = qaMode === "progress", key = "qaInstalls:" + siteId;
        try {
            const r = await callBackend({ type: progress ? "progressList" : "qaInstalls", pin: enteredPin, siteId: siteId });
            if (document.getElementById("qa-project").value !== siteId) return;
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

function weekRange() {
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
    document.getElementById("btn-prepare").classList.toggle("hidden", !userCanInvoice);
    document.getElementById("btn-myinv").classList.toggle("hidden", !userCanInvoice);
    document.getElementById("btn-details").classList.toggle("hidden", !userCanInvoice);
    showScreen("hours", "My Hours", "Completed shifts");
    startIdleTimer(QA_IDLE_MS);
    loadHours();
}

function hoursBack() { goHome(); }

function shiftWeek(n) {
    weekOffset = Math.min(0, weekOffset + n);
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
        const invOn = r.canInvoice !== false;
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
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("igl:" + t));
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function updateQueueBanner() {
    const n = getQueue().length, el = document.querySelector(".queue-banner");
    if (!el) return;
    el.classList.toggle("hidden", !n);
    el.innerText = `${n} scan${n === 1 ? "" : "s"} saved on this phone, waiting for signal. ${n === 1 ? "It" : "They"} will send automatically.`;
}

function setQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (err) {}
    updateQueueBanner();
}

function enqueue(item) { const q = getQueue(); q.push(item); setQueue(q); }

function queueNote(msg, ok) {
    const el = document.getElementById("queue-note");
    if (!el) return;
    el.innerText = msg;
    el.classList.toggle("ok", !!ok);
    el.classList.remove("hidden");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => el.classList.add("hidden"), 20000);
}

function setLocalCi(on, siteId) {
    if (!pinHash) return;
    try {
        if (on) localStorage.setItem("ci:" + pinHash, JSON.stringify({ day: isoDate(new Date()), siteId: siteId }));
        else localStorage.removeItem("ci:" + pinHash);
    } catch (err) {}
}

function getLocalCi() {
    try {
        const c = JSON.parse(localStorage.getItem("ci:" + pinHash) || "null");
        return c && c.day === isoDate(new Date()) ? c : null;
    } catch (err) { return null; }
}

async function offlineLogin() {
    try {
        const h = await sha256(enteredPin);
        const k = JSON.parse(localStorage.getItem("known:" + h) || "null");
        if (!k || k.role === "QA" || k.role === "Admin") return false;
        pinHash = h;
        userName = k.name;
        userSites = k.sites || [];
        userRole = k.role || "Contractor";
        userCanInvoice = k.canInvoice !== false;
        features = k.features || features;
        if (!features.attendance) return false;
        updateHoursLabels();
        loggedIn = true;
        updateUserPill(userName, userRole);
        buildNav();
        applyFeatures();
        const ci = getLocalCi();
        wasCheckedIn = !!ci;
        checkedInSiteId = ci ? ci.siteId : "";
        document.querySelectorAll(".back-btn, .hours-btn").forEach((b) => b.classList.add("hidden"));
        document.getElementById("pin-error").innerText = "";
        queueNote("No signal: offline mode. Scan the site QR code as normal. Your scan is saved on this phone and sent when you're back online. It is NOT recorded until then.", false);
        openAttendance();
        return true;
    } catch (err) { return false; }
}

async function flushQueue() {
    if (flushing) return;
    flushing = true;
    try {
        while (getQueue().length) {
            const item = getQueue()[0];
            const when = new Date(item.clientTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
            let r;
            try {
                r = await callBackend(Object.assign({ type: "log", queued: true }, item));
            } catch (err) { break; }
            setQueue(getQueue().filter((x) => x.queueId !== item.queueId));
            if (r.status === "SUCCESS") queueNote(`✓ Your saved ${item.action} from ${when} has been recorded.`, true);
            else if (r.status === "NO_CHECK_IN") queueNote(`Your saved ${item.action} from ${when} wasn't recorded: you weren't checked in at that site. Tell an admin if this is wrong.`, false);
            else if (r.status === "ALREADY_CHECKED_IN") queueNote(`Your saved ${item.action} from ${when} wasn't recorded: you were already checked in. Tell an admin if this is wrong.`, false);
            else queueNote(`Your saved ${item.action} from ${when} couldn't be recorded: ${r.reason || "unknown error"}. Tell an admin.`, false);
        }
    } finally { flushing = false; }
}

// --- My invoices ---
let myInvoices = [];

async function openMyInvoices() {
    showScreen("invlist", "My Invoices", "Download your invoices");
    startIdleTimer(QA_IDLE_MS);
    const msg = document.getElementById("invlist-msg"), body = document.getElementById("invlist-body"), sum = document.getElementById("invlist-summary");
    msg.innerText = "Loading...";
    body.innerHTML = "";
    sum.classList.add("hidden");
    try {
        const r = await callBackend({ type: "myInvoices", pin: enteredPin });
        if (r.status !== "SUCCESS") { msg.innerText = r.reason || "Could not load your invoices."; return; }
        msg.innerText = "";
        myInvoices = r.invoices;
        if (r.history && r.taxYear) {
            const t = r.taxYear;
            sum.innerHTML = `<b>This tax year</b> (from ${dmyFull(t.thisStart)})<br>${t.thisHours.toFixed(2)} hours | ${gbp(t.thisTotal)}` +
                            `<br><br><b>Last tax year</b> (from ${dmyFull(t.lastStart)})<br>${t.lastHours.toFixed(2)} hours | ${gbp(t.lastTotal)}`;
            sum.classList.remove("hidden");
        }
        document.getElementById("invlist-note").innerText = r.history
            ? "Showing this tax year and last tax year (6 April to 5 April). Totals add up the invoices you've submitted."
            : "Invoice history is switched off for your account, so only your most recent invoice is shown.";
        body.innerHTML = myInvoices.length
            ? myInvoices.map((inv, i) =>
                `<div class="inv-card"><div><b>${dmyFull(inv.from)} - ${dmyFull(inv.to)}</b><br>${inv.totalHours.toFixed(2)} hours | ${gbp(inv.totalAmount)}<br>` +
                `<small>${escHtml(inv.id)} | submitted ${dmyFull(inv.submitted.slice(0, 10))}</small></div>` +
                `<button type="button" onclick="downloadMyInvoice(${i})">PDF</button></div>`).join("")
            : "<p class='note-small'>No invoices yet.</p>";
    } catch (err) {
        msg.innerText = "Network issue. Please try again.";
    }
}

function downloadMyInvoice(i) { printInvoice(myInvoices[i]); }

function updateHoursLabels() {
    const sub = document.getElementById("hrs-sub");
    if (sub) sub.innerText = userCanInvoice ? "View Hours & Create Invoice" : "View Hours";
    document.querySelectorAll(".hours-btn").forEach((b) => { b.innerText = userCanInvoice ? "My hours & invoices" : "My hours"; });
}

// --- Install as an app ---
let installPrompt = null;
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    if (!isInstalled()) document.getElementById("install-btn").classList.remove("hidden");
});

document.getElementById("install-btn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    document.getElementById("install-btn").classList.add("hidden");
});

window.addEventListener("appinstalled", () => document.getElementById("install-btn").classList.add("hidden"));

// --- My details ---
const DETAIL_FIELDS = { business: "d-biz", address: "d-addr", regNo: "d-reg", vat: "d-vat", utr: "d-utr", email: "d-email", phone: "d-phone", payment: "d-pay" };

async function openDetails() {
    showScreen("details", "My Details", "Used on your invoices");
    startIdleTimer(QA_IDLE_MS);
    const msg = document.getElementById("details-msg");
    msg.style.color = "";
    msg.innerText = "Loading...";
    try {
        const r = await callBackend({ type: "myDetails", pin: enteredPin });
        if (r.status !== "SUCCESS") { msg.innerText = r.reason || "Could not load your details."; return; }
        for (const k in DETAIL_FIELDS) document.getElementById(DETAIL_FIELDS[k]).value = r.details[k] || "";
        msg.innerText = "";
    } catch (err) {
        msg.innerText = "Network issue. Please try again.";
    }
}

async function saveMyDetails() {
    if (busy) return;
    const msg = document.getElementById("details-msg"), details = {};
    for (const k in DETAIL_FIELDS) details[k] = document.getElementById(DETAIL_FIELDS[k]).value;
    busy = true;
    msg.style.color = "#4ade80";
    msg.innerText = "Saving...";
    try {
        const r = await callBackend({ type: "saveDetails", pin: enteredPin, details: details });
        if (r.status === "SUCCESS") {
            if (hoursData) hoursData.details = r.details;
            msg.innerText = "✓ Saved. These will be used on your next invoice.";
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

document.getElementById("details-screen").addEventListener("input", () => startIdleTimer(QA_IDLE_MS));

// --- Daily diary ---
let dy = { entries: [], checkins: [], today: "", cur: null, dirty: false };
const DY_MAX = 6;
const dyDay = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
const dyMsg = (t, ok) => { const el = document.getElementById("dy-msg"); el.innerText = t; el.style.color = ok ? "#4ade80" : ""; };

async function openDiary() {
    showScreen("diary", "Daily Diary", "Notes and photos for each job");
    startIdleTimer(QA_IDLE_MS);
    document.getElementById("dy-edit").classList.add("hidden");
    document.getElementById("dy-list").classList.remove("hidden");
    dy.cur = null;
    dy.dirty = false;
    await dyLoad();
}

async function dyLoad() {
    const box = document.getElementById("dy-cards");
    box.innerHTML = '<p class="note-small">Loading...</p>';
    try {
        const r = await callBackend({ type: "diaryToday", pin: enteredPin });
        if (r.status !== "SUCCESS") { box.innerHTML = `<p class="error-msg">${escHtml(r.reason || "Could not load your diary.")}</p>`; return; }
        dy.entries = r.entries; dy.checkins = r.checkins; dy.today = r.today;
        renderDiaryList();
    } catch (err) {
        box.innerHTML = '<p class="error-msg">No signal. The diary needs a signal to load and save. Please try again.</p>';
    }
}

function renderDiaryList() {
    const todayE = dy.entries.filter((e) => e.date === dy.today), older = dy.entries.filter((e) => e.date !== dy.today), have = {};
    todayE.forEach((e) => { have[e.siteId] = true; });
    const pending = dy.checkins.filter((c) => !have[c.siteId]);
    const pill = (e) => e.status === "Submitted" ? '<span class="dy-pill done">Submitted</span>' : '<span class="dy-pill draft">Draft</span>';
    const entryCard = (e) => `<button type="button" class="dy-card" onclick="dyOpenEntry('${escHtml(e.id)}')"><span><b>${escHtml(e.siteName)}</b>` +
        `<small>${e.date === dy.today ? "Today" : dyDay(e.date)} | ${e.before.length} before, ${e.after.length} after</small></span>${pill(e)}</button>`;
    let html = todayE.map(entryCard).join("") +
        pending.map((c) => `<button type="button" class="dy-card" onclick="dyStartNew('${escHtml(c.siteId)}')"><span><b>${escHtml(c.siteName)}</b>` +
            `<small>Checked in today. Tap to start your diary.</small></span><span class="dy-pill">Not started</span></button>`).join("");
    if (!todayE.length && !pending.length) html += '<p class="note-small">Nothing started for today yet. Check in at a site, or add an entry below.</p>';
    if (older.length) html += '<h3 class="dy-sub">Unfinished from earlier days</h3>' + older.map(entryCard).join("");
    document.getElementById("dy-cards").innerHTML = html;

    const taken = {};
    todayE.forEach((e) => { taken[e.siteId] = true; });
    pending.forEach((c) => { taken[c.siteId] = true; });
    const free = userSites.filter((x) => !taken[x.id]);
    document.getElementById("dy-site").innerHTML = '<option value="">Choose a project...</option>' + free.map((x) => `<option value="${escHtml(x.id)}">${escHtml(x.name)}</option>`).join("");
    document.getElementById("dy-add").classList.toggle("hidden", !free.length);
}

function dyStartSelected() {
    const id = document.getElementById("dy-site").value;
    if (!id) return;
    dyStartNew(id);
}

function dyStartNew(siteId) {
    const site = userSites.find((x) => x.id === siteId) || dy.checkins.find((c) => c.siteId === siteId);
    if (!site) return;
    dyEdit({ id: "", date: dy.today, siteId: siteId, siteName: site.name || site.siteName, status: "New", notes: "", before: [], after: [] });
}

function dyOpenEntry(id) {
    const e = dy.entries.find((x) => x.id === id);
    if (!e) return;
    dyEdit({ id: e.id, date: e.date, siteId: e.siteId, siteName: e.siteName, status: e.status, notes: e.notes,
             before: e.before.map((p) => ({ id: p })), after: e.after.map((p) => ({ id: p })) });
    dyLoadPhotos();
}

function dyEdit(cur) {
    dy.cur = cur;
    dy.dirty = false;
    const ro = cur.status === "Submitted";
    document.getElementById("dy-list").classList.add("hidden");
    document.getElementById("dy-edit").classList.remove("hidden");
    document.getElementById("dy-title").innerText = cur.siteName;
    document.getElementById("dy-meta").innerText = (cur.date === dy.today ? "Today" : dyDay(cur.date)) + " | " + (ro ? "Submitted" : cur.status === "Draft" ? "Draft saved" : "New entry");
    const notes = document.getElementById("dy-notes");
    notes.value = cur.notes;
    notes.readOnly = ro;
    ["dy-btns-b", "dy-btns-a", "dy-save", "dy-submit"].forEach((id) => document.getElementById(id).classList.toggle("hidden", ro));
    document.getElementById("dy-discard").classList.toggle("hidden", ro || !cur.id);
    dyMsg("");
    dyThumbs("b");
    dyThumbs("a");
    window.scrollTo(0, 0);
}

function dyThumbs(sec) {
    const c = dy.cur, list = sec === "b" ? c.before : c.after, ro = c.status === "Submitted";
    const box = document.getElementById("dy-thumbs-" + sec);
    box.className = "thumbs" + (ro ? " big" : "");
    box.innerHTML = list.map((p, i) => {
        const src = p.data || p.url;
        return `<div class="thumb">${src ? `<img src="${src}" alt="Photo ${i + 1}">` : '<div style="width:100%;height:60px;background:#334155;border-radius:8px"></div>'}` +
               (ro ? "" : `<button type="button" onclick="dyRemove('${sec}', ${i})">&times;</button>`) + "</div>";
    }).join("");
    document.getElementById("dy-count-" + sec).innerText = ro ? "" : `(${list.length} of ${DY_MAX})`;
}

function dyRemove(sec, i) {
    (sec === "b" ? dy.cur.before : dy.cur.after).splice(i, 1);
    dy.dirty = true;
    dyThumbs(sec);
}

async function dyLoadPhotos() {
    const c = dy.cur;
    if (!c || !c.id || !(c.before.length || c.after.length)) return;
    try {
        const r = await callBackend({ type: "diaryPhotos", pin: enteredPin, entryId: c.id });
        if (r.status !== "SUCCESS" || dy.cur !== c) return;
        c.before.forEach((p, i) => { if (p.id && r.before[i]) p.url = r.before[i]; });
        c.after.forEach((p, i) => { if (p.id && r.after[i]) p.url = r.after[i]; });
        dyThumbs("b");
        dyThumbs("a");
    } catch (err) {}
}

async function saveDiary(submit) {
    if (busy || !dy.cur) return;
    const c = dy.cur, notes = document.getElementById("dy-notes").value.trim();
    if (submit) {
        if (!notes) return dyMsg("Please write what was done today.");
        if (!c.before.length || !c.after.length) return dyMsg("Please add at least one before photo and one after photo, or save a draft and add the after photos later.");
    } else if (!notes && !c.before.length && !c.after.length) {
        return dyMsg("Add some notes or a photo first.");
    }
    busy = true;
    dyMsg(submit ? "Submitting. Uploading photos can take a minute..." : "Saving your draft. Uploading photos can take a minute...", true);
    try {
        const r = await callBackend({
            type: "diarySave", pin: enteredPin, entryId: c.id, siteId: c.siteId, notes: notes, submit: submit,
            keepBefore: c.before.filter((p) => p.id).map((p) => p.id), keepAfter: c.after.filter((p) => p.id).map((p) => p.id),
            addBefore: c.before.filter((p) => p.data).map((p) => p.data), addAfter: c.after.filter((p) => p.data).map((p) => p.data)
        });
        if (r.status !== "SUCCESS") { dyMsg(r.reason || "Something went wrong. Please try again."); return; }
        const e = r.entry;
        const rebuild = (list, ids) => {
            const kept = list.filter((p) => p.id), added = list.filter((p) => p.data);
            return kept.concat(added.map((p, i) => ({ id: ids[kept.length + i], url: p.data })));
        };
        c.before = rebuild(c.before, e.before);
        c.after = rebuild(c.after, e.after);
        c.id = e.id; c.date = e.date; c.status = e.status; c.notes = e.notes;
        dy.dirty = false;
        if (submit) {
            dyMsg("✓ Diary submitted. Thank you.", true);
            setTimeout(() => { if (currentScreen === "diary") openDiary(); }, 1500);
        } else {
            dyEdit(c);
            dyMsg("✓ Draft saved. You can come back later today to add your after photos.", true);
        }
    } catch (err) {
        dyMsg("No signal. Nothing was lost on this screen, please try again.");
    } finally {
        busy = false;
    }
}

async function dyDiscard() {
    if (busy || !dy.cur || !dy.cur.id) return;
    if (!confirm("Delete this draft and its photos? This can't be undone.")) return;
    busy = true;
    try {
        const r = await callBackend({ type: "diaryDiscard", pin: enteredPin, entryId: dy.cur.id });
        if (r.status !== "SUCCESS") { dyMsg(r.reason || "Could not delete the draft."); return; }
        dy.dirty = false;
        openDiary();
    } catch (err) {
        dyMsg("No signal. Please try again.");
    } finally {
        busy = false;
    }
}

function diaryBack() {
    if (!document.getElementById("dy-edit").classList.contains("hidden")) {
        if (dy.dirty && !confirm("You have unsaved changes. Leave without saving?")) return;
        openDiary();
        return;
    }
    goHome();
}

document.getElementById("diary-screen").addEventListener("change", async (e) => {
    const inp = e.target.closest("input[data-sec]");
    if (!inp || !dy.cur) return;
    const list = inp.dataset.sec === "b" ? dy.cur.before : dy.cur.after;
    const files = Array.from(inp.files);
    if (files.length > DY_MAX - list.length) dyMsg(`Up to ${DY_MAX} photos in each section.`);
    for (const f of files.slice(0, DY_MAX - list.length)) list.push({ data: await resizeImage(f) });
    inp.value = "";
    dy.dirty = true;
    dyThumbs(inp.dataset.sec);
});

document.getElementById("dy-notes").addEventListener("input", () => { dy.dirty = true; });
["input", "click"].forEach((ev) => document.getElementById("diary-screen").addEventListener(ev, () => startIdleTimer(QA_IDLE_MS)));

// --- Help & FAQ ---
function openFaq() { showScreen("faq", "Help & FAQ", "Common questions"); }
function closeFaq() { showScreen("pin", "Site Login", "Enter your PIN"); }

// --- Keyboard entry on the PIN screen ---
document.addEventListener("keydown", (e) => {
    if (document.getElementById("pin-screen").classList.contains("hidden")) return;
    if (/^\d$/.test(e.key)) pressKey(e.key);
    else if (e.key === "Backspace" && !busy) { enteredPin = enteredPin.slice(0, -1); updatePinDots(); }
    else if (e.key === "Enter") submitPin();
});

// --- Footer year & static icons ---
document.getElementById("footer-year").innerText = new Date().getFullYear();
hydrateStaticIcons();
updateUserPill("", "");

showVersion();

// --- Start-up ---
updateQueueBanner();
flushQueue();
window.addEventListener("online", flushQueue);
setInterval(flushQueue, 30000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
