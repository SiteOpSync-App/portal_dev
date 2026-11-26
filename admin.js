// Must match the URL in app.js
const APPS_SCRIPT_URL = SITE_CONFIG.appsScriptUrl;   // set per deployment in config.js

// --- VERSION: current release is below. Keep ALL files on the same number (see README.md) ---
const APP_VERSION = "1.26.0";
let lastScriptV = "";
let dlgCleanup = null;

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

const token = sessionStorage.getItem("adminToken");
if (!token) location.href = "index.html";

const $ = (id) => document.getElementById(id);
const dlg = $("dlg");
dlg.addEventListener("close", () => {
    dlg.classList.remove("wide");
    $("df").oninput = null;
    $("df").onchange = null;
    $("ds").innerText = "Save";
    if (typeof dlgCleanup === "function") {
        dlgCleanup();
        dlgCleanup = null;
    }
});
const state = { Users: [], Sites: [], logs: [], qa: null, qq: null, inv: null, attn: [], inst: null, features: null };

// Sections this client has switched on (the server also refuses requests for the others)
const TAB_FEATURE = { diary: "diary", hours: "attendance", attention: "attendance", invoices: "hours", qareports: "qa", qchecklist: "qa", installs: "progress", applications: "applications", qr: "qr" };
function feat(k) { return !state.features || state.features[k] !== false; }

function applyAdminFeatures() {
    document.querySelectorAll("nav button").forEach((b) => { const k = TAB_FEATURE[b.dataset.tab]; b.hidden = !!k && !feat(k); });
    const active = document.querySelector("nav button.active");
    if (active && active.hidden) {
        const first = Array.from(document.querySelectorAll("nav button")).find((b) => !b.hidden);
        if (first) first.click();
    }
}
const findLog = (row) => state.logs.find((x) => x.row === row) || state.attn.find((x) => x.row === row);

const SCHEMAS = {
    Users: [   // column order matches the Users sheet; "hidden" ones are only shown in the Add/Edit window
        { l: "Name" },
        { l: "PIN", mask: true },
        { l: "Status" },
        { l: "Role" },
        { l: "Business" },
        { hidden: true }, { hidden: true }, { hidden: true }, { hidden: true },
        { l: "Email" },
        { hidden: true }, { hidden: true },
        { hidden: true }, { hidden: true }
    ],
    Sites: [
        { hidden: true }, { l: "Site name" }, { l: "Latitude" }, { l: "Longitude" },
        { l: "Radius (metres)", def: "125" },
        { l: "Status", o: ["Active", "Inactive"] },
        { l: "Main contractor" },
        { l: "Project number" },
        { l: "Address / postcode" },
        { l: "Installer", def: "iGlaze" },
        { hidden: true }   // Payment setup (JSON), edited from "Stages & rates"
    ]
};

async function api(op, extra) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ type: "admin", token, op }, extra))
    });
    const r = await res.json();
    showVersion(r.version);
    if (r.expired) { alert(r.reason); logout(); }
    return r;
}

function logout() { sessionStorage.clear(); location.href = "index.html"; }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jsArg = (v) => esc(JSON.stringify(String(v)));

// ---------- Refresh ----------
function stamp() {
    $("updated").innerText = "Updated " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

async function refreshData() {
    $("updated").innerText = "Refreshing...";
    await loadLists();
    await Promise.all([feat("attendance") ? loadHours() : null, state.qa && feat("qa") ? loadQa() : null, state.inv && feat("hours") ? loadInv() : null,
                       state.qq && feat("qa") ? loadQq() : null, feat("progress") ? loadInst() : null, feat("attendance") ? loadAttn() : null, feat("diary") && !$("diary").hidden ? loadDiary() : null]);
}

// ---------- Tabs ----------
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    ["hours", "diary", "attention", "invoices", "qareports", "qchecklist", "Users", "Sites", "installs", "applications", "qr"].forEach((t) => { $(t).hidden = t !== b.dataset.tab; });
    if (b.dataset.tab === "attention") loadAttn();
    if (b.dataset.tab === "qchecklist" && !state.qq) loadQq();
    if (b.dataset.tab === "installs" && !state.inst) loadInst();
    if (b.dataset.tab === "applications") loadApps();
    if (b.dataset.tab === "diary") loadDiary();
    if (b.dataset.tab === "invoices" && !state.inv) loadInv();
    if (b.dataset.tab === "qareports" && !state.qa) loadQa();
}));

// ---------- Users & Sites ----------
async function loadLists() {
    const r = await api("list");
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.Users = r.Users; state.Sites = r.Sites;
    state.features = r.features || state.features;
    applyAdminFeatures();
    renderTable("Users"); renderTable("Sites"); fillQrSites(); fillInstSites(); fillAppSites(); stamp();
}

// Projects tab: one card per site, with the project details that fill the QA form header
function renderSiteCards() {
    const line = (l, x) => x ? `<div class="pl"><span>${l}</span>${esc(x)}</div>` : "";
    $("t-Sites").innerHTML = state.Sites.length ? state.Sites.map((r) => {
        const v = r.v, off = v[5] === "Inactive", n = (state.inst || []).filter((x) => x.v[1] === v[0]).length;
        const su = paySetupOf(v), value = (state.inst || []).filter((x) => x.v[1] === v[0] && x.v[7] !== "Inactive").reduce((a, x) => a + (x.price || 0), 0);
        return `<div class="pcard${off ? " off" : ""}"><div class="ph"><b>${esc(v[1] || v[0])}</b><span class="pill${off ? " warn" : ""}">${off ? "Inactive" : "Active"}</span></div>` +
            line("Project no.", v[7]) + line("Address", v[8]) + line("Main contractor", v[6]) + line("Installer", v[9]) + line("Check-in radius", (v[4] || "125") + "m") +
            line("Payment stages", su ? su.stages.map((x) => `${x.name} ${x.pct}%`).join(" | ") : "") + line("Contract value", su ? invMoney(value) : "") +
            `<div class="pbtns">${feat("qa") ? `<button class="small" onclick="viewProject(${r.row})">View</button>` : ""}${feat("progress") ? `<button class="small ghost" onclick="showInstalls(${r.row})">Installations (${n})</button><button class="small ghost" onclick="openPay(${r.row})">Stages &amp; rates</button>` : ""}${feat("applications") ? `<button class="small ghost" onclick="showApps(${r.row})">Applications</button>` : ""}<button class="small ghost" onclick="openEdit('Sites', ${r.row})">Edit</button>` +
            `<button class="small danger" onclick="del('Sites', ${r.row})">Delete</button></div></div>`;
    }).join("") : "<p class='note'>No projects yet. Click + Add project.</p>";
}

function renderTable(tab) {
    if (tab === "Sites") return renderSiteCards();
    const fields = SCHEMAS[tab].filter((f) => !f.hidden);
    const head = fields.map((f) => `<th>${esc(f.l.replace(/ \(.*/, ""))}</th>`).join("") + "<th></th>";
    const body = state[tab].map((r) => {
        const cells = SCHEMAS[tab].map((f, i) => f.hidden ? "" : `<td>${f.mask ? "••••" : esc(r.v[i])}</td>`).join("");
        const mail = tab === "Users" && r.v[9] && r.v[3] !== "Admin" ? `<button class="small" onclick="openOnboard(${r.row})">Email</button>` : "";
        return `<tr>${cells}<td class="act">${mail}<button class="small" onclick="openEdit('${tab}', ${r.row})">Edit</button>` +
               `<button class="small danger" onclick="del('${tab}', ${r.row})">Delete</button></td></tr>`;
    }).join("");
    $("t-" + tab).innerHTML = `<tr>${head}</tr>${body}`;
}

