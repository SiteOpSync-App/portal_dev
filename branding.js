// Applies the settings from config.js on every page: company name, logo, page title and the DEV ribbon.
// Loaded after config.js and before the other scripts, which use CO, CO_SHORT and LOGO_FILE in documents and emails.
(function () {
    const c = window.SITE_CONFIG || {};
    window.CO = c.companyName || "Your Company";
    window.CO_SHORT = c.shortName || window.CO;
    window.LOGO_FILE = c.logo || "company logo1.png";

    function run() {
        document.title = (document.body.dataset.title || "{co}").replace("{co}", window.CO_SHORT);
        document.querySelectorAll("img.company-logo, img.logo").forEach(function (i) { i.src = encodeURI(window.LOGO_FILE); i.alt = window.CO; });
        document.querySelectorAll("[data-company]").forEach(function (e) { e.textContent = window.CO; });
        const t = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if (t) t.content = window.CO_SHORT + " Site";
        if (c.env === "dev") {
            const r = document.createElement("div");
            r.textContent = "DEV - test data";
            r.style.cssText = "position:fixed;top:0;right:0;z-index:9999;background:#f59e0b;color:#000;font:bold 11px sans-serif;padding:3px 10px;border-bottom-left-radius:8px;pointer-events:none";
            document.body.appendChild(r);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