function openEdit(tab, row) {
    if (tab === "Users") return openUserEdit(row);
    const cur = state[tab].find((r) => r.row === row);
    $("dt").innerText = (row ? "Edit " : "Add ") + (tab === "Users" ? "user" : "project");
    $("de").innerText = "";
    $("df").innerHTML = SCHEMAS[tab].map((f, i) => {
        if (f.hidden) return "";
        const val = cur ? cur.v[i] : (f.o ? f.o[0] : (f.def || ""));
        const input = f.o
            ? `<select data-i="${i}">${f.o.map((o) => `<option${o === val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`
            : `<input data-i="${i}" value="${esc(val)}">`;
        return `<label class="field">${esc(f.l)}${input}</label>`;
    }).join("");
    if (tab === "Sites") {
        $("df").insertAdjacentHTML("beforeend", '<button class="ghost" type="button" onclick="openPicker()">&#128205; Pick location on map</button>');
    }
    $("ds").onclick = () => saveRow(tab, row, cur);
    dlg.showModal();
}

async function saveRow(tab, row, cur) {
    const values = SCHEMAS[tab].map((f, i) => {
        if (f.hidden) return cur ? cur.v[i] : "";
        return $("df").querySelector(`[data-i="${i}"]`).value;
    });
    $("de").innerText = "Saving...";
    const r = await api("save", { tab, row, values });
    if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
    dlg.close();
    loadLists();
}

async function del(tab, row) {
    const cur = state[tab].find((r) => r.row === row);
    if (!confirm(`Delete "${tab === "Sites" ? cur.v[1] : cur.v[0]}"? This can't be undone.`)) return;
    const r = await api("delete", { tab, row, key: cur.v[0] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadLists();
}

// ---------- Hours ----------
// Display dates as dd/mm/yyyy (data stays yyyy-mm-dd underneath)
const dmy = (s) => String(s).replace(/^(\d{4})-(\d\d)-(\d\d)/, "$3/$2/$1");
const dmyAll = (s) => String(s).replace(/(\d{4})-(\d\d)-(\d\d)/g, "$3/$2/$1");
// Rows an admin has edited show as ADMIN UPDATED (also covers rows edited before this change)
const statusOf = (v) => (v[13] && (v[5] === "MANUAL" || v[5] === "SUCCESS")) ? "ADMIN UPDATED" : v[5];
// Distance + Google Maps link, from the check-in (H, I) and check-out (K, L) columns
const isMap = (u) => /^https:\/\/www\.google\.com\/maps/.test(u);
const locBit = (d, u, row, w) => (!d || d === "N/A") ? "-" : isMap(u) ? `<a href="#" onclick="showMap(${row}, '${w}'); return false;">${esc(d)} &#128205;</a>` : esc(d);
const locCell = (v, row) => `In ${locBit(v[7], v[8], row, "in")}<br>Out ${locBit(v[10], v[11], row, "out")}`;
const toLocal = (s) => /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s) ? s.replace(" ", "T") : "";
const mins = (a, b) => (toLocal(a) && toLocal(b)) ? Math.round((new Date(toLocal(b)) - new Date(toLocal(a))) / 60000) : null;
const hm = (m) => m === null ? "" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

function visibleLogs() {
    const emp = $("f-emp").value.trim().toLowerCase();
    return state.logs.filter((r) =>
        (r.v[5] !== "FAILED" || $("f-failed").checked) && (!emp || r.v[1].toLowerCase().includes(emp)));
}

async function loadHours() {
    const r = await api("logs", { from: $("f-from").value, to: $("f-to").value });
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.logs = r.rows.reverse();   // newest first
    renderHours();
    stamp();
}

// "On site" pill: shown in the Out column until the person checks out
function isOpen(v) { return v[2] === "Check-In" && v[5] === "SUCCESS" && !v[9]; }
function isOnSite(v) { return isOpen(v) && v[0].slice(0, 10) >= iso(new Date(Date.now() - 864e5)); }
function openPill(v) {
    if (!isOpen(v)) return "";
    return isOnSite(v) ? '<span class="pill">On site</span>' : '<span class="pill warn">No check-out</span>';
}

function renderHours() {
    const rows = visibleLogs(), totals = {};
    const body = rows.map((r) => {
        const v = r.v, m = mins(v[0], v[9]);
        if (m !== null && v[5] !== "FAILED") totals[v[1]] = (totals[v[1]] || 0) + m;
        const day = (v[0].match(/^\d{4}-\d\d-\d\d/) || v[9].match(/^\d{4}-\d\d-\d\d/) || [""])[0];
        const st = statusOf(v), cls = st === "FAILED" ? "failed" : st === "MANUAL" ? "manual" : "";
        const note = [v[6], v[12]].filter(Boolean).join(" | ");
        return `<tr class="${cls}"><td>${dmy(day)}</td><td>${esc(v[1])}</td><td>${esc(v[4] || v[3])}</td>` +
               `<td>${esc(dmy(v[0]))}</td><td>${v[9] ? esc(dmy(v[9])) : openPill(v)}</td><td>${hm(m)}</td><td>${locCell(v, r.row)}</td><td>${esc(st)}</td><td>${esc(note)}</td><td>${esc(dmyAll(v[13]))}</td>` +
               `<td class="act"><button class="small" onclick="editLog(${r.row})">Edit</button>` +
               `<button class="small danger" onclick="delLog(${r.row})">Delete</button></td></tr>`;
    }).join("");
    $("t-hours").innerHTML = `<tr><th>Date</th><th>Employee</th><th>Site</th><th>In</th><th>Out</th><th>Hours</th><th>Location</th><th>Status</th><th>Notes</th><th>Admin comment</th><th></th></tr>${body}`;
    const onNow = rows.filter((r) => isOnSite(r.v)).length;
    $("summary").innerHTML = (onNow ? `<span class="chip"><span class="dot"></span>${onNow} on site now</span>` : "") +
        Object.keys(totals).sort().map((n) => `<span class="chip">${esc(n)}: <b>${hm(totals[n])}</b></span>`).join("");
}

function editLog(row) {
    const r = findLog(row), v = r.v;
    $("dt").innerText = "Edit hours: " + v[1];
    $("de").innerText = "";
    const prefill = v[13].replace(/^\[Edited by.*?\]( - )?/, "");
    $("df").innerHTML =
        `<label class="field">Check-in<input type="datetime-local" id="e-in" value="${toLocal(v[0])}"></label>` +
        `<label class="field">Check-out<input type="datetime-local" id="e-out" value="${toLocal(v[9])}"></label>` +
        `<p class="field">User comment: ${esc(v[12]) || "none"}</p>` +
        `<label class="field">Admin comment<textarea id="e-c" rows="3" maxlength="300" placeholder="e.g. approved by Liam">${esc(prefill)}</textarea></label>`;
    $("ds").onclick = async () => {
        $("de").innerText = "Saving...";
        const res = await api("editLog", {
            row, key: v[1],
            checkIn: $("e-in").value.replace("T", " "),
            checkOut: $("e-out").value.replace("T", " "),
            adminComment: $("e-c").value
        });
        if (res.status !== "SUCCESS") { $("de").innerText = res.reason; return; }
        dlg.close(); loadHours(); loadAttn();
    };
    dlg.showModal();
}

async function delLog(row) {
    const r = findLog(row);
    if (!confirm(`Delete this log row for ${r.v[1]}? This can't be undone.`)) return;
    const res = await api("deleteLog", { row, key: r.v[1] });
    if (res.status !== "SUCCESS") return alert(res.reason);
    loadHours(); loadAttn();
}

function exportCsv() {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [["Date", "Employee", "Site", "In", "Out", "Hours", "In Distance", "In Map", "Out Distance", "Out Map", "Status", "Notes", "Admin Comment"].join(",")];
    visibleLogs().forEach((r) => {
        const v = r.v, m = mins(v[0], v[9]);
        const day = (v[0].match(/^\d{4}-\d\d-\d\d/) || v[9].match(/^\d{4}-\d\d-\d\d/) || [""])[0];
        lines.push([dmy(day), v[1], v[4] || v[3], dmy(v[0]), dmy(v[9]), m === null ? "" : (m / 60).toFixed(2), v[7], v[8], v[10], v[11], statusOf(v), [v[6], v[12]].filter(Boolean).join(" | "), dmyAll(v[13])].map(q).join(","));
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `attendance-${$("f-from").value}-to-${$("f-to").value}.csv`;
    a.click();
}

setInterval(() => { if (!$("hours").hidden && !dlg.open && feat("attendance")) loadHours(); }, 60000);   // keeps the On site pills up to date
$("f-emp").addEventListener("input", renderHours);
$("f-failed").addEventListener("change", renderHours);

// ---------- Location picker (Leaflet + OpenStreetMap, free, no API key) ----------
const pickdlg = $("pickdlg");
let pickMap = null, pickMarker = null, pickCircle = null, picked = null;
let RADIUS_M = 125;   // set from the Radius field each time the picker opens

function setPick(lat, lng) {
    picked = { lat: lat, lng: lng };
    if (!pickMarker) {
        pickMarker = L.marker([lat, lng], { draggable: true }).addTo(pickMap);
        pickCircle = L.circle([lat, lng], { radius: RADIUS_M, color: "#0284c7", weight: 2, fillOpacity: 0.12 }).addTo(pickMap);
        pickMarker.on("drag", () => pickCircle.setLatLng(pickMarker.getLatLng()));
        pickMarker.on("dragend", () => { const p = pickMarker.getLatLng(); setPick(p.lat, p.lng); });
    } else {
        pickMarker.setLatLng([lat, lng]);
        pickCircle.setLatLng([lat, lng]);
    }
    $("p-info").innerText = `Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// Radius slider + number box: the circle on the map follows as you change it
function setRadius(v, fit) {
    v = Math.min(5000, Math.max(20, Math.round(Number(v) || 125)));
    RADIUS_M = v;
    $("p-rad").value = Math.min(v, 2000);   // slider covers 20-2000m; the box accepts up to 5000m
    $("p-radnum").value = v;
    if (pickCircle) pickCircle.setRadius(v);
    if (fit) fitCircle();
}

function fitCircle() {
    if (pickCircle) pickMap.fitBounds(pickCircle.getBounds(), { maxZoom: 18, padding: [20, 20] });
}

$("p-rad").addEventListener("input", () => setRadius($("p-rad").value, false));
$("p-rad").addEventListener("change", () => fitCircle());
$("p-radnum").addEventListener("input", () => { if (Number($("p-radnum").value) >= 20) setRadius($("p-radnum").value, false); });
$("p-radnum").addEventListener("change", () => setRadius($("p-radnum").value, true));

function openPicker() {
    if (typeof L === "undefined") return alert("The map couldn't load. Check your internet connection and refresh.");
    const latEl = $("df").querySelector('[data-i="2"]'), lngEl = $("df").querySelector('[data-i="3"]');
    const radEl = $("df").querySelector('[data-i="4"]');
    setRadius(Number(radEl.value) || 125, false);
    const has = latEl.value.trim() !== "" && lngEl.value.trim() !== "" && isFinite(Number(latEl.value)) && isFinite(Number(lngEl.value));
    $("p-q").value = "";
    pickdlg.showModal();

    setTimeout(() => {   // wait for the dialog to be visible so the map gets its size
        if (!pickMap) {
            pickMap = L.map("pickmap");
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
            }).addTo(pickMap);
            pickMap.on("click", (e) => setPick(e.latlng.lat, e.latlng.lng));
        }
        pickMap.invalidateSize();
        if (pickMarker) { pickMap.removeLayer(pickMarker); pickMap.removeLayer(pickCircle); pickMarker = pickCircle = null; }
        picked = null;
        if (has) {
            pickMap.setView([Number(latEl.value), Number(lngEl.value)], 17);
            setPick(Number(latEl.value), Number(lngEl.value));
            fitCircle();
        } else {
            pickMap.setView([52.5, -1.5], 6);
            $("p-info").innerText = "Search above, or click the map to place the pin. Use the slider or box below to set the check-in radius (the blue circle).";
        }
    }, 60);

    $("p-use").onclick = () => {
        if (!picked) { $("p-info").innerText = "Click the map to choose a spot first."; return; }
        latEl.value = picked.lat.toFixed(6);
        lngEl.value = picked.lng.toFixed(6);
        radEl.value = String(RADIUS_M);
        pickdlg.close();
    };
}

async function pickSearch() {
    const q = $("p-q").value.trim();
    if (!q) return;
    $("p-info").innerText = "Searching...";
    try {
        const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q));
        const hits = await res.json();
        if (!hits.length) { $("p-info").innerText = "Nothing found. Try a postcode or a fuller address."; return; }
        const lat = Number(hits[0].lat), lng = Number(hits[0].lon);
        pickMap.setView([lat, lng], 17);
        setPick(lat, lng);
        fitCircle();
    } catch (err) {
        $("p-info").innerText = "Search failed. Check your connection, or click the map instead.";
    }
}

$("p-q").addEventListener("keydown", (e) => { if (e.key === "Enter") pickSearch(); });

// ---------- Map pop-up ----------
const mapdlg = $("mapdlg");
mapdlg.addEventListener("close", () => { $("mf").src = "about:blank"; });

function showMap(row, which) {
    const r = state.logs.find((x) => x.row === row);
    if (!r) return;
    const v = r.v, isIn = which === "in";
    const url = isIn ? v[8] : v[11], dist = isIn ? v[7] : v[10], when = isIn ? v[0] : v[9];
    const m = String(url).match(/maps\?q=(-?[\d.]+),(-?[\d.]+)/);
    if (!m) return;
    $("mt").innerText = `${v[1]}: ${isIn ? "check-in" : "check-out"} location`;
    $("mm").innerText = `${dmy(when)} | ${dist} from ${v[4] || v[3]}`;
    $("mf").src = `https://www.google.com/maps?q=${m[1]},${m[2]}&z=17&output=embed`;
    $("ml").href = url;
    mapdlg.showModal();
}

// ---------- Needs attention ----------
async function loadAttn() {
    const r = await api("attention");
    if (r.status !== "SUCCESS") return;
    state.attn = r.rows.reverse();   // newest first
    $("attn-badge").innerText = state.attn.length ? ` (${state.attn.length})` : "";
    renderAttn();
}

function renderAttn() {
    $("t-attn").innerHTML = state.attn.length
        ? "<tr><th>Employee</th><th>Site</th><th>In</th><th>Out</th><th>Issue</th><th></th></tr>" +
          state.attn.map((r) => {
              const v = r.v;
              return `<tr class="manual"><td>${esc(v[1])}</td><td>${esc(v[4] || v[3])}</td><td>${esc(dmy(v[0]))}</td><td>${esc(dmy(v[9]) || "-")}</td><td>${esc(r.issue)}</td>` +
                     `<td class="act"><button class="small" onclick="editLog(${r.row})">Edit</button><button class="small danger" onclick="delLog(${r.row})">Delete</button></td></tr>`;
          }).join("")
        : "<tr><td>Nothing needs attention.</td></tr>";
}

// ---------- Add a shift by hand ----------
function openAddShift() {
    const users = state.Users.filter((r) => r.v[2] !== "Inactive"), sites = state.Sites.filter((r) => r.v[5] !== "Inactive");
    $("dt").innerText = "Add a shift";
    $("de").innerText = "";
    $("df").innerHTML =
        `<label class="field">Employee<select id="s-name">${users.map((r) => `<option>${esc(r.v[0])}</option>`).join("")}</select></label>` +
        `<label class="field">Site<select id="s-site">${sites.map((r) => `<option value="${esc(r.v[0])}">${esc(r.v[1] || r.v[0])}</option>`).join("")}</select></label>` +
        `<label class="field">Check-in<input type="datetime-local" id="s-in"></label>` +
        `<label class="field">Check-out<input type="datetime-local" id="s-out"></label>` +
        `<label class="field">Admin comment<textarea id="s-c" rows="2" maxlength="300" placeholder="e.g. Forgot to scan, confirmed by site manager"></textarea></label>`;
    $("ds").onclick = async () => {
        $("de").innerText = "Saving...";
        const r = await api("addShift", {
            name: $("s-name").value, siteId: $("s-site").value,
            checkIn: $("s-in").value.replace("T", " "), checkOut: $("s-out").value.replace("T", " "),
            adminComment: $("s-c").value
        });
        if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
        dlg.close();
        loadHours();
    };
    dlg.showModal();
}

// ---------- Onboarding email (opens a ready-to-send draft in Outlook; nothing is sent automatically) ----------
const ONBOARD_SUBJECT = "Welcome to the " + CO_SHORT + " Site Portal";

function onboardBody(u, withPin) {
    const role = u.v[3];
    const does = role === "QA" ? "complete quality assurance inspections"
        : role === "Contractor/QA" ? "check in and out of site, complete quality assurance inspections, and view your hours"
        : "check in and out of site and view your hours" + (u.v[12] !== "Off" ? " and create invoices" : "");
    const appUrl = location.origin + location.pathname.replace(/[^/]*$/, "");
    return `Hi ${u.v[0].split(" ")[0]},

You've been set up on the ${CO_SHORT} Site Portal. You'll use it to ${does}.

Open it here: ${appUrl}

${withPin ? "Your PIN is " + u.v[1] + ". Please keep it private." : "Your PIN will be given to you separately. Please keep it private."}

Tips:
- Android (Chrome): tap the three dots, then "Install app". iPhone (Safari): tap Share, then "Add to Home Screen".
- Log in once with signal. After that your PIN also works with no signal for checking in and out.
- There is a Help & FAQ button on the login page.

If you have any problems, just reply to this email.

Thanks,
${sessionStorage.getItem("adminName") || ""}`;
}

function openOnboard(row) {
    const u = state.Users.find((r) => r.row === row);
    $("dt").innerText = "Onboarding email for " + u.v[0];
    $("de").innerText = "";
    $("df").innerHTML =
        `<p class="note" style="margin:0 0 12px">This opens a draft addressed to ${esc(u.v[9])} for you to check and send. Nothing is sent automatically.</p>` +
        `<label class="switch"><input type="checkbox" id="ob-pin"> Include their PIN <small>safer to give it separately, for example by text</small></label>` +
        `<div class="btns" style="flex-wrap:wrap">` +
        `<button type="button" onclick="sendOnboard(${row}, 'work')">Outlook on the web (work)</button>` +
        `<button type="button" class="ghost" onclick="sendOnboard(${row}, 'personal')">Outlook.com (personal)</button>` +
        `<button type="button" class="ghost" onclick="sendOnboard(${row}, 'app')">My email app</button></div>`;
    $("ds").onclick = () => dlg.close();
    $("ds").innerText = "Close";
    dlg.showModal();
}

function sendOnboard(row, how) {
    const u = state.Users.find((r) => r.row === row), body = onboardBody(u, $("ob-pin").checked);
    const q = "to=" + encodeURIComponent(u.v[9]) + "&subject=" + encodeURIComponent(ONBOARD_SUBJECT) + "&body=" + encodeURIComponent(body);
    if (how === "app") location.href = "mailto:" + encodeURIComponent(u.v[9]) + "?subject=" + encodeURIComponent(ONBOARD_SUBJECT) + "&body=" + encodeURIComponent(body);
    else window.open((how === "work" ? "https://outlook.office.com/mail/deeplink/compose?" : "https://outlook.live.com/mail/0/deeplink/compose?") + q, "_blank");
}

// ---------- Generate an unused PIN ----------
function genPin() {
    const len = $("r-admin").checked ? 6 : 4;   // admins need 6+ digits
    const used = new Set(state.Users.map((r) => r.v[1].padStart(4, "0")));
    let p;
    do {
        p = String(Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * 10 ** len)).padStart(len, "0");
    } while (used.has(p));
    $("u-pin").value = p;
}

// ---------- Add / edit user ----------
function openUserEdit(row) {
    const cur = state.Users.find((r) => r.row === row), v = cur ? cur.v : [];
    const g = (i) => esc(v[i] || "");
    const role = v[3] || "";
    const isInv = v[12] !== "Off", isHist = v[13] !== "Off";
    const isAdmin = role === "Admin", isCon = role === "Contractor" || role === "Contractor/QA", isQa = role === "QA" || role === "Contractor/QA";

    $("dt").innerText = row ? "Edit user" : "Add user";
    $("de").innerText = "";
    dlg.classList.add("wide");
    $("df").innerHTML =
        `<label class="field">Name *<input id="u-name" value="${g(0)}"></label>` +
        `<label class="field">PIN * (4 digits; admins 6-8)<span class="inline"><input id="u-pin" value="${g(1)}"><button type="button" class="ghost small" onclick="genPin()">Generate</button></span></label>` +
        `<label class="field">Status<select id="u-status"><option${v[2] !== "Inactive" ? " selected" : ""}>Active</option><option${v[2] === "Inactive" ? " selected" : ""}>Inactive</option></select></label>` +
        `<h3 class="sect">Invoice details (optional)</h3>` +
        `<label class="field">Business name<input id="u-biz" value="${g(4)}"></label>` +
        `<label class="field">Address<textarea id="u-addr" rows="2" maxlength="300">${g(5)}</textarea></label>` +
        `<div class="two"><label class="field">Company reg. number<input id="u-reg" value="${g(6)}"></label><label class="field">VAT number<input id="u-vat" value="${g(7)}"></label></div>` +
        `<div class="two"><label class="field">UTR (CIS)<input id="u-utr" value="${g(8)}"></label><label class="field">Phone<input id="u-phone" value="${g(10)}"></label></div>` +
        `<label class="field">Email<input id="u-email" value="${g(9)}"></label>` +
        `<label class="field">Payment details (shown on invoices)<textarea id="u-pay" rows="2" maxlength="300">${g(11)}</textarea></label>` +
        `<h3 class="sect">Roles * (choose at least one)</h3>` +
        `<label class="switch"><input type="checkbox" id="r-con"${isCon ? " checked" : ""}> Contractor <small>site attendance, hours and invoices</small></label>` +
        `<label class="switch"><input type="checkbox" id="r-qa"${isQa ? " checked" : ""}> QA <small>quality assurance inspections</small></label>` +
        `<label class="switch"><input type="checkbox" id="r-admin"${isAdmin ? " checked" : ""}> Admin <small>dashboard only, so can't also be a contractor</small></label>` +
        `<h3 class="sect">Invoicing (for contractors)</h3>` +
        `<label class="switch"><input type="checkbox" id="u-inv"${isInv ? " checked" : ""}> Invoicing <small>can build and submit invoices</small></label>` +
        `<label class="switch"><input type="checkbox" id="u-hist"${isHist ? " checked" : ""}> Invoice history <small>if off, they only see their most recent invoice</small></label>`;

    const con = $("r-con"), qa = $("r-qa"), adm = $("r-admin");
    adm.onchange = () => { if (adm.checked) { con.checked = false; qa.checked = false; } };
    con.onchange = qa.onchange = () => { if (con.checked || qa.checked) adm.checked = false; };

    $("ds").onclick = async () => {
        const name = $("u-name").value.trim(), pin = $("u-pin").value.trim();
        const role = adm.checked ? "Admin" : (con.checked && qa.checked) ? "Contractor/QA" : con.checked ? "Contractor" : qa.checked ? "QA" : "";
        if (!name) { $("de").innerText = "Please enter a name."; return; }
        if (!pin) { $("de").innerText = "Please enter a PIN."; return; }
        if (!role) { $("de").innerText = "Choose at least one role."; return; }
        const values = [name, pin, $("u-status").value, role, $("u-biz").value, $("u-addr").value, $("u-reg").value, $("u-vat").value,
                        $("u-utr").value, $("u-email").value, $("u-phone").value, $("u-pay").value,
                        $("u-inv").checked ? "On" : "Off", $("u-hist").checked ? "On" : "Off"];
        $("de").innerText = "Saving...";
        const r = await api("save", { tab: "Users", row: row, values: values });
        if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
        dlg.close();
        loadLists();
    };
    dlg.showModal();
}

// ---------- Invoices ----------
async function loadInv() {
    const r = await api("invList", { from: $("inv-from").value, to: $("inv-to").value });
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.inv = r.rows.reverse();   // newest first
    renderInv();
    stamp();
}

function invDays(v) { try { return JSON.parse(v[8]); } catch (err) { return []; } }

function renderInv() {
    const q = $("inv-search").value.trim().toLowerCase();
    const rows = (state.inv || []).filter((r) => !q || r.v[2].toLowerCase().includes(q));
    $("t-inv").innerHTML = "<tr><th>Invoice</th><th>Submitted</th><th>Contractor</th><th>Period</th><th>Hours</th><th>Total</th><th>Daily breakdown</th><th></th></tr>" +
        rows.map((r) => {
            const v = r.v;
            const lines = invDays(v).map((d) =>
                `<div>${new Date(d.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })} ${esc(dmy(d.date))}: ${Number(d.hours).toFixed(2)}h x ${invMoney(d.rate)} = ${invMoney(d.total)}</div>`).join("");
            return `<tr><td>${esc(v[0])}</td><td>${esc(dmy(v[1]))}</td><td>${esc(v[2])}</td><td>${esc(dmy(v[3]))} - ${esc(dmy(v[4]))}</td>` +
                   `<td>${Number(v[5]).toFixed(2)}</td><td><b>${invMoney(v[6])}</b></td><td>${lines}</td>` +
                   `<td class="act"><button class="small" onclick="viewInv(${r.row})">View</button><button class="small" onclick="pdfInv(${r.row})">PDF</button><button class="small danger" onclick="delInv(${r.row})">Delete</button></td></tr>`;
        }).join("");
}

async function delInv(row) {
    const v = state.inv.find((x) => x.row === row).v;
    if (!confirm(`Delete invoice ${v[0]} from ${v[2]} (${invMoney(v[6])})? This can't be undone. The contractor will be able to submit that week again.`)) return;
    const r = await api("delInvoice", { row: row, key: v[0] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadInv();
}

function invFromRow(row) {
    const v = state.inv.find((x) => x.row === row).v;
    let details = {};
    try { details = JSON.parse(v[9] || "{}"); } catch (err) {}
    return { id: v[0], contractor: v[2], from: v[3], to: v[4], submitted: v[1], days: invDays(v), totalHours: Number(v[5]), totalAmount: Number(v[6]), details: details };
}

function pdfInv(row) { printInvoice(invFromRow(row)); }

function viewInv(row) {
    const inv = invFromRow(row);
    openView(`Invoice ${inv.id}: ${inv.contractor}`, invoiceHtml(inv));
}

$("inv-search").addEventListener("input", renderInv);

// ---------- QA checklist ----------
const QA_REPORTS = ["Windows", "Doors", "Curtain Walling"];
const QA_TYPES = { PASSFAIL: "Pass / Fail / N/A", ACCEPT: "Accept / Decline", TEXT: "Free text box" };
const QA_PHOTO_OPTS = { PASSFAIL: [["PASS", "Pass"], ["FAIL", "Fail"]], ACCEPT: [["ACCEPT", "Accept"], ["DECLINE", "Decline"]], TEXT: [["TEXT", "With the answer"]] };
const QA_PHOTO_DEFAULT = { PASSFAIL: ["PASS", "FAIL"], ACCEPT: ["ACCEPT", "DECLINE"], TEXT: [] };

async function loadQq() {
    const r = await api("qList");
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.qq = r.rows;
    renderQq();
}

function renderQq() {
    const rep = $("qq-report").value;
    const list = (state.qq || []).filter((r) => r.v[4] === rep), n = list.length;
    const photoText = (p) => p === "NONE" ? "None" : p.split(",").map((x) => x === "TEXT" ? "Answer" : x.charAt(0) + x.slice(1).toLowerCase()).join(", ");
    $("t-qq").innerHTML = "<tr><th>Order</th><th>Question</th><th>Answer type</th><th>Mandatory</th><th>Photo needed on</th><th>Status</th><th></th></tr>" +
        (list.map((r, i) =>
            `<tr><td class="act"><button class="small ghost" onclick="moveQq(${r.row}, -1)" ${i === 0 ? "disabled" : ""}>&uarr;</button>` +
            `<button class="small ghost" onclick="moveQq(${r.row}, 1)" ${i === n - 1 ? "disabled" : ""}>&darr;</button></td>` +
            `<td><b>${esc(r.v[1])}</b><br><small>${esc(r.v[2])}</small></td><td>${esc(QA_TYPES[r.v[5]] || r.v[5])}</td><td>${esc(r.v[6])}</td>` +
            `<td>${esc(photoText(r.v[7]))}</td><td>${esc(r.v[3])}</td>` +
            `<td class="act"><button class="small" onclick="openQq(${r.row})">Edit</button><button class="small danger" onclick="delQq(${r.row})">Delete</button></td></tr>`).join("")
         || "<tr><td colspan='7'>No questions for this report yet.</td></tr>");
}

$("qq-report").addEventListener("change", renderQq);

function openQq(row) {
    const cur = state.qq.find((r) => r.row === row);
    const v = cur ? cur.v : ["", "", "", "Active", $("qq-report").value, "PASSFAIL", "Yes", "PASS,FAIL"];
    $("dt").innerText = row ? "Edit question" : "Add question";
    $("de").innerText = "";
    $("df").innerHTML =
        `<label class="field">Report<select id="q-report">${QA_REPORTS.map((o) => `<option${o === v[4] ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>` +
        `<label class="field">Question *<input id="q-title" maxlength="80" value="${esc(v[1])}"></label>` +
        `<label class="field">Description / what to check<textarea id="q-desc" rows="2" maxlength="200">${esc(v[2])}</textarea></label>` +
        `<label class="field">Answer type<select id="q-type">${Object.keys(QA_TYPES).map((k) => `<option value="${k}"${k === v[5] ? " selected" : ""}>${esc(QA_TYPES[k])}</option>`).join("")}</select></label>` +
        `<label class="switch"><input type="checkbox" id="q-mand"${v[6] !== "No" ? " checked" : ""}> Mandatory <small>must be answered before submitting</small></label>` +
        `<div class="field">Photo required on<div id="q-photo"></div></div>` +
        `<label class="field">Status<select id="q-status"><option${v[3] !== "Inactive" ? " selected" : ""}>Active</option><option${v[3] === "Inactive" ? " selected" : ""}>Inactive</option></select></label>` +
        `<p class="note">Only new reports use the change. Completed reports are not altered.</p>`;

    const drawPhoto = (type, selected) => {
        $("q-photo").innerHTML = QA_PHOTO_OPTS[type].map((o) =>
            `<label class="switch"><input type="checkbox" data-p="${o[0]}"${selected.indexOf(o[0]) >= 0 ? " checked" : ""}> ${esc(o[1])}</label>`).join("") +
            `<label class="switch"><input type="checkbox" data-p="NONE"${selected.length ? "" : " checked"}> No photo required</label>`;
    };
    drawPhoto(v[5], v[7] === "NONE" ? [] : v[7].split(","));
    $("q-type").onchange = () => drawPhoto($("q-type").value, QA_PHOTO_DEFAULT[$("q-type").value]);
    $("q-photo").onchange = (e) => {
        const t = e.target, boxes = Array.from($("q-photo").querySelectorAll("input"));
        const none = boxes.find((b) => b.dataset.p === "NONE");
        if (t === none) { if (t.checked) boxes.forEach((b) => { if (b !== none) b.checked = false; }); else t.checked = true; }
        else none.checked = !boxes.some((b) => b !== none && b.checked);
    };

    $("ds").onclick = async () => {
        $("de").innerText = "Saving...";
        const photo = Array.from($("q-photo").querySelectorAll("input[data-p]:checked")).map((b) => b.dataset.p).filter((p) => p !== "NONE");
        const report = $("q-report").value;
        const r = await api("qSave", { row: row, key: v[0], title: $("q-title").value, desc: $("q-desc").value, status: $("q-status").value,
                                       report: report, qtype: $("q-type").value, mandatory: $("q-mand").checked ? "Yes" : "No", photo: photo.join(",") || "NONE" });
        if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
        $("qq-report").value = report;
        dlg.close();
        loadQq();
    };
    dlg.showModal();
}

async function delQq(row) {
    const cur = state.qq.find((r) => r.row === row);
    if (!confirm(`Delete "${cur.v[1]}"? New reports won't include it. Reports already completed are not affected.`)) return;
    const r = await api("qDelete", { row: row, key: cur.v[0] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadQq();
}

async function moveQq(row, dir) {
    const r = await api("qMove", { row: row, dir: dir });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadQq();
}

// ---------- QA reports ----------
const photodlg = $("photodlg");

async function loadQa() {
    const r = await api("qaList", { from: $("qa-from").value, to: $("qa-to").value });
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.qa = r.rows.reverse();   // newest first
    renderQa();
    stamp();
}

function renderQa() {
    const q = $("qa-search").value.trim().toLowerCase(), onlyFail = $("qa-fails").checked;
    const rows = (state.qa || []).filter((r) =>
        (!onlyFail || r.v[4] === "FAIL") && (!q || (r.v[1] + " " + r.v[2] + " " + r.v[3] + " " + (r.v[13] || "")).toLowerCase().includes(q)));
    $("t-qa").innerHTML = "<tr><th>Date</th><th>Inspector</th><th>Site</th><th>Type</th><th>Overall</th><th>Checks</th><th>Photos</th><th></th></tr>" +
        rows.map((r) => {
            const v = r.v;
            const checks = v[5].split("\n").map((l) => `<div class="${/: (FAIL|DECLINE)\b/.test(l) ? "failtxt" : ""}">${esc(l)}</div>`).join("");
            return `<tr><td>${esc(dmy(v[0]))}</td><td>${esc(v[1])}</td><td>${esc(v[3] || v[2])}</td><td>${esc(v[8] || "Windows")}${v[13] ? `<br><small>${esc(v[13])}${v[17] === "Yes" ? " (ad hoc)" : ""}</small>` : ""}</td>` +
                   `<td class="${v[4] === "FAIL" ? "failtxt" : "oktxt"}"><b>${esc(v[4])}</b></td><td>${checks}</td>` +
                   `<td>${v[6] ? `<button class="small" onclick="showPhotos(${r.row})">Photos (${v[6]})</button>` : "-"}</td>` +
                   `<td class="act"><button class="small" onclick="viewQa(${r.row})">View</button><button class="small" onclick="pdfQa(${r.row})">PDF</button>` +
                   (v[6] ? `<button class="small danger" onclick="delQaPhotos(${r.row})">Delete photos</button>` : "") +
                   `<button class="small danger" onclick="delQa(${r.row})">Delete</button></td></tr>`;
        }).join("");
}

// Branded one-page report for a QA inspection. "Save as PDF" in the print box to download it.
function qaReportHtml(v, media, note, autoPrint) {
    const logo = new URL(LOGO_FILE, location.href).href;
    const checkRows = v[5].split("\n").map((l, i) => {
        const m = l.match(/^(.*?): (PASS|FAIL|N\/A|ACCEPT|DECLINE|TEXT)(?: - (.*))?$/) || [null, l, "", ""];
        const cls = (m[2] === "PASS" || m[2] === "ACCEPT") ? "pass" : (m[2] === "FAIL" || m[2] === "DECLINE") ? "fail" : "na";
        const shots = (media.checks[i] || []).map((p, n) => `<img src="${p}" alt="Photo ${n + 1}">`).join("");
        return `<tr><td>${invEsc(m[1])}</td><td class="res ${cls}">${m[2] === "TEXT" ? "-" : m[2]}</td><td>${invEsc(m[3] || "")}</td></tr>` +
               (shots ? `<tr class="pics"><td colspan="3">${shots}</td></tr>` : "");
    }).join("");
    // Photo appendix: every photo at full width, captioned with its question and answer
    const items = [];
    v[5].split("\n").forEach((l, i) => {
        const m = l.match(/^(.*?): (PASS|FAIL|N\/A|ACCEPT|DECLINE|TEXT)(?: - (.*))?$/) || [null, l, "", ""];
        (media.checks[i] || []).forEach((p, n) => items.push({ p: p, cap: `${i + 1}. ${m[1]}${m[2] && m[2] !== "TEXT" ? " (" + m[2] + ")" : ""} - photo ${n + 1}` }));
    });
    media.general.forEach((p, i) => items.push({ p: p, cap: `Additional photo ${i + 1}` }));
    const appendix = items.map((x) => `<figure><img src="${x.p}" alt="${invEsc(x.cap)}"><figcaption>${invEsc(x.cap)}</figcaption></figure>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QA report - ${invEsc(v[3] || v[2])} - ${invEsc(invDmy(v[0]).slice(0, 10))}</title>
<style>
@page { margin: 14mm; }
body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; }
.head { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #0284c7; padding-bottom: 12px; }
.head img { height: 58px; }
.head h1 { font-size: 17pt; margin: 0; text-align: right; color: #0f172a; }
.head small { display: block; color: #555; font-size: 9pt; text-align: right; }
.meta { width: 100%; border-collapse: collapse; margin-top: 18px; }
.meta td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
.meta td:first-child { width: 28%; color: #555; font-weight: bold; }
.overall { display: inline-block; padding: 3px 14px; border-radius: 12px; color: #fff; font-weight: bold; }
.overall.PASS { background: #16a34a; } .overall.FAIL { background: #dc2626; }
h2 { font-size: 12pt; margin: 22px 0 6px; color: #0284c7; }
table.checks { width: 100%; border-collapse: collapse; }
table.checks th { background: #0f172a; color: #fff; text-align: left; padding: 7px 8px; font-size: 10pt; }
table.checks td { padding: 7px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
.res { font-weight: bold; text-align: center; width: 70px; }
.res.pass { color: #16a34a; } .res.fail { color: #dc2626; } .res.na { color: #64748b; }
.pics img { height: 130px; margin: 4px 8px 4px 0; border: 1px solid #ccc; }
.pics td { border-bottom: 1px solid #ddd; }
h2.appx { page-break-before: always; }
.appendix figure { margin: 0 0 16px; page-break-inside: avoid; }
.appendix img { display: block; width: 100%; max-height: 215mm; object-fit: contain; border: 1px solid #ccc; background: #f1f5f9; }
.appendix figcaption { font-size: 10pt; color: #333; margin-top: 4px; font-weight: bold; }
.foot { margin-top: 26px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8.5pt; color: #666; }
</style></head><body>
<div class="head"><img src="${logo}" alt="${invEsc(CO)}"><div><h1>Quality Assurance<br>Inspection Report</h1></div></div>
<table class="meta">
<tr><td>Project / site</td><td>${invEsc(v[3] || v[2])}</td></tr>
${v[10] ? `<tr><td>Project number</td><td>${invEsc(v[10])}</td></tr>
` : ""}${v[12] ? `<tr><td>Address</td><td>${invEsc(v[12])}</td></tr>
` : ""}${v[9] ? `<tr><td>Main contractor</td><td>${invEsc(v[9])}</td></tr>
` : ""}${v[11] ? `<tr><td>Installer</td><td>${invEsc(v[11])}</td></tr>
` : ""}<tr><td>Report type</td><td>${invEsc(v[8] || "Windows")}</td></tr>
${v[13] ? `<tr><td>Installation reference</td><td>${invEsc(v[13])}${v[17] === "Yes" ? " (ad hoc)" : ""}</td></tr>
` : ""}${v[14] ? `<tr><td>Phase</td><td>${invEsc(v[14])}</td></tr>
` : ""}${v[15] ? `<tr><td>Elevation / level</td><td>${invEsc(v[15])}</td></tr>
` : ""}${v[16] ? `<tr><td>Drawings</td><td>${invEsc(v[16])}</td></tr>
` : ""}
<tr><td>Inspector</td><td>${invEsc(v[1])}</td></tr>
<tr><td>Date and time</td><td>${invEsc(invDmy(v[0]))}</td></tr>
<tr><td>Overall result</td><td><span class="overall ${invEsc(v[4])}">${invEsc(v[4])}</span></td></tr>
</table>
<h2>Inspection checks</h2>
<table class="checks"><tr><th>Check</th><th>Result</th><th>Notes / defects</th></tr>${checkRows}</table>
${v[7] ? `<h2>Additional information</h2><p>${invMulti(v[7])}</p>` : ""}
${appendix ? `<h2 class="appx">Appendix: photographs</h2><div class="appendix">${appendix}</div>` : ""}
${note ? `<p style="color:#b45309">${invEsc(note)}</p>` : ""}
<div class="foot">Generated ${new Date().toLocaleString("en-GB")} | ${invEsc(CO)} | Confidential</div>
${autoPrint ? "<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>" : ""}
</body></html>`;

    return html;
}

function printQaReport(v, media, w, note) {
    w.document.open();
    w.document.write(qaReportHtml(v, media, note, true));
    w.document.close();
}

// ---------- View a document in a pop-up (with a Download PDF button) ----------
const viewdlg = $("viewdlg");
viewdlg.addEventListener("close", () => { $("vw-frame").srcdoc = ""; });

function openView(title, html) {
    $("vw-title").innerText = title;
    $("vw-frame").srcdoc = html;
    viewdlg.showModal();
}

function printView() {
    const f = $("vw-frame");
    f.contentWindow.focus();
    f.contentWindow.print();
}

async function viewQa(row, vOverride) {
    const v = vOverride || state.qa.find((x) => x.row === row).v;
    openView(`QA report: ${v[3] || v[2]} (${dmy(v[0]).slice(0, 10)})`, "<p style='font-family:Arial;padding:20px'>Loading report...</p>");
    let media = { general: [], checks: [] }, note = "";
    if (Number(v[6])) {
        const r = await api("qaPhotos", { row: row });
        if (r.status === "SUCCESS") media = { general: r.photos || [], checks: r.checkPhotos || [] };
        else note = "The photos could not be loaded: " + r.reason;
    }
    $("vw-frame").srcdoc = qaReportHtml(v, media, note, false);
}

async function pdfQa(row) {
    const v = state.qa.find((x) => x.row === row).v;
    const w = window.open("", "_blank");   // opened straight away so the pop-up blocker allows it
    if (!w) { alert("Please allow pop-ups for this site to download the report."); return; }
    w.document.write("<p style='font-family:Arial'>Preparing report...</p>");
    let media = { general: [], checks: [] }, note = "";
    if (Number(v[6])) {
        const r = await api("qaPhotos", { row: row });
        if (r.status === "SUCCESS") media = { general: r.photos || [], checks: r.checkPhotos || [] };
        else note = "The photos could not be loaded: " + r.reason;
    }
    printQaReport(v, media, w, note);
}

async function delQa(row) {
    const v = state.qa.find((x) => x.row === row).v;
    if (!confirm(`Delete this QA report (${v[1]}, ${v[3] || v[2]}, ${dmy(v[0])}) and its photos?\n\nDownload the PDF first if you need a copy. This can't be undone. Photos move to the Google Drive bin and free their space once it empties.`)) return;
    const r = await api("delQa", { row: row, key: v[1] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadQa();
}

async function delQaPhotos(row) {
    const v = state.qa.find((x) => x.row === row).v;
    if (!confirm(`Delete the photos for this report (${v[1]}, ${v[3] || v[2]}, ${dmy(v[0])})? The report text stays. This can't be undone.`)) return;
    const r = await api("delQaPhotos", { row: row, key: v[1] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadQa();
}

let phList = [], phIdx = 0;

function phShow(i) {
    phIdx = (i + phList.length) % phList.length;
    $("ph-main").src = phList[phIdx];
    $("ph-count").innerText = `Photo ${phIdx + 1} of ${phList.length}`;
    document.querySelectorAll("#ph-thumbs img").forEach((t, n) => t.classList.toggle("on", n === phIdx));
    document.querySelectorAll(".ph-nav").forEach((b) => { b.hidden = phList.length < 2; });
}

function phStep(n) { phShow(phIdx + n); }

async function showPhotos(row) {
    const rep = state.qa.find((x) => x.row === row);
    $("ph-title").innerText = `${rep.v[1]}: ${rep.v[3] || rep.v[2]} (${dmy(rep.v[0])})`;
    $("ph-main").removeAttribute("src");
    $("ph-thumbs").innerHTML = "";
    $("ph-count").innerText = "Loading photos...";
    photodlg.showModal();
    const r = await api("qaPhotos", { row: row });
    if (r.status !== "SUCCESS") { $("ph-count").innerText = r.reason; return; }
    phList = (r.checkPhotos || []).reduce((a, b) => a.concat(b), []).concat(r.photos || []);
    $("ph-thumbs").innerHTML = phList.map((p, i) => `<img src="${p}" alt="Thumbnail ${i + 1}" onclick="phShow(${i})">`).join("");
    phShow(0);
}

document.addEventListener("keydown", (e) => {
    if (!photodlg.open || !phList.length) return;
    if (e.key === "ArrowRight") phStep(1);
    if (e.key === "ArrowLeft") phStep(-1);
});

$("qa-search").addEventListener("input", renderQa);
$("qa-fails").addEventListener("change", renderQa);

// ---------- QR codes ----------
const logoImg = new Image();
logoImg.onload = drawQr;
logoImg.src = encodeURI(LOGO_FILE);   // same file as the page logo

function fillQrSites() {
    const sel = $("q-site"), keep = sel.value;
    sel.innerHTML = state.Sites.map((r) =>
        `<option value="${esc(r.v[0])}">${esc(r.v[1] || r.v[0])}${r.v[5] === "Inactive" ? " - inactive" : ""}</option>`).join("");
    if (keep) sel.value = keep;
    drawQr();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawEye(ctx, x, y, cell) {
    const s = cell * 7;
    ctx.fillStyle = "#000"; roundRect(ctx, x, y, s, s, cell * 2.2); ctx.fill();
    ctx.fillStyle = "#fff"; roundRect(ctx, x + cell, y + cell, s - 2 * cell, s - 2 * cell, cell * 1.4); ctx.fill();
    ctx.fillStyle = "#000"; roundRect(ctx, x + 2 * cell, y + 2 * cell, s - 4 * cell, s - 4 * cell, cell * 0.9); ctx.fill();
}

function qrText() { return $("q-site").value; }

function drawQr() {
    const c = $("q-canvas"), ctx = c.getContext("2d"), text = qrText();
    if (typeof qrcode === "undefined" || !text) return;

    const site = state.Sites.find((r) => r.v[0] === text);
    const label = $("q-label").checked && site;
    const size = 800, pad = 40;

    const qr = qrcode(0, "H");          // "H" = highest error correction, so the logo can cover the middle
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), cell = (size - pad * 2) / n;

    c.width = size;
    c.height = size + (label ? 90 : 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#000";
    const inEye = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
    for (let r = 0; r < n; r++) {
        for (let k = 0; k < n; k++) {
            if (!inEye(r, k) && qr.isDark(r, k)) ctx.fillRect(pad + k * cell, pad + r * cell, cell + 0.5, cell + 0.5);
        }
    }
    drawEye(ctx, pad, pad, cell);
    drawEye(ctx, pad + (n - 7) * cell, pad, cell);
    drawEye(ctx, pad, pad + (n - 7) * cell, cell);

    if (logoImg.complete && logoImg.naturalWidth) {
        const w = size * 0.34, h = w * logoImg.naturalHeight / logoImg.naturalWidth;
        const x = (size - w) / 2, y = (size - h) / 2;
        ctx.fillStyle = "#fff"; roundRect(ctx, x - 14, y - 14, w + 28, h + 28, 12); ctx.fill();
        ctx.drawImage(logoImg, x, y, w, h);
    }

    if (label) {
        ctx.fillStyle = "#000";
        ctx.font = "bold 40px -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(site.v[1] || site.v[0], size / 2, size + 55);
    }
}

function downloadQr() {
    const text = qrText();
    if (!text) return;
    const a = document.createElement("a");
    a.href = $("q-canvas").toDataURL("image/png");
    a.download = "QR-" + text.replace(/[^\w-]+/g, "_") + ".png";
    a.click();
}

["q-site", "q-label"].forEach((id) => $(id).addEventListener("input", drawQr));

// ---------- Installations (the items to inspect on each project, set up by the office) ----------
async function loadInst() {
    const r = await api("iList");
    if (r.status !== "SUCCESS") return;
    state.inst = r.rows;
    renderInst();
    if (state.Sites.length) renderTable("Sites");   // refreshes the counts on the project cards
}

function fillInstSites() {
    const sel = $("inst-site"), keep = sel.value;
    sel.innerHTML = state.Sites.map((r) => `<option value="${esc(r.v[0])}">${esc(r.v[1] || r.v[0])}</option>`).join("");
    if (keep) sel.value = keep;
    renderInst();
}

function renderInst() {
    const site = $("inst-site").value;
    const list = (state.inst || []).filter((r) => r.v[1] === site);
    const su = paySetupOf((state.Sites.find((s) => s.v[0] === site) || { v: [] }).v);
    $("t-inst").innerHTML = "<tr><th>Product</th><th>Reference</th><th>Phase</th><th>Elevation / level</th><th>Drawings</th><th>Size (mm)</th><th>Area</th><th>Price</th><th>Stages</th><th>Status</th><th></th></tr>" +
        (list.map((r) => {
            const v = r.v, nDone = su ? su.stages.filter((s) => (r.done || []).indexOf(s.id) >= 0).length : 0;
            return `<tr><td>${esc(v[2])}</td><td><b>${esc(v[3])}</b></td><td>${esc(v[4])}</td><td>${esc(v[5])}</td><td>${esc(v[6])}</td>` +
                   `<td>${v[8] && v[9] ? esc(v[8]) + " x " + esc(v[9]) : "-"}</td><td>${r.area ? r.area.toFixed(2) + " m&sup2;" : "-"}</td><td>${r.price ? invMoney(r.price) : "-"}</td>` +
                   `<td>${su ? `<button class="small ghost" onclick="openStages(${r.row})">${nDone} / ${su.stages.length}</button>` : "-"}</td><td>${esc(v[7])}</td>` +
                   `<td class="act"><button class="small" onclick="openInst(${r.row}, false)">Edit</button><button class="small ghost" onclick="openInst(${r.row}, true)">Duplicate</button>` +
                   `<button class="small danger" onclick="delInst(${r.row})">Delete</button></td></tr>`;
        }).join("") || "<tr><td colspan='11'>No installations for this project yet.</td></tr>");
}

$("inst-site").addEventListener("change", renderInst);

function showInstalls(row) {
    const s = state.Sites.find((r) => r.row === row);
    if (!s) return;
    $("inst-site").value = s.v[0];
    renderInst();
    document.querySelector('nav button[data-tab="installs"]').click();
}

function openInst(row, dup) {
    const cur = (state.inst || []).find((r) => r.row === row);
    const v = cur ? cur.v : ["", $("inst-site").value, "Windows", "", "", "", "", "Active", "", "", ""];
    const editing = !!cur && !dup;
    $("dt").innerText = editing ? "Edit installation" : "Add installation";
    $("de").innerText = "";
    $("df").innerHTML =
        `<label class="field">Project<select id="i-site">${state.Sites.map((r) => `<option value="${esc(r.v[0])}"${r.v[0] === v[1] ? " selected" : ""}>${esc(r.v[1] || r.v[0])}</option>`).join("")}</select></label>` +
        `<label class="field">Product<select id="i-prod">${QA_REPORTS.map((o) => `<option${o === v[2] ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>` +
        `<label class="field">Reference *<input id="i-ref" maxlength="80" placeholder="e.g. Type P.1" value="${esc(v[3])}"></label>` +
        `<div class="two"><label class="field">Phase<input id="i-phase" maxlength="40" value="${esc(v[4])}"></label><label class="field">Elevation / level<input id="i-level" maxlength="60" value="${esc(v[5])}"></label></div>` +
        `<label class="field">Drawings<textarea id="i-draw" rows="2" maxlength="200" placeholder="e.g. 4404, 4403, 5402, EL-2402, SP-0401">${esc(v[6])}</textarea></label>` +
        `<div class="two"><label class="field">Length (mm)<input id="i-len" type="number" min="0" step="1" value="${esc(v[8])}"></label><label class="field">Height (mm)<input id="i-hgt" type="number" min="0" step="1" value="${esc(v[9])}"></label></div>` +
        `<label class="field">Price override (&pound;, optional: leave blank to price by size)<input id="i-ovr" type="number" min="0" step="0.01" value="${esc(v[10])}"></label>` +
        `<label class="field">Status<select id="i-status"><option${v[7] !== "Inactive" ? " selected" : ""}>Active</option><option${v[7] === "Inactive" ? " selected" : ""}>Inactive</option></select></label>`;
    $("ds").onclick = async () => {
        $("de").innerText = "Saving...";
        const r = await api("iSave", { row: editing ? row : 0, key: editing ? v[0] : "", siteId: $("i-site").value, product: $("i-prod").value,
                                       ref: $("i-ref").value, phase: $("i-phase").value, level: $("i-level").value, drawings: $("i-draw").value, status: $("i-status").value,
                                       lenMm: $("i-len").value, hgtMm: $("i-hgt").value, override: $("i-ovr").value });
        if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
        $("inst-site").value = $("i-site").value;
        dlg.close();
        loadInst();
    };
    dlg.showModal();
}

async function delInst(row) {
    const cur = state.inst.find((r) => r.row === row);
    if (!confirm(`Delete installation "${cur.v[3]}"? It will no longer be offered in the QA form. Reports already completed are not affected.`)) return;
    const r = await api("iDelete", { row: row, key: cur.v[0] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadInst();
}

// ---------- Project overview: progress from the QA reports ----------
const projdlg = $("projdlg");

async function viewProject(row) {
    const s = state.Sites.find((r) => r.row === row);
    if (!s) return;
    const sv = s.v;
    $("pj-title").innerText = sv[1] || sv[0];
    $("pj-body").innerHTML = "<p class='note'>Loading overview...</p>";
    projdlg.showModal();
    const r = await api("projectOverview", { siteId: sv[0] });
    if (r.status !== "SUCCESS") { $("pj-body").innerHTML = `<p class="err">${esc(r.reason)}</p>`; return; }

    state.ov = {};
    r.installs.forEach((i) => { if (i.last) state.ov[i.last.row] = i.last.v; });
    r.other.forEach((o) => { state.ov[o.row] = o.v; });

    const act = r.installs.filter((i) => i.active), done = act.filter((i) => i.last);
    const pass = done.filter((i) => i.last.v[4] === "PASS").length, fail = done.length - pass;
    const pc = (n) => act.length ? Math.round(n / act.length * 100) : 0;
    const meta = (l, x) => x ? `<div><span>${l}: </span>${esc(x)}</div>` : "";
    const pill = (i) => !i.last ? '<span class="pill none">Not started</span>' : i.last.v[4] === "PASS" ? '<span class="pill">Passed</span>' : '<span class="pill bad">Failed</span>';
    const byProd = QA_REPORTS.map((p) => {
        const a = act.filter((i) => i.product === p);
        return a.length ? `<span class="chip">${esc(p)}: <b>${a.filter((i) => i.last).length} / ${a.length}</b></span>` : "";
    }).join("");

    const instRows = r.installs.map((i) =>
        `<tr${i.active ? "" : ' style="opacity:.5"'}><td>${esc(i.product)}</td><td><b>${esc(i.ref)}</b>${i.active ? "" : " (inactive)"}</td><td>${esc(i.phase)}</td><td>${esc(i.level)}</td>` +
        `<td>${pill(i)}</td><td>${i.last ? esc(dmy(i.last.v[0])) + "<br><small>" + esc(i.last.v[1]) + "</small>" : "-"}</td><td>${i.count}</td>` +
        `<td class="act">${i.last ? `<button class="small" onclick="viewQa(${i.last.row}, state.ov[${i.last.row}])">View report</button>` : ""}</td></tr>`).join("");

    const otherRows = r.other.map((o) => {
        const v = o.v;
        return `<tr><td>${esc(dmy(v[0]))}</td><td>${esc(v[8] || "Windows")}</td><td>${esc(v[13] || "-")}${v[17] === "Yes" ? " (ad hoc)" : ""}</td><td>${esc(v[1])}</td>` +
               `<td class="${v[4] === "FAIL" ? "failtxt" : "oktxt"}"><b>${esc(v[4])}</b></td><td class="act"><button class="small" onclick="viewQa(${o.row}, state.ov[${o.row}])">View report</button></td></tr>`;
    }).join("");

    $("pj-body").innerHTML =
        `<div class="pj-meta">${meta("Project no.", sv[7])}${meta("Address", sv[8])}${meta("Main contractor", sv[6])}${meta("Installer", sv[9])}</div>` +
        (act.length
            ? `<div><b>${done.length} of ${act.length} installations inspected (${pc(done.length)}%)</b> <span class="note">Passed ${pass} (${pc(pass)}%)</span></div>` +
              `<div class="prog"><div class="g" style="width:${pc(pass)}%"></div><div class="r" style="width:${pc(fail)}%"></div></div>` +
              `<div class="chips"><span class="chip">Passed: <b>${pass}</b></span><span class="chip">Failed: <b>${fail}</b></span><span class="chip">Not started: <b>${act.length - done.length}</b></span>${byProd}</div>` +
              `<p class="note" style="margin:0 0 12px">Based on the latest QA report for each active installation. A failed installation counts as inspected until a newer report passes.</p>`
            : `<p class="note">No installations have been set up for this project yet. Add them in the Installations tab to track progress.</p>`) +
        (instRows ? `<div class="scroll"><table><tr><th>Product</th><th>Reference</th><th>Phase</th><th>Elevation / level</th><th>Status</th><th>Last report</th><th>Reports</th><th></th></tr>${instRows}</table></div>` : "") +
        (otherRows ? `<h3 class="sect">Other reports for this project</h3><p class="note" style="margin:0 0 8px">Ad hoc reports, or reports for an installation that is no longer listed. They are not counted in the percentage.</p>` +
                     `<div class="scroll"><table><tr><th>Date</th><th>Type</th><th>Reference</th><th>Inspector</th><th>Overall</th><th></th></tr>${otherRows}</table></div>` : "");
}

// ---------- Payment stages, rates and ticking stages ----------
function paySetupOf(v) {
    try {
        const p = JSON.parse(v[10] || "");
        return p && Array.isArray(p.stages) && p.stages.length ? p : null;
    } catch (err) { return null; }
}

// Splits a price across the stages in pence; the last stage takes any rounding left over
function stageAmounts(price, stages) {
    const total = Math.round(price * 100);
    let left = total;
    return stages.map((s, i) => {
        const c = i === stages.length - 1 ? left : Math.round(total * s.pct / 100);
        left -= c;
        return c / 100;
    });
}

let payState = null;   // { row, stages, rates } while the Stages & rates window is open

function payRead() {   // copy what has been typed back into payState
    document.querySelectorAll("#df [data-n]").forEach((el) => { payState.stages[el.dataset.n].name = el.value; });
    document.querySelectorAll("#df [data-p]").forEach((el) => { payState.stages[el.dataset.p].pct = el.value; });
    document.querySelectorAll("#df [data-r]").forEach((el) => { payState.rates[el.dataset.r] = el.value; });
}

function payTotal() { return payState.stages.reduce((a, x) => a + (Number(x.pct) || 0), 0); }

function payDraw() {
    const total = payTotal();
    $("df").innerHTML =
        `<h3 class="sect">Payment stages <small>(must total 100%)</small></h3>` +
        payState.stages.map((x, i) =>
            `<div class="inline" style="margin-bottom:8px"><input data-n="${i}" value="${esc(x.name)}" maxlength="40" placeholder="Stage name">` +
            `<input data-p="${i}" type="number" min="0" max="100" step="0.5" value="${esc(x.pct)}" style="max-width:90px"> %` +
            `<button type="button" class="ghost small" onclick="payRemove(${i})" aria-label="Remove stage">&times;</button></div>`).join("") +
        `<button type="button" class="ghost small" onclick="payAdd()">+ Add stage</button> <b id="pay-total" class="${Math.abs(total - 100) < 0.005 ? "oktxt" : "failtxt"}">Total ${total}%</b>` +
        `<h3 class="sect">Cost per square metre</h3><div class="two">` +
        QA_REPORTS.map((p) => `<label class="field">${esc(p)} (&pound; / m&sup2;)<input data-r="${esc(p)}" type="number" min="0" step="0.01" value="${esc(payState.rates[p] === undefined ? "" : payState.rates[p])}"></label>`).join("") +
        `</div><p class="note">Each installation's price is its length x height x the rate for its product, or its own price override. Stage amounts are that price split by the percentages above.</p>`;
}

function payAdd() { payRead(); if (payState.stages.length >= 8) return; payState.stages.push({ name: "", pct: 0 }); payDraw(); }
function payRemove(i) { payRead(); payState.stages.splice(i, 1); payDraw(); }

function openPay(row) {
    const s = state.Sites.find((r) => r.row === row), su = paySetupOf(s.v);
    payState = {
        row: row,
        stages: su ? su.stages.map((x) => ({ id: x.id, name: x.name, pct: x.pct })) :
            [{ name: "Frame installed", pct: 40 }, { name: "Glass installed", pct: 30 }, { name: "Handle fitted", pct: 15 }, { name: "Gaskets fitted", pct: 15 }],
        rates: Object.assign({}, su ? su.rates : {})
    };
    $("dt").innerText = "Stages & rates: " + (s.v[1] || s.v[0]);
    $("de").innerText = "";
    dlg.classList.add("wide");
    payDraw();
    $("df").oninput = () => {
        payRead();
        const t = payTotal(), el = $("pay-total");
        if (el) { el.innerText = `Total ${t}%`; el.className = Math.abs(t - 100) < 0.005 ? "oktxt" : "failtxt"; }
    };
    dlgCleanup = null;
    $("ds").onclick = async () => {
        payRead();
        const stages = payState.stages.filter((x) => String(x.name).trim()).map((x) => ({ id: x.id, name: x.name, pct: Number(x.pct) }));
        if (stages.length && Math.abs(stages.reduce((a, x) => a + x.pct, 0) - 100) > 0.005) { $("de").innerText = "The stage percentages must total 100%."; return; }
        if (!stages.length && !confirm("With no stages, progress tracking is switched off for this project. Continue?")) return;
        $("de").innerText = "Saving...";
        const r = await api("paySave", { siteId: s.v[0], stages: stages, rates: payState.rates });
        if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
        dlg.close();
        await loadLists();
        loadInst();
    };
    dlg.showModal();
}

// Admin can tick or untick stages for an installation (inspectors do it from the phone)
function openStages(row) {
    const r0 = state.inst.find((x) => x.row === row);
    const su = paySetupOf((state.Sites.find((s) => s.v[0] === r0.v[1]) || { v: [] }).v);
    if (!su) return;
    $("dt").innerText = "Stages: " + r0.v[3];
    $("de").innerText = "";
    const draw = () => {
        const cur = state.inst.find((x) => x.row === row), amounts = stageAmounts(cur.price || 0, su.stages);
        $("df").innerHTML = su.stages.map((s, i) =>
            `<label class="switch"><input type="checkbox" data-st="${esc(s.id)}"${(cur.done || []).indexOf(s.id) >= 0 ? " checked" : ""}> ${esc(s.name)} <small>${s.pct}%${cur.price ? " = " + invMoney(amounts[i]) : ""}</small></label>`).join("") +
            `<p class="note">${cur.price ? "Installation price " + invMoney(cur.price) : "No price yet: add a size (and a rate per m&sup2; on the project) or a price override."}</p>`;
    };
    draw();
    $("df").onchange = async (e) => {
        const cb = e.target.closest("input[data-st]");
        if (!cb) return;
        $("de").innerText = "Saving...";
        const res = await api("stageSet", { installId: r0.v[0], stageId: cb.dataset.st, done: cb.checked });
        if (res.status !== "SUCCESS") { $("de").innerText = res.reason; cb.checked = !cb.checked; return; }
        $("de").innerText = "";
        state.inst.find((x) => x.row === row).done = res.done;
    };
    $("ds").innerText = "Close";
    $("ds").onclick = () => dlg.close();
    dlgCleanup = () => loadInst();
    dlg.showModal();
}

// ---------- Applications for payment ----------
let appData = null;

function fillAppSites() {
    const sel = $("app-site"), keep = sel.value;
    sel.innerHTML = state.Sites.map((r) => `<option value="${esc(r.v[0])}">${esc(r.v[1] || r.v[0])}</option>`).join("");
    if (keep) sel.value = keep;
}

function showApps(row) {
    const s = state.Sites.find((r) => r.row === row);
    if (!s) return;
    $("app-site").value = s.v[0];
    document.querySelector('nav button[data-tab="applications"]').click();
}

async function loadApps() {
    const site = $("app-site").value;
    if (!site) { $("app-list").innerHTML = ""; return; }
    $("app-list").innerHTML = "<p class='note'>Loading...</p>";
    const r = await api("appList", { siteId: site });
    if (r.status !== "SUCCESS") { $("app-list").innerHTML = `<p class="err">${esc(r.reason)}</p>`; return; }
    appData = r;
    renderApps();
}

$("app-site").addEventListener("change", loadApps);

function renderApps() {
    const r = appData;
    if (!r.hasSetup) {
        $("app-summary").innerHTML = "";
        $("app-gen").disabled = true;
        $("app-gen").innerText = "Generate application";
        $("app-invoices").innerHTML = "";
        $("app-list").innerHTML = "<p class='note'>Set up this project's payment stages and rates first (Projects tab, Stages &amp; rates), then tick stages on the Progress page.</p>";
        return;
    }
    let agreed = 0, waiting = 0;
    const invoiced = r.invoices.filter((i) => i.status !== "Cancelled").reduce((t, i) => t + i.net, 0);
    r.apps.forEach((a) => a.lines.forEach((l) => { if (l.agreed === "Yes") agreed += l.amount; else if (l.agreed === "") waiting += l.amount; }));
    $("app-summary").innerHTML =
        `<span class="chip">Contract value: <b>${invMoney(r.contract)}</b></span><span class="chip">Agreed to date: <b>${invMoney(agreed)}</b></span>` +
        `<span class="chip">Awaiting response: <b>${invMoney(waiting)}</b></span><span class="chip">Invoiced (net): <b>${invMoney(invoiced)}</b></span><span class="chip">Ready to apply for: <b>${invMoney(r.next.total)}</b></span>` +
        (r.next.carried ? `<span class="chip">Carried forward: <b>${r.next.carried}</b> stage${r.next.carried === 1 ? "" : "s"}</span>` : "") +
        (r.next.skipped.length ? `<span class="chip failtxt">${r.next.skipped.length} ticked stage${r.next.skipped.length === 1 ? "" : "s"} with no price</span>` : "");
    $("app-gen").disabled = !r.next.count;
    $("app-gen").innerText = r.next.count ? `Generate application (${r.next.count} stage${r.next.count === 1 ? "" : "s"}, ${invMoney(r.next.total)})` : "Generate application";

    $("app-list").innerHTML = r.apps.length ? r.apps.map((a) => {
        const locked = a.lines.some((l) => l.invoiceId), responded = a.status === "Responded";
        const inv = r.invoices.find((i) => i.appId === a.id && i.status !== "Cancelled");
        const sum = (f) => a.lines.filter(f).reduce((x, l) => x + l.amount, 0);
        const rows = a.lines.map((l) => {
            const st = l.agreed === "Yes" ? '<span class="pill">Agreed</span>' : l.agreed === "No" ? '<span class="pill bad">Declined</span>' : '<span class="pill none">Awaiting</span>';
            return `<tr><td>${esc(l.product)} - <b>${esc(l.ref)}</b></td><td>${esc(l.stage)}</td><td>${l.pct}%</td><td>${invMoney(l.amount)}</td>` +
                   `<td>${l.carried ? '<span class="pill warn">Carried forward</span>' : ""}</td><td>${st}</td>` +
                   `<td><input type="checkbox" data-line="${esc(l.id)}"${l.agreed === "Yes" ? " checked" : ""}${locked ? " disabled" : ""}></td></tr>`;
        }).join("");
        return `<div class="appblock" id="appb-${esc(a.id)}"><div class="apph"><b>Application ${a.no}</b> <span class="note">${esc(dmy(a.created))} by ${esc(a.by)} | ${esc(a.status)}${responded ? " " + esc(dmy(a.responded)) : ""}</span>` +
               `<span class="apptot">Total ${invMoney(sum(() => true))}${responded ? ` | Agreed ${invMoney(sum((l) => l.agreed === "Yes"))} | Declined ${invMoney(sum((l) => l.agreed === "No"))}` : ""}</span></div>` +
               `<div class="scroll"><table><tr><th>Installation</th><th>Stage</th><th>%</th><th>Amount</th><th></th><th>Status</th><th>Agreed</th></tr>${rows}</table></div>` +
               (locked ? `<p class="note">An invoice has been raised from this application, so it can't be changed.</p>` :
                `<label class="field" style="margin-top:10px">Main contractor's comments (optional)<textarea id="appn-${esc(a.id)}" rows="2" maxlength="500">${esc(a.notes)}</textarea></label>` +
                `<div class="btns"><button class="small ghost" onclick="agreeAll(${jsArg(a.id)})">Agree all</button><button class="small" onclick="saveResp(${jsArg(a.id)})">${responded ? "Update response" : "Save response"}</button>` +
                `<button class="small ghost" onclick="viewApp(${jsArg(a.id)})">View / PDF</button>` +
                (responded && a.lines.some((l) => l.agreed === "Yes") ? `<button class="small" onclick="openInv(${jsArg(a.id)})">Create invoice</button>` : "") +
                `<button class="small danger" onclick="delApp(${jsArg(a.id)})">Delete</button></div>`) +
               (locked ? `<div class="btns"><button class="small ghost" onclick="viewApp(${jsArg(a.id)})">View / PDF</button>${inv ? `<span class="note">Invoice ${esc(inv.id)}</span><button class="small" onclick="viewProjInv(${jsArg(inv.id)})">View invoice</button>` : ""}</div>` : "") + `</div>`;
    }).join("") : "<p class='note'>No applications yet. Tick stages on the Progress page, then press Generate application.</p>";
    renderInvoices();
}

async function genApp() {
    const n = appData.next;
    if (!confirm(`Generate a new application for ${n.count} stage${n.count === 1 ? "" : "s"} (${invMoney(n.total)})?`)) return;
    const r = await api("appGenerate", { siteId: $("app-site").value });
    if (r.status !== "SUCCESS") return alert(r.reason);
    if (r.skipped && r.skipped.length) alert(`Application ${r.no} created. ${r.skipped.length} ticked stage(s) were left out because they have no price yet:\n` + r.skipped.slice(0, 8).join("\n"));
    await loadApps();
    viewApp(r.appId);
}

function agreeAll(id) { document.querySelectorAll(`#appb-${CSS.escape(id)} input[data-line]`).forEach((c) => { if (!c.disabled) c.checked = true; }); }

async function saveResp(id) {
    const boxes = Array.from(document.querySelectorAll(`#appb-${CSS.escape(id)} input[data-line]`)), agreed = boxes.filter((c) => c.checked).map((c) => c.dataset.line);
    const declined = boxes.length - agreed.length;
    if (!confirm(`Save the main contractor's response?\n\n${agreed.length} line(s) agreed.` + (declined ? `\n${declined} line(s) not agreed: they will be declined and offered again on the next application.` : ""))) return;
    const r = await api("appRespond", { appId: id, agreed: agreed, notes: $("appn-" + id).value });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadApps();
}

async function delApp(id) {
    const a = appData.apps.find((x) => x.id === id);
    if (!confirm(`Delete Application ${a.no}? Its stages go back to waiting to be applied for. This can't be undone.`)) return;
    const r = await api("appDelete", { appId: id, key: id });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadApps();
}

// The application as sent to the main contractor (prices frozen when it was generated)
function applicationHtml(a, site, contract, agreedBefore) {
    const logo = new URL(LOGO_FILE, location.href).href, v = site.v;
    const total = a.lines.reduce((x, l) => x + l.amount, 0);
    const rows = a.lines.map((l) => `<tr><td>${invEsc(l.product)} - ${invEsc(l.ref)}</td><td>${invEsc(l.stage)}${l.carried ? " <i>(carried forward)</i>" : ""}</td><td class="r">${l.pct}%</td><td class="r">${invMoney(l.amount)}</td></tr>`).join("");
    const meta = (k, x) => x ? `<tr><td>${k}</td><td>${invEsc(x)}</td></tr>` : "";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Application ${a.no} - ${invEsc(v[1] || v[0])}</title>
<style>
@page { margin: 14mm; }
body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; }
.head { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #0284c7; padding-bottom: 12px; }
.head img { height: 58px; }
.head h1 { font-size: 17pt; margin: 0; text-align: right; color: #0f172a; }
.meta { width: 100%; border-collapse: collapse; margin-top: 18px; }
.meta td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
.meta td:first-child { width: 28%; color: #555; font-weight: bold; }
h2 { font-size: 12pt; margin: 22px 0 6px; color: #0284c7; }
table.lines { width: 100%; border-collapse: collapse; }
table.lines th { background: #0f172a; color: #fff; text-align: left; padding: 7px 8px; font-size: 10pt; }
table.lines td { padding: 7px 8px; border-bottom: 1px solid #ddd; }
.r { text-align: right; }
.tot td { font-weight: bold; border-top: 2px solid #111; }
.sum { margin-top: 18px; width: 60%; margin-left: auto; border-collapse: collapse; }
.sum td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
.foot { margin-top: 26px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8.5pt; color: #666; }
</style></head><body>
<div class="head"><img src="${logo}" alt="${invEsc(CO)}"><div><h1>Application for Payment<br>No. ${a.no}</h1></div></div>
<table class="meta">${meta("To (main contractor)", v[6])}${meta("From", CO)}${meta("Project", v[1] || v[0])}${meta("Project number", v[7])}${meta("Address", v[8])}${meta("Date of application", dmy(a.created).slice(0, 10))}</table>
<h2>Work applied for</h2>
<table class="lines"><tr><th>Installation</th><th>Stage</th><th class="r">Stage %</th><th class="r">Amount</th></tr>${rows}
<tr class="tot"><td colspan="3">Total of this application</td><td class="r">${invMoney(total)}</td></tr></table>
<table class="sum"><tr><td>Contract value</td><td class="r">${invMoney(contract)}</td></tr><tr><td>Previously agreed</td><td class="r">${invMoney(agreedBefore)}</td></tr><tr><td><b>This application</b></td><td class="r"><b>${invMoney(total)}</b></td></tr></table>
<div class="foot">Generated ${new Date().toLocaleString("en-GB")} | ${invEsc(CO)} | Amounts are net of VAT</div>
</body></html>`;
}

function viewApp(id) {
    const a = appData.apps.find((x) => x.id === id), site = state.Sites.find((s) => s.v[0] === $("app-site").value);
    const before = appData.apps.filter((x) => x.no < a.no).reduce((t, x) => t + x.lines.filter((l) => l.agreed === "Yes").reduce((u, l) => u + l.amount, 0), 0);
    openView(`Application ${a.no}: ${site.v[1] || site.v[0]}`, applicationHtml(a, site, appData.contract, before));
}

// ---------- Project invoices (raised once the main contractor has agreed an application) ----------
function invCalc(net, vatP, cisP, retP, reverse) {
    const r2 = (x) => Math.round(x * 100) / 100;
    const ret = r2(net * retP / 100), taxable = r2(net - ret), vat = reverse ? 0 : r2(taxable * vatP / 100), cis = r2(taxable * cisP / 100);
    return { ret: ret, taxable: taxable, vat: vat, cis: cis, total: r2(taxable + vat - cis) };
}

function renderInvoices() {
    const list = appData.invoices;
    $("app-invoices").innerHTML = list.length
        ? `<h3 class="sect">Invoices</h3><div class="scroll"><table><tr><th>Invoice</th><th>Date</th><th>Application</th><th>Net</th><th>Retention</th><th>VAT</th><th>CIS</th><th>Total due</th><th>Status</th><th></th></tr>` +
          list.map((i) => {
              const a = appData.apps.find((x) => x.id === i.appId), cancelled = i.status === "Cancelled";
              return `<tr${cancelled ? ' style="opacity:.5"' : ""}><td><b>${esc(i.id)}</b></td><td>${esc(dmy(i.date))}</td><td>${a ? a.no : "-"}</td><td>${invMoney(i.net)}</td><td>${invMoney(i.ret)}</td>` +
                     `<td>${i.reverse ? "Reverse charge" : invMoney(i.vat)}</td><td>${invMoney(i.cis)}</td><td><b>${invMoney(i.total)}</b></td><td>${esc(i.status)}</td>` +
                     `<td class="act"><button class="small" onclick="viewProjInv(${jsArg(i.id)})">View / PDF</button>${cancelled ? "" : `<button class="small danger" onclick="cancelInv(${jsArg(i.id)})">Cancel</button>`}</td></tr>`;
          }).join("") + "</table></div>"
        : "";
}

function openInv(appId) {
    const a = appData.apps.find((x) => x.id === appId);
    const net = Math.round(a.lines.filter((l) => l.agreed === "Yes").reduce((t, l) => t + l.amount, 0) * 100) / 100;
    let d = {};
    try { d = JSON.parse(localStorage.getItem("invDefaults") || "{}"); } catch (err) {}
    $("dt").innerText = `Create invoice from Application ${a.no}`;
    $("de").innerText = "";
    dlg.classList.add("wide");
    $("df").innerHTML =
        `<p class="note" style="margin:0 0 12px">An invoice for the lines the main contractor agreed. Check the VAT, retention and CIS settings with the client before sending it.</p>` +
        `<div class="two"><label class="field">VAT %<input id="v-vat" type="number" min="0" max="100" step="0.5" value="${esc(d.vat === undefined ? 20 : d.vat)}"></label>` +
        `<label class="field">Retention %<input id="v-ret" type="number" min="0" max="100" step="0.5" value="${esc(d.ret === undefined ? 0 : d.ret)}"></label></div>` +
        `<div class="two"><label class="field">CIS deduction %<input id="v-cis" type="number" min="0" max="100" step="0.5" value="${esc(d.cis === undefined ? 0 : d.cis)}"></label><div></div></div>` +
        `<label class="switch"><input type="checkbox" id="v-rc"${d.rc ? " checked" : ""}> Domestic reverse charge <small>no VAT is charged; the customer accounts for it</small></label>` +
        `<label class="field">Payment details / notes (shown on the invoice)<textarea id="v-notes" rows="3" maxlength="500">${esc(d.notes || "")}</textarea></label>` +
        `<div id="v-prev" class="note"></div>`;
    const read = () => ({ vat: Number($("v-vat").value) || 0, ret: Number($("v-ret").value) || 0, cis: Number($("v-cis").value) || 0, rc: $("v-rc").checked });
    const upd = () => {
        const x = read(), c = invCalc(net, x.vat, x.cis, x.ret, x.rc);
        $("v-prev").innerHTML = `Net agreed ${invMoney(net)} | Retention -${invMoney(c.ret)} | VAT ${x.rc ? "reverse charge" : invMoney(c.vat)} | CIS -${invMoney(c.cis)}<br><b>Total due ${invMoney(c.total)}</b>`;
    };
    upd();
    $("df").oninput = upd;
    $("df").onchange = upd;
    dlgCleanup = null;
    $("ds").innerText = "Create invoice";
    $("ds").onclick = async () => {
        const x = read();
        $("de").innerText = "Creating...";
        const r = await api("invCreate", { appId: appId, vat: x.vat, retention: x.ret, cis: x.cis, reverse: x.rc, notes: $("v-notes").value });
        if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
        try { localStorage.setItem("invDefaults", JSON.stringify({ vat: x.vat, ret: x.ret, cis: x.cis, rc: x.rc, notes: $("v-notes").value })); } catch (err) {}
        dlg.close();
        await loadApps();
        viewProjInv(r.invoiceId);
    };
    dlg.showModal();
}

async function cancelInv(id) {
    if (!confirm(`Cancel invoice ${id}? It stays on record as cancelled and its number is not reused. The application is unlocked so it can be corrected and invoiced again.`)) return;
    const r = await api("invCancel", { invoiceId: id });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadApps();
}

function projectInvoiceHtml(inv, a, site) {
    const logo = new URL(LOGO_FILE, location.href).href, v = site.v;
    const rows = inv.lines.map((l) => `<tr><td>${invEsc(l.product)} - ${invEsc(l.ref)}</td><td>${invEsc(l.stage)}</td><td class="r">${l.pct}%</td><td class="r">${invMoney(l.amount)}</td></tr>`).join("");
    const meta = (k, x) => x ? `<tr><td>${k}</td><td>${invEsc(x)}</td></tr>` : "";
    const sumRow = (k, x, bold) => `<tr${bold ? ' class="big"' : ""}><td>${k}</td><td class="r">${x}</td></tr>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${invEsc(inv.id)}</title>
<style>
@page { margin: 14mm; }
body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; position: relative; }
.head { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #0284c7; padding-bottom: 12px; }
.head img { height: 58px; }
.head h1 { font-size: 20pt; margin: 0; text-align: right; color: #0f172a; }
.meta { width: 100%; border-collapse: collapse; margin-top: 18px; }
.meta td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
.meta td:first-child { width: 28%; color: #555; font-weight: bold; }
h2 { font-size: 12pt; margin: 22px 0 6px; color: #0284c7; }
table.lines { width: 100%; border-collapse: collapse; }
table.lines th { background: #0f172a; color: #fff; text-align: left; padding: 7px 8px; font-size: 10pt; }
table.lines td { padding: 7px 8px; border-bottom: 1px solid #ddd; }
.r { text-align: right; }
.sum { margin-top: 18px; width: 62%; margin-left: auto; border-collapse: collapse; }
.sum td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
.sum tr.big td { font-weight: bold; border-top: 2px solid #111; font-size: 12pt; }
.notes { margin-top: 22px; line-height: 1.5; }
.void { position: absolute; top: 40%; left: 10%; font-size: 70pt; color: rgba(220,38,38,0.25); transform: rotate(-20deg); font-weight: bold; }
.foot { margin-top: 26px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8.5pt; color: #666; }
</style></head><body>
${inv.status === "Cancelled" ? '<div class="void">CANCELLED</div>' : ""}
<div class="head"><img src="${logo}" alt="${invEsc(CO)}"><div><h1>INVOICE</h1></div></div>
<table class="meta">${meta("Invoice no.", inv.id)}${meta("Invoice date", dmy(inv.date))}${meta("Application no.", a ? String(a.no) : "")}${meta("From", CO)}${meta("To", v[6])}${meta("Project", v[1] || v[0])}${meta("Project number", v[7])}${meta("Address", v[8])}</table>
<h2>Agreed work</h2>
<table class="lines"><tr><th>Installation</th><th>Stage</th><th class="r">Stage %</th><th class="r">Amount</th></tr>${rows}</table>
<table class="sum">
${sumRow("Net agreed valuation", invMoney(inv.net))}
${inv.ret ? sumRow("Less retention (" + inv.retPct + "%)", "-" + invMoney(inv.ret)) : ""}
${sumRow("VAT" + (inv.reverse ? "" : " (" + inv.vatPct + "%)"), inv.reverse ? "Reverse charge" : invMoney(inv.vat))}
${inv.cis ? sumRow("Less CIS deduction (" + inv.cisPct + "%)", "-" + invMoney(inv.cis)) : ""}
${sumRow("Total due", invMoney(inv.total), true)}
</table>
${inv.reverse ? '<p class="notes">Domestic reverse charge applies: the customer is required to account to HMRC for the VAT on this supply.</p>' : ""}
${inv.notes ? `<p class="notes"><b>Payment details / notes</b><br>${invMulti(inv.notes)}</p>` : ""}
<div class="foot">${invEsc(CO)} | Invoice ${invEsc(inv.id)}</div>
</body></html>`;
}

function viewProjInv(id) {
    const inv = appData.invoices.find((i) => i.id === id), a = appData.apps.find((x) => x.id === inv.appId), site = state.Sites.find((s) => s.v[0] === $("app-site").value);
    openView(`Invoice ${inv.id}`, projectInvoiceHtml(inv, a, site));
}

// ---------- Daily diary calendar ----------
const DIARY_COLOURS = ["#0284c7", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0d9488", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0891b2", "#a16207", "#be123c", "#15803d", "#9333ea", "#475569"];
const diarydlg = $("diarydlg");
let dcMonth = null, dcEntries = [];

// the grid runs Monday to Sunday and covers whole weeks
function dcRange() {
    const first = new Date(dcMonth.getFullYear(), dcMonth.getMonth(), 1), last = new Date(dcMonth.getFullYear(), dcMonth.getMonth() + 1, 0);
    const start = new Date(first), end = new Date(last);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
    return { start: start, end: end };
}

function diaryMonth(n) {
    if (n === 0) { dcMonth = new Date(); dcMonth.setDate(1); }
    else dcMonth = new Date(dcMonth.getFullYear(), dcMonth.getMonth() + n, 1);
    loadDiary();
}

const dcSites = () => state.Sites.slice().sort((a, b) => String(a.v[1] || a.v[0]).localeCompare(String(b.v[1] || b.v[0]))).map((r) => r.v[0]);
const dcPeople = () => state.Users.filter((r) => r.v[3] !== "Admin").map((r) => r.v[0]).sort();

function dcColour(e, by) {
    const list = by === "person" ? dcPeople() : dcSites(), key = by === "person" ? e.person : e.siteId;
    let i = list
