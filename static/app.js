/* ── Construction Cash Tracker — PWA Frontend ── */
"use strict";

const API = "";  // same origin
let TOKEN = localStorage.getItem("token") || "";
let USER = JSON.parse(localStorage.getItem("user") || "null");
let ITEMS = null;  // item master cache
let CURRENT_SITE = localStorage.getItem("current_site") || "";

// ── API helper ────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error("Session expired"); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Error");
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────
function isLoggedIn() { return !!TOKEN && !!USER; }

function logout() {
  TOKEN = ""; USER = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  showLogin();
}

async function doLogin() {
  const mobile = document.getElementById("login-mobile").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";
  try {
    const data = await api("/api/auth/login", {
      method: "POST", body: { mobile, password },
    });
    TOKEN = data.access_token;
    USER = data.user;
    localStorage.setItem("token", TOKEN);
    localStorage.setItem("user", JSON.stringify(USER));
    // Set current site from user's assigned sites
    if (USER.site_ids) {
      const first = USER.site_ids.split(",")[0]?.trim();
      if (first) { CURRENT_SITE = first; localStorage.setItem("current_site", first); }
    }
    showApp();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = "block";
  }
}

// ── Navigation ────────────────────────────────────────────────────
function showLogin() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("app-screen").style.display = "none";
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "flex";
  updateHeader();
  buildTabs();
  // If user has multiple sites and no current site selected, pick the first one
  if (!CURRENT_SITE && USER && USER.site_ids) {
    const first = USER.site_ids.split(",")[0]?.trim();
    if (first) { CURRENT_SITE = first; localStorage.setItem("current_site", first); }
  }
  switchTab("entry");
  loadItemMaster();
  loadNotifications();
}

function updateHeader() {
  const nameEl = document.getElementById("header-name");
  const badgeEl = document.getElementById("header-site");
  const avatarEl = document.getElementById("header-avatar");
  if (USER) {
    nameEl.textContent = USER.role === "admin" ? "🏗️ Welkin Builders (Admin)" : "🏗️ Welkin Builders";
    badgeEl.textContent = USER.site_names ? "📍 " + USER.site_names : (CURRENT_SITE ? "📍 " + CURRENT_SITE : "");
    avatarEl.textContent = USER.name.substring(0, 2).toUpperCase();
  }
}

function buildTabs() {
  const tabs = document.getElementById("nav-tabs");
  const isAdmin = USER && (USER.role === "admin" || USER.role === "Role.admin");
  console.log("User role:", USER?.role, "isAdmin:", isAdmin);
  let html = `
    <div class="tab active" data-tab="entry"><span class="ico">📝</span>Entry</div>
    <div class="tab" data-tab="history"><span class="ico">📋</span>History</div>
    <div class="tab" data-tab="summary"><span class="ico">📊</span>Summary</div>`;
  if (isAdmin) {
    html += `<div class="tab" data-tab="admin"><span class="ico">👑</span>Admin</div>`;
  }
  html += `<div class="tab" data-tab="more"><span class="ico">⚙️</span>More</div>`;
  tabs.innerHTML = html;
  tabs.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const screen = document.getElementById("screen-" + name);
  if (screen) screen.classList.add("active");
  // Load data for the tab
  if (name === "entry") loadEntryForm();
  else if (name === "history") loadHistory();
  else if (name === "summary") loadSummary();
  else if (name === "admin") loadAdmin();
  else if (name === "more") loadMore();
}

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 2500);
}

// ── Loading skeleton ──────────────────────────────────────────────
function showLoading(el) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el) return;
  el.innerHTML = `<div class="loader"><div class="spinner"></div><div class="loader-text">Loading...</div></div>`;
}

function showSkeleton(el, rows = 4) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el) return;
  let html = '<div class="card"><div class="skeleton h"></div>';
  for (let i = 0; i < rows; i++) html += '<div class="skeleton bar" style="animation-delay:' + (i*0.1) + 's"></div><div style="height:8px"></div>';
  html += '</div>';
  el.innerHTML = html;
}

// ── Item Master ───────────────────────────────────────────────────
async function loadItemMaster() {
  if (ITEMS) return;
  try { ITEMS = await api("/api/items"); } catch (e) { console.warn("Item master load failed", e); }
}

function buildItemOptions() {
  if (!ITEMS) return '<option value="">Loading items...</option>';
  let html = '<option value="">-- Select Item --</option>';
  for (const cat of ITEMS.categories) {
    html += `<optgroup label="${cat.name}">`;
    for (const item of cat.items) {
      html += `<option value="${item.standard_name}" data-unit="${item.default_unit}" data-ledger="${item.ledger}">${item.standard_name}</option>`;
    }
    html += "</optgroup>";
  }
  html += '<option value="__custom__">+ Type Custom Item</option>';
  return html;
}

function buildUnitOptions(selected) {
  if (!ITEMS) return "";
  return ITEMS.units.map(u => `<option ${u === selected ? "selected" : ""}>${u}</option>`).join("");
}

// ── ENTRY FORM ────────────────────────────────────────────────────
async function loadEntryForm() {
  await loadItemMaster();
  // Load user's sites for the selector
  let sitesHtml = "";
  try {
    const sites = await api("/api/sites");
    if (sites.length > 1) {
      sitesHtml = `<div class="fg"><label>📍 Select Site</label><select id="e-site" onchange="onSiteChange()">`;
      for (const site of sites) {
        sitesHtml += `<option value="${site.site_id}" ${site.site_id === CURRENT_SITE ? 'selected' : ''}>${site.name} (${site.site_id})</option>`;
      }
      sitesHtml += `</select></div>`;
    } else if (sites.length === 1 && !CURRENT_SITE) {
      CURRENT_SITE = sites[0].site_id;
      localStorage.setItem("current_site", CURRENT_SITE);
    }
  } catch (e) {}

  const s = document.getElementById("screen-entry");
  const today = new Date().toISOString().split("T")[0];
  s.innerHTML = `
    <div class="card">
      <h3>📝 New Cash Entry</h3>
      ${sitesHtml}
      <div class="row2">
        <div class="fg"><label>Date</label><input type="date" id="e-date" value="${today}"></div>
        <div class="fg"><label>Bill / Challan No.</label><input id="e-bill" placeholder="SB-68 or Nil" value="Nil"></div>
      </div>
      <div class="fg"><label>Party / Vendor</label><input id="e-party" list="party-list" placeholder="Type vendor name"><datalist id="party-list"></datalist></div>
      <div class="fg"><label>📦 Item / Material</label>
        <select id="e-item" onchange="onItemChange()">${buildItemOptions()}</select>
      </div>
      <div id="custom-item-row" style="display:none" class="fg">
        <label>Custom Item Name</label><input id="e-custom-item" placeholder="Type item name">
      </div>
      <div class="row3">
        <div class="fg"><label>Qty</label><input type="number" id="e-qty" placeholder="0" oninput="calcTotal()"></div>
        <div class="fg"><label>Unit</label><select id="e-unit">${buildUnitOptions("No.")}</select></div>
        <div class="fg"><label>Rate (₹)</label><input type="number" id="e-rate" placeholder="0" oninput="calcTotal()"></div>
      </div>
      <div class="amount-box">
        <span class="label">Total Amount</span>
        <span class="value" id="e-total">₹ 0</span>
      </div>
      <div class="row2">
        <div class="fg"><label>Payment Mode</label><select id="e-payment">${(ITEMS?.payment_modes || ["Cash","UPI","Bank Transfer","Challan","Credit"]).map(m => `<option>${m}</option>`).join("")}</select></div>
        <div class="fg"><label>Ref Ledger</label><select id="e-ledger">${(ITEMS?.ledger_types || ["Material"]).map(l => `<option>${l}</option>`).join("")}</select></div>
      </div>
      <div class="fg"><label>📸 Invoice</label>
        <div style="display:flex;align-items:center;gap:8px">
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('e-file').click()" style="flex-shrink:0">📷 Capture</button>
          <span id="file-name" style="font-size:.75em;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">No file</span>
        </div>
        <input type="file" id="e-file" accept="image/*" capture="environment" style="display:none" onchange="onFileSelected(this)">
      </div>
      <div class="fg"><label>Remarks</label><textarea id="e-remarks" rows="2" placeholder="Optional notes..."></textarea></div>
      <button class="btn btn-primary" onclick="submitEntry()">💾 Save Entry</button>
    </div>`;
  // Load vendors into datalist
  try {
    const vendors = await api("/api/vendors");
    const dl = document.getElementById("party-list");
    if (dl) {
      let opts = "";
      for (const v of vendors) opts += `<option value="${v.name}">`;
      dl.innerHTML = opts;
    }
  } catch (e) {}
}

function onItemChange() {
  const sel = document.getElementById("e-item");
  const opt = sel.options[sel.selectedIndex];
  if (sel.value === "__custom__") {
    document.getElementById("custom-item-row").style.display = "block";
  } else {
    document.getElementById("custom-item-row").style.display = "none";
    if (opt.dataset.unit) document.getElementById("e-unit").value = opt.dataset.unit;
    if (opt.dataset.ledger) document.getElementById("e-ledger").value = opt.dataset.ledger;
  }
}

function onSiteChange() {
  const sel = document.getElementById("e-site");
  if (sel) {
    CURRENT_SITE = sel.value;
    localStorage.setItem("current_site", CURRENT_SITE);
    const opt = sel.options[sel.selectedIndex];
    document.getElementById("header-site").textContent = "📍 " + opt.textContent;
  }
}

function calcTotal() {
  const q = parseFloat(document.getElementById("e-qty").value) || 0;
  const r = parseFloat(document.getElementById("e-rate").value) || 0;
  document.getElementById("e-total").textContent = "₹ " + (q * r).toLocaleString("en-IN");
}

function onFileSelected(input) {
  const nameEl = document.getElementById("file-name");
  if (input.files && input.files[0]) {
    nameEl.textContent = "✅ " + input.files[0].name;
    nameEl.style.color = "var(--success)";
  } else {
    nameEl.textContent = "No file";
    nameEl.style.color = "#888";
  }
}

async function submitEntry() {
  const itemSel = document.getElementById("e-item").value;
  const itemDesc = itemSel === "__custom__"
    ? document.getElementById("e-custom-item").value.trim()
    : itemSel;
  const qty = parseFloat(document.getElementById("e-qty").value) || 0;
  const rate = parseFloat(document.getElementById("e-rate").value) || 0;

  if (!itemDesc || !qty) { toast("Please fill item and quantity", true); return; }
  // Use site from selector if available, otherwise CURRENT_SITE
  const siteEl = document.getElementById("e-site");
  const targetSite = siteEl ? siteEl.value : CURRENT_SITE;
  if (!targetSite) { toast("No site selected. Ask admin to assign you.", true); return; }

  const body = {
    entry_date: document.getElementById("e-date").value,
    bill_no: document.getElementById("e-bill").value || "Nil",
    party_name: document.getElementById("e-party").value.trim() || "Cash Purchase",
    item_description: itemDesc,
    quantity: qty,
    unit: document.getElementById("e-unit").value,
    rate: rate,
    amount: qty * rate,
    payment_mode: document.getElementById("e-payment").value,
    ref_ledger: document.getElementById("e-ledger").value,
    remarks: document.getElementById("e-remarks").value,
  };

  try {
    const result = await api(`/api/entries/${targetSite}`, { method: "POST", body });
    toast("✅ Entry saved: " + result.entry_id);

    // Upload invoice photo if attached
    const fileInput = document.getElementById("e-file");
    if (fileInput.files && fileInput.files[0]) {
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      try {
        await api(`/api/invoices/${targetSite}/${result.entry_id}`, { method: "POST", body: fd });
        toast("📸 Invoice uploaded!");
      } catch (e) { toast("Entry saved but invoice upload failed: " + e.message, true); }
    }

    loadEntryForm();  // reset form
  } catch (e) {
    toast("❌ " + e.message, true);
  }
}

// ── HISTORY ───────────────────────────────────────────────────────
async function loadHistory(statusFilter) {
  const s = document.getElementById("screen-history");
  if (!CURRENT_SITE) { s.innerHTML = '<div class="card"><p>No site assigned</p></div>'; return; }

  showSkeleton(s, 5);
  try {
    let url = `/api/entries/${CURRENT_SITE}`;
    if (statusFilter) url += `?status=${statusFilter}`;
    const entries = await api(url);

    let html = `<div class="search-box"><input id="history-search" placeholder="Search entries..." oninput="filterHistory()"></div>`;
    html += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      <span class="chip ${!statusFilter ? 'active' : ''}" onclick="loadHistory()">All</span>
      <span class="chip ${statusFilter === 'Pending' ? 'active' : ''}" onclick="loadHistory('Pending')">⏳ Pending</span>
      <span class="chip ${statusFilter === 'Approved' ? 'active' : ''}" onclick="loadHistory('Approved')">✅ Approved</span>
      <span class="chip ${statusFilter === 'Rejected' ? 'active' : ''}" onclick="loadHistory('Rejected')">❌ Rejected</span>
    </div>`;

    if (entries.length === 0) {
      html += '<div class="card"><p style="text-align:center;color:#999">No entries yet</p></div>';
    } else {
      html += '<div class="card" id="history-list">';
      for (const e of entries.reverse()) {
        html += `<div class="entry-row" data-search="${(e.item_description + ' ' + e.party_name + ' ' + e.amount).toLowerCase()}">
          <div class="entry-left">
            <div class="item-name">${e.item_description} × ${e.quantity} ${e.unit}</div>
            <div class="item-meta">${e.party_name} · ${e.bill_no} <span class="status-badge status-${e.status}">${e.status}</span></div>
          </div>
          <div class="entry-right">
            <div class="amount">₹${Number(e.amount).toLocaleString("en-IN")}</div>
            <div class="date">${e.entry_date}${e.invoice_url ? ' 📎' : ''}</div>
          </div>
        </div>`;
      }
      html += "</div>";
    }
    s.innerHTML = html;
  } catch (e) {
    s.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

function filterHistory() {
  const q = document.getElementById("history-search").value.toLowerCase();
  document.querySelectorAll("#history-list .entry-row").forEach(row => {
    row.style.display = row.dataset.search.includes(q) ? "flex" : "none";
  });
}

// ── SUMMARY ───────────────────────────────────────────────────────
let SUMMARY_FILTER = "month"; // week, month, year, all, custom
let SUMMARY_FROM = "";
let SUMMARY_TO = "";

async function loadSummary() {
  const s = document.getElementById("screen-summary");
  const isAdmin = USER && (USER.role === "admin" || USER.role === "Role.admin");
  s.innerHTML = '<div class="loader"><div class="spinner"></div><div class="loader-text">Loading summary...</div></div>';

  try {
    const sites = await api("/api/sites");
    let allEntries = [];
    let siteEntries = {};

    for (const site of sites) {
      if (site.name && site.name.startsWith("[CLOSED]")) continue;
      const entries = await api(`/api/entries/${site.site_id}`);
      siteEntries[site.site_id] = { name: site.name, entries };
      allEntries = allEntries.concat(entries.map(e => ({ ...e, site_name: site.name })));
    }

    const now = new Date();
    const filterEntries = (entries) => {
      if (SUMMARY_FILTER === "all") return entries;
      return entries.filter(e => {
        if (!e.entry_date) return false;
        const d = new Date(e.entry_date);
        if (isNaN(d)) return false;
        if (SUMMARY_FILTER === "week") {
          const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
          return d >= weekAgo;
        } else if (SUMMARY_FILTER === "month") {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } else if (SUMMARY_FILTER === "year") {
          return d.getFullYear() === now.getFullYear();
        } else if (SUMMARY_FILTER === "custom") {
          if (SUMMARY_FROM && d < new Date(SUMMARY_FROM)) return false;
          if (SUMMARY_TO && d > new Date(SUMMARY_TO + "T23:59:59")) return false;
          return !!(SUMMARY_FROM || SUMMARY_TO);
        }
        return true;
      });
    };

    const filtered = filterEntries(allEntries);
    const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
    const pending = filtered.filter(e => e.status === "Pending").length;
    const approved = filtered.filter(e => e.status === "Approved").length;
    const rejected = filtered.filter(e => e.status === "Rejected").length;

    // Build filter bar
    let html = `<div class="card">
      <h3>📊 Summary — Welkin Builders</h3>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">
        <span class="chip ${SUMMARY_FILTER==='week'?'active':''}" onclick="SUMMARY_FILTER='week';loadSummary()">This Week</span>
        <span class="chip ${SUMMARY_FILTER==='month'?'active':''}" onclick="SUMMARY_FILTER='month';loadSummary()">This Month</span>
        <span class="chip ${SUMMARY_FILTER==='year'?'active':''}" onclick="SUMMARY_FILTER='year';loadSummary()">This Year</span>
        <span class="chip ${SUMMARY_FILTER==='all'?'active':''}" onclick="SUMMARY_FILTER='all';loadSummary()">All Time</span>
        <span class="chip ${SUMMARY_FILTER==='custom'?'active':''}" onclick="SUMMARY_FILTER='custom';loadSummary()">Custom</span>
      </div>
      ${SUMMARY_FILTER === 'custom' ? `<div class="row2" style="margin-bottom:10px">
        <div class="fg"><label>From</label><input type="date" id="sum-from" value="${SUMMARY_FROM}" onchange="SUMMARY_FROM=this.value;loadSummary()"></div>
        <div class="fg"><label>To</label><input type="date" id="sum-to" value="${SUMMARY_TO}" onchange="SUMMARY_TO=this.value;loadSummary()"></div>
      </div>` : ''}
      <div class="stat-grid">
        <div class="stat"><div class="val">₹${total >= 100000 ? (total/100000).toFixed(1)+'L' : total >= 1000 ? (total/1000).toFixed(0)+'K' : total.toFixed(0)}</div><div class="lbl">Total Spent</div></div>
        <div class="stat"><div class="val">${filtered.length}</div><div class="lbl">Entries</div></div>
        <div class="stat"><div class="val">${pending}</div><div class="lbl">⏳ Pending</div></div>
        <div class="stat"><div class="val">${approved}</div><div class="lbl">✅ Approved</div></div>
      </div>
    </div>`;

    // Site-wise breakdown (admin sees all)
    if (isAdmin && sites.length > 1) {
      html += '<div class="card"><h3>📍 Site-wise Spending</h3>';
      for (const site of sites) {
        const sEntries = filterEntries(siteEntries[site.site_id].entries);
        const sTotal = sEntries.reduce((s, e) => s + Number(e.amount), 0);
        const sPending = sEntries.filter(e => e.status === "Pending").length;
        if (sEntries.length === 0) continue;
        html += `<div class="entry-row">
          <div class="entry-left"><div class="item-name">${site.name}</div><div class="item-meta">${sEntries.length} entries${sPending ? ' · ⏳ ' + sPending + ' pending' : ''}</div></div>
          <div class="entry-right"><div class="amount">₹${Number(sTotal).toLocaleString("en-IN")}</div></div>
        </div>`;
      }
      html += "</div>";
    }

    // Category breakdown
    const cats = {};
    const vendors = {};
    for (const e of filtered) {
      const cat = e.ref_ledger || "Other";
      cats[cat] = (cats[cat] || 0) + Number(e.amount);
      const vn = e.party_name || "Unknown";
      vendors[vn] = (vendors[vn] || 0) + Number(e.amount);
    }
    const maxCat = Math.max(...Object.values(cats), 1);
    const topVendors = Object.entries(vendors).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const colors = ["#1a7fb5","#e67e22","#27ae60","#8e44ad","#e74c3c","#3498db","#f39c12"];

    html += '<div class="card"><h3>📈 Spending by Category</h3>';
    let ci = 0;
    for (const [cat, amt] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      const pct = (amt / maxCat * 100).toFixed(0);
      html += `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:.78em"><span>${cat}</span><span style="font-weight:700">₹${Number(amt).toLocaleString("en-IN")}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${colors[ci++%colors.length]}"></div></div></div>`;
    }
    html += "</div>";

    html += '<div class="card"><h3>🏪 Top Vendors</h3>';
    for (const [name, amt] of topVendors) {
      const count = filtered.filter(e => e.party_name === name).length;
      html += `<div class="entry-row"><div class="entry-left"><div class="item-name">${name}</div><div class="item-meta">${count} entries</div></div>
        <div class="entry-right"><div class="amount">₹${Number(amt).toLocaleString("en-IN")}</div></div></div>`;
    }
    html += "</div>";

    s.innerHTML = html;
  } catch (e) {
    s.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

// ── ADMIN PANEL ───────────────────────────────────────────────────
async function loadAdmin() {
  const s = document.getElementById("screen-admin");
  if (!s) return;
  let html = `
    <div class="card">
      <h3>👑 Admin Panel — Welkin Builders Infrastructure Ltd</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button class="btn btn-primary btn-sm" onclick="showCreateSite()">📍 New Site</button>
        <button class="btn btn-outline btn-sm" onclick="showCreateUser()">👤 Add Engineer</button>
        <button class="btn btn-outline btn-sm" onclick="showReleaseFund()">💰 Release Fund</button>
        <button class="btn btn-outline btn-sm" onclick="showFundRecon()">📊 Fund Recon</button>
        <button class="btn btn-outline btn-sm" onclick="detectNewSheets()">📄 Detect Sheets</button>
        <button class="btn btn-outline btn-sm" onclick="api('/api/cache/clear',{method:'POST'}).then(()=>{toast('Cache cleared');loadAdmin()})">🔄 Refresh</button>
      </div>
    </div>
    <div id="admin-content"></div>`;

  // Load sites
  try {
    const sites = await api("/api/sites");
    html += '<div class="card"><h3>📍 Project Sites (' + sites.length + ')</h3>';
    if (sites.length === 0) html += '<p style="font-size:.82em;color:#999">No sites created yet</p>';
    for (const site of sites) {
      html += `<div class="entry-row">
        <div class="entry-left" style="cursor:pointer" onclick="selectSite('${site.site_id}','${site.name}')"><div class="item-name">${site.name}</div><div class="item-meta">${site.site_id} · ${site.location}</div></div>
        <div class="entry-right" style="display:flex;gap:4px;align-items:center">
          <span class="chip ${CURRENT_SITE === site.site_id ? 'active' : ''}" onclick="selectSite('${site.site_id}','${site.name}')">${CURRENT_SITE === site.site_id ? '✓ Active' : 'Select'}</span>
          <span class="chip" style="cursor:pointer" onclick="showEditSite('${site.site_id}','${site.name.replace(/'/g,"\\'")}','${site.location.replace(/'/g,"\\'")}')">✏️</span>
        </div>
      </div>`;
    }
    html += "</div>";
  } catch (e) { html += `<div class="card"><p style="color:var(--danger)">${e.message}</p></div>`; }

  // Users
  try {
    const users = await api("/api/users");
    html += '<div class="card"><h3>👥 Users (' + users.length + ')</h3>';
    html += '<button class="btn btn-outline btn-sm" onclick="showCreateUser()" style="margin-bottom:8px">+ Add New Engineer</button>';
    for (const u of users) {
      html += `<div class="entry-row"><div class="entry-left"><div class="item-name">${u.name}</div><div class="item-meta">📱 ${u.mobile} · ${u.role}${u.site_ids ? ' · Sites: ' + u.site_ids : ''}</div></div>
        <div class="entry-right"><span class="chip" style="cursor:pointer" onclick="showEditUser('${u.mobile}','${u.name}','${u.site_ids || ''}')">✏️</span></div></div>`;
    }
    html += "</div>";
  } catch (e) {}

  // Reconciliation
  try {
    const sites = await api("/api/sites");
    let pendingHtml = "";
    let pendingCount = 0;
    for (const site of sites) {
      const entries = await api(`/api/entries/${site.site_id}?status=Pending`);
      for (const e of entries) {
        pendingCount++;
        pendingHtml += `<div class="entry-row" style="flex-wrap:wrap">
          <div class="entry-left" style="flex-basis:100%">
            <div class="item-name">${e.item_description} × ${e.quantity} ${e.unit} — ₹${Number(e.amount).toLocaleString("en-IN")}</div>
            <div class="item-meta">${e.party_name} · ${e.entered_by} · ${site.name} · ${e.entry_date} ${e.invoice_url ? '📎' : ''}</div>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-success btn-sm" onclick="reconcile('${site.site_id}','${e.entry_id}','Approved')">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="reconcile('${site.site_id}','${e.entry_id}','Rejected')">❌ Reject</button>
            ${e.invoice_url ? `<a href="${e.invoice_url}" target="_blank" class="btn btn-outline btn-sm">📎 View</a>` : ''}
          </div>
        </div>`;
      }
    }
    html += `<div class="card"><h3>⏳ Pending Reconciliation (${pendingCount})</h3>`;
    html += pendingCount ? pendingHtml : '<p style="font-size:.82em;color:#999">No pending entries</p>';
    html += "</div>";
  } catch (e) {}

  s.innerHTML = html;
}

function selectSite(siteId, siteName) {
  CURRENT_SITE = siteId;
  localStorage.setItem("current_site", siteId);
  document.getElementById("header-site").textContent = "📍 " + siteName;
  toast("✓ Switched to " + siteName);
  // Re-render admin to update active buttons
  setTimeout(() => loadAdmin(), 100);
}

async function closeSite(siteId) {
  if (!confirm("Close site " + siteId + "? This will mark it as [CLOSED].")) return;
  try {
    await api(`/api/sites/${siteId}/close`, { method: "POST" });
    toast("Site closed: " + siteId);
    await api("/api/cache/clear", { method: "POST" });
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

async function detectNewSheets() {
  try {
    const result = await api("/api/sites/detect");
    const sheets = result.new_sheets;
    if (sheets.length === 0) {
      toast("No new sheets found");
      return;
    }
    const c = document.getElementById("admin-content");
    let html = '<div class="card"><h3>📄 New Sheets Detected</h3>';
    for (const name of sheets) {
      html += `<div class="entry-row"><div class="entry-left"><div class="item-name">${name}</div></div>
        <button class="btn btn-primary btn-sm" onclick="registerSheet('${name}')">Register as Site</button></div>`;
    }
    html += '</div>';
    c.innerHTML = html;
  } catch (e) { toast("Error: " + e.message, true); }
}

async function registerSheet(sheetName) {
  const siteName = prompt("Enter site name for " + sheetName + ":", sheetName);
  if (!siteName) return;
  try {
    await api("/api/sites", { method: "POST", body: {
      site_id: sheetName, name: siteName, location: "", sheet_name: sheetName,
    }});
    toast("✅ Registered " + sheetName + " as site!");
    await api("/api/cache/clear", { method: "POST" });
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

// ── Fund Release Form ─────────────────────────────────────────────
async function showReleaseFund() {
  const sites = await api("/api/sites").catch(() => []);
  const users = await api("/api/users").catch(() => []);
  const engineers = users.filter(u => u.role === "site_engineer");
  const today = new Date().toISOString().split("T")[0];
  const c = document.getElementById("admin-content");
  c.innerHTML = `<div class="card">
    <h3>💰 Release Fund to Site Engineer</h3>
    <div class="fg"><label>Date</label><input type="date" id="rf-date" value="${today}"></div>
    <div class="fg"><label>Site</label><select id="rf-site">
      ${sites.map(s => `<option value="${s.site_id}">${s.name} (${s.site_id})</option>`).join("")}
    </select></div>
    <div class="fg"><label>Site Engineer</label><select id="rf-eng">
      <option value="">-- Select Engineer --</option>
      ${engineers.map(u => `<option value="${u.mobile}" data-name="${u.name}">${u.name} (${u.mobile})</option>`).join("")}
    </select></div>
    <div class="fg"><label>Amount (₹)</label><input type="number" id="rf-amount" placeholder="10000"></div>
    <div class="fg"><label>Payment Mode</label><select id="rf-mode"><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></div>
    <div class="fg"><label>Remarks</label><input id="rf-remarks" placeholder="e.g. Weekly fund for materials"></div>
    <button class="btn btn-primary" onclick="doReleaseFund()">💰 Release Fund</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doReleaseFund() {
  const engSel = document.getElementById("rf-eng");
  const engOpt = engSel.options[engSel.selectedIndex];
  if (!engSel.value) { toast("Select an engineer", true); return; }
  const fd = new FormData();
  fd.append("site_id", document.getElementById("rf-site").value);
  fd.append("engineer_mobile", engSel.value);
  fd.append("engineer_name", engOpt.dataset.name || "");
  fd.append("amount", document.getElementById("rf-amount").value);
  fd.append("date", document.getElementById("rf-date").value);
  fd.append("payment_mode", document.getElementById("rf-mode").value);
  fd.append("remarks", document.getElementById("rf-remarks").value);
  try {
    await api("/api/funds", { method: "POST", body: fd });
    toast("✅ Fund released!");
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

// ── Fund Reconciliation View ──────────────────────────────────────
async function showFundRecon() {
  const c = document.getElementById("admin-content");
  c.innerHTML = '<div class="card"><p>Loading reconciliation...</p></div>';
  try {
    const data = await api("/api/funds/reconciliation");
    let html = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">💰 Fund Reconciliation</h3>
        <button class="btn btn-outline btn-sm" onclick="loadAdmin()">← Back</button>
      </div>
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="val" style="color:var(--success)">₹${Number(data.total_given).toLocaleString("en-IN")}</div><div class="lbl">Total Given</div></div>
        <div class="stat"><div class="val" style="color:var(--danger)">₹${Number(data.total_spent).toLocaleString("en-IN")}</div><div class="lbl">Total Spent</div></div>
        <div class="stat" style="grid-column:span 2"><div class="val" style="color:${data.total_balance >= 0 ? 'var(--success)' : 'var(--danger)'}">₹${Number(data.total_balance).toLocaleString("en-IN")}</div><div class="lbl">Balance (Given - Spent)</div></div>
      </div>`;

    if (data.reconciliation.length > 0) {
      html += '<div style="font-size:.75em;font-weight:700;color:var(--primary);margin:8px 0">Per Site / Engineer</div>';
      for (const r of data.reconciliation) {
        const balColor = r.balance >= 0 ? "var(--success)" : "var(--danger)";
        html += `<div class="entry-row">
          <div class="entry-left">
            <div class="item-name">${r.engineer} — ${r.site_id}</div>
            <div class="item-meta">Given: ₹${Number(r.fund_given).toLocaleString("en-IN")} · Spent: ₹${Number(r.fund_spent).toLocaleString("en-IN")}</div>
          </div>
          <div class="entry-right"><div class="amount" style="color:${balColor}">₹${Number(r.balance).toLocaleString("en-IN")}</div><div class="date">Balance</div></div>
        </div>`;
      }
    } else {
      html += '<p style="font-size:.82em;color:#999">No fund releases yet</p>';
    }
    html += "</div>";

    const funds = await api("/api/funds");
    if (funds.length > 0) {
      html += '<div class="card"><h3>📋 Recent Fund Releases</h3>';
      for (const f of funds.slice(-20).reverse()) {
        html += `<div class="entry-row">
          <div class="entry-left"><div class="item-name">₹${Number(f.amount).toLocaleString("en-IN")} → ${f.engineer_name}</div><div class="item-meta">${f.site_id} · ${f.payment_mode} · ${f.date}</div></div>
        </div>`;
      }
      html += "</div>";
    }

    c.innerHTML = html;
  } catch (e) { c.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p></div>`; }
}

async function reconcile(siteId, entryId, action) {
  const remarks = action === "Rejected" ? prompt("Reason for rejection:") || "" : "";
  try {
    await api(`/api/reconcile/${siteId}`, {
      method: "POST", body: { entry_id: entryId, action, admin_remarks: remarks },
    });
    toast(`${action === "Approved" ? "✅" : "❌"} Entry ${action}`);
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

// ── Create Vendor (redirects to More tab) ─────────────────────────
function showCreateVendor() { switchTab("more"); setTimeout(() => showCreateVendorInMore(), 100); }
function doCreateVendor() {} // unused, handled by doCreateVendorFromMore

// ── Create Site Modal ─────────────────────────────────────────────
function showCreateSite() {
  const c = document.getElementById("admin-content");
  c.innerHTML = `<div class="card">
    <h3>📍 Create New Project Site</h3>
    <div class="fg"><label>Site ID (short code — also used as sheet tab name)</label><input id="cs-id" placeholder="e.g. KCJ-ROAD" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9\\-]/g,'')"></div>
    <div class="fg"><label>Site Name</label><input id="cs-name" placeholder="e.g. KCJ Road Project - Indore"></div>
    <div class="fg"><label>Location</label><input id="cs-loc" placeholder="e.g. Indore, MP"></div>
    <p style="font-size:.7em;color:#888;margin-bottom:10px">Sheet tab will be created with the Site ID name</p>
    <button class="btn btn-primary" onclick="doCreateSite()">Create Site</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doCreateSite() {
  const siteId = document.getElementById("cs-id").value.trim();
  if (!siteId) { toast("Site ID is required", true); return; }
  try {
    await api("/api/sites", { method: "POST", body: {
      site_id: siteId,
      name: document.getElementById("cs-name").value.trim(),
      location: document.getElementById("cs-loc").value.trim(),
      sheet_name: siteId,  // sheet tab = site ID
    }});
    toast("✅ Site created! Sheet tab: " + siteId);
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

function showEditSite(siteId, name, location) {
  const isClosed = name.startsWith("[CLOSED]");
  const c = document.getElementById("admin-content");
  c.innerHTML = `<div class="card">
    <h3>✏️ Site: ${siteId}</h3>
    <div class="fg"><label>Site Name</label><input id="es-name" value="${name}"></div>
    <div class="fg"><label>Location</label><input id="es-loc" value="${location}"></div>
    <div class="fg"><label>Site ID (read-only)</label><input value="${siteId}" disabled style="background:#eee"></div>
    <p style="font-size:.7em;color:#888;margin-bottom:12px">Sheet tab: ${siteId}</p>
    <button class="btn btn-outline" onclick="loadAdmin()">← Back</button>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #eee">
      <p style="font-size:.75em;color:var(--danger);margin-bottom:8px">⚠️ Danger Zone</p>
      ${!isClosed
        ? `<button class="btn btn-danger btn-sm" onclick="closeSite('${siteId}')">🔒 Close This Site</button>
           <p style="font-size:.68em;color:#999;margin-top:4px">Closing a site marks it as [CLOSED] and hides it from summaries.</p>`
        : `<p style="font-size:.78em;color:var(--success)">✅ This site is already closed.</p>`
      }
    </div>
  </div>`;
}

// ── Create User Modal ─────────────────────────────────────────────
async function showCreateUser() {
  const sites = await api("/api/sites").catch(() => []);
  const c = document.getElementById("admin-content");
  const siteToggles = sites.map(s => `<div class="site-toggle">
    <div><div class="st-label">${s.name}</div><div class="st-sub">${s.site_id}</div></div>
    <div class="switch" data-site="${s.site_id}" onclick="this.classList.toggle('on')"></div>
  </div>`).join("");
  c.innerHTML = `<div class="card">
    <h3>👤 Add Site Engineer</h3>
    <div class="fg"><label>Name</label><input id="cu-name" placeholder="Engineer name"></div>
    <div class="fg"><label>Mobile Number (10 digits)</label><input id="cu-mobile" type="tel" placeholder="9876543210" maxlength="10"></div>
    <div class="fg"><label>Password</label><input id="cu-pass" type="password" placeholder="Min 4 characters"></div>
    <div class="fg"><label>Assign to Sites</label>
      <div id="cu-sites-list" style="border:1.5px solid var(--border);border-radius:8px;padding:8px">
        ${siteToggles || '<p style="font-size:.78em;color:#999">No sites created yet</p>'}
      </div>
    </div>
    <button class="btn btn-primary" onclick="doCreateUser()">Create Account</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doCreateUser() {
  const checked = [...document.querySelectorAll("#cu-sites-list .switch.on")].map(el => el.dataset.site);
  try {
    await api("/api/users", { method: "POST", body: {
      name: document.getElementById("cu-name").value.trim(),
      mobile: document.getElementById("cu-mobile").value.trim(),
      password: document.getElementById("cu-pass").value,
      site_ids: checked.join(","),
    }});
    toast("✅ Site engineer account created!");
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

async function showEditUser(mobile, name, siteIds) {
  const sites = await api("/api/sites").catch(() => []);
  const userSites = siteIds.split(",").map(s => s.trim());
  const siteToggles = sites.map(s => `<div class="site-toggle">
    <div><div class="st-label">${s.name}</div><div class="st-sub">${s.site_id}</div></div>
    <div class="switch ${userSites.includes(s.site_id)?'on':''}" data-site="${s.site_id}" onclick="this.classList.toggle('on')"></div>
  </div>`).join("");
  const c = document.getElementById("admin-content");
  c.innerHTML = `<div class="card">
    <h3>✏️ Edit Engineer: ${name}</h3>
    <div class="fg"><label>Name</label><input id="eu-name" value="${name}"></div>
    <div class="fg"><label>Mobile (read-only)</label><input value="${mobile}" disabled style="background:#eee"></div>
    <div class="fg"><label>New Password (leave blank to keep)</label><input id="eu-pass" type="password" placeholder="Leave blank"></div>
    <div class="fg"><label>Assigned Sites</label>
      <div id="eu-sites-list" style="border:1.5px solid var(--border);border-radius:8px;padding:8px">${siteToggles}</div>
    </div>
    <button class="btn btn-primary" onclick="doEditUser('${mobile}')">Save Changes</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doEditUser(mobile) {
  const checked = [...document.querySelectorAll("#eu-sites-list .switch.on")].map(el => el.dataset.site);
  const fd = new FormData();
  fd.append("name", document.getElementById("eu-name").value.trim());
  fd.append("site_ids", checked.join(","));
  const pw = document.getElementById("eu-pass").value;
  if (pw) fd.append("password", pw);
  try {
    await api(`/api/users/${mobile}`, { method: "PUT", body: fd });
    toast("✅ User updated!");
    loadAdmin();
  } catch (e) { toast("Error: " + e.message, true); }
}

// ── MORE / SETTINGS ───────────────────────────────────────────────
function loadMore() {
  const s = document.getElementById("screen-more");
  const isAdmin = USER && (USER.role === "admin" || USER.role === "Role.admin");
  s.innerHTML = `
    <div class="card">
      <h3>👤 Profile</h3>
      <div class="entry-row"><div class="entry-left"><div class="item-name">${USER?.name || ""}</div><div class="item-meta">📱 ${USER?.mobile || ""} · ${USER?.role || ""} · Welkin Builders Infrastructure Ltd</div></div></div>
    </div>
    <div class="card">
      <h3>🔔 Notifications</h3>
      <div id="notif-list"><p style="font-size:.82em;color:#999">Loading...</p></div>
    </div>
    <div class="card">
      <h3>📋 Master Data</h3>
      <div class="entry-row" style="cursor:pointer" onclick="showItemListInMore()"><div class="entry-left"><div class="item-name">📦 Item Master</div><div class="item-meta">View & add items</div></div><div class="entry-right">→</div></div>
      <div class="entry-row" style="cursor:pointer" onclick="showVendorListInMore()"><div class="entry-left"><div class="item-name">🏪 Vendor Master</div><div class="item-meta">View & add vendors</div></div><div class="entry-right">→</div></div>
      ${isAdmin ? '<div class="entry-row" style="cursor:pointer" onclick="showUserListInMore()"><div class="entry-left"><div class="item-name">👥 Users</div><div class="item-meta">View all users</div></div><div class="entry-right">→</div></div>' : ''}
    </div>
    <button class="btn btn-danger" onclick="logout()">🚪 Logout</button>`;
  loadNotifList();
}

// Master data screens rendered inside the More tab
async function showItemListInMore() {
  const s = document.getElementById("screen-more");
  s.innerHTML = '<div class="card"><p>Loading items...</p></div>';
  try {
    const items = await api("/api/items/all");
    let html = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">📦 Item Master (${items.length})</h3>
        <button class="btn btn-outline btn-sm" onclick="loadMore()">← Back</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="showAddItemInMore()" style="margin-bottom:10px">+ Add New Item</button>
      <div class="search-box"><input id="item-search" placeholder="Search items (name, alias, category)..." oninput="fuzzyFilter('.item-row','item-search')"></div>`;
    for (const item of items) {
      html += `<div class="entry-row item-row" data-search="${(item.standard_name + ' ' + item.aliases + ' ' + item.category + ' ' + item.ledger).toLowerCase()}">
        <div class="entry-left"><div class="item-name">${item.standard_name}</div><div class="item-meta">${item.category} · ${item.default_unit} · ${item.ledger} ${item.aliases ? '· ' + item.aliases : ''}</div></div>
        <div class="entry-right"><span class="chip" style="cursor:pointer" onclick="showEditItem('${item.item_id}','${item.standard_name.replace(/'/g,"\\'")}','${item.category||''}','${(item.aliases||'').replace(/'/g,"\\'")}','${item.default_unit||'No.'}','${item.ledger||'Material'}')">✏️</span></div>
      </div>`;
    }
    html += "</div>";
    s.innerHTML = html;
  } catch (e) { s.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p><button class="btn btn-outline btn-sm" onclick="loadMore()">← Back</button></div>`; }
}

function showAddItemInMore() {
  const s = document.getElementById("screen-more");
  s.innerHTML = `<div class="card">
    <h3>📦 Add New Item</h3>
    <div class="fg"><label>Standard Name</label><input id="ai-name" placeholder="e.g. TMT Steel 12 MM"></div>
    <div class="fg"><label>Category</label><input id="ai-cat" list="ai-cat-list" placeholder="e.g. Steel & TMT Bars"><datalist id="ai-cat-list">
      <option>Cement & Concrete</option><option>Steel & TMT Bars</option><option>Aggregate & Sand</option>
      <option>Centering & Shuttering</option><option>Tools & Hardware</option><option>Electrical</option>
      <option>Plumbing & PVC</option><option>Machinery</option><option>Site Misc</option>
    </datalist></div>
    <div class="fg"><label>Aliases (comma-separated local names)</label><input id="ai-aliases" placeholder="e.g. sariya, Steel 12 mm"></div>
    <div class="row2">
      <div class="fg"><label>Default Unit</label><select id="ai-unit">${(ITEMS?.units || ["No.","Bag","KG","Cum","Cft","MT","Ton","Litre","Metre","Ft.","Sqft","Set","Box","Roll"]).map(u => '<option>' + u + '</option>').join("")}</select></div>
      <div class="fg"><label>Ledger</label><select id="ai-ledger">${(ITEMS?.ledger_types || ["Material","Consumable","Recevable","Centering","Machinery","General","Stationery"]).map(l => '<option>' + l + '</option>').join("")}</select></div>
    </div>
    <button class="btn btn-primary" onclick="doAddItemFromMore()">Add Item</button>
    <button class="btn btn-outline" onclick="showItemListInMore()">Cancel</button>
  </div>`;
}

async function doAddItemFromMore() {
  const fd = new FormData();
  fd.append("standard_name", document.getElementById("ai-name").value.trim());
  fd.append("category", document.getElementById("ai-cat").value.trim() || "General");
  fd.append("aliases", document.getElementById("ai-aliases").value.trim());
  fd.append("default_unit", document.getElementById("ai-unit").value);
  fd.append("ledger", document.getElementById("ai-ledger").value);
  try {
    await api("/api/items", { method: "POST", body: fd });
    toast("✅ Item added!");
    ITEMS = null; loadItemMaster();
    showItemListInMore();
  } catch (e) { toast("Error: " + e.message, true); }
}

function showEditItem(iid, name, category, aliases, unit, ledger) {
  const s = document.getElementById("screen-more");
  s.innerHTML = `<div class="card">
    <h3>✏️ Edit Item</h3>
    <div class="fg"><label>Standard Name</label><input id="ei-name" value="${name}"></div>
    <div class="fg"><label>Category</label><input id="ei-cat" value="${category}" list="ei-cat-list"><datalist id="ei-cat-list">
      <option>Cement & Concrete</option><option>Steel & TMT Bars</option><option>Aggregate & Sand</option>
      <option>Centering & Shuttering</option><option>Tools & Hardware</option><option>Electrical</option>
      <option>Plumbing & PVC</option><option>Machinery</option><option>Site Misc</option>
    </datalist></div>
    <div class="fg"><label>Aliases</label><input id="ei-aliases" value="${aliases}"></div>
    <div class="row2">
      <div class="fg"><label>Unit</label><select id="ei-unit">${(ITEMS?.units || ["No.","Bag","KG","Cum"]).map(u => '<option' + (u===unit?' selected':'') + '>' + u + '</option>').join("")}</select></div>
      <div class="fg"><label>Ledger</label><select id="ei-ledger">${(ITEMS?.ledger_types || ["Material"]).map(l => '<option' + (l===ledger?' selected':'') + '>' + l + '</option>').join("")}</select></div>
    </div>
    <button class="btn btn-primary" onclick="doEditItem('${iid}')">Save</button>
    <button class="btn btn-outline" onclick="showItemListInMore()">Cancel</button>
  </div>`;
}

async function doEditItem(iid) {
  const fd = new FormData();
  fd.append("standard_name", document.getElementById("ei-name").value.trim());
  fd.append("category", document.getElementById("ei-cat").value.trim());
  fd.append("aliases", document.getElementById("ei-aliases").value.trim());
  fd.append("default_unit", document.getElementById("ei-unit").value);
  fd.append("ledger", document.getElementById("ei-ledger").value);
  try {
    await api(`/api/items/${iid}`, { method: "PUT", body: fd });
    toast("✅ Item updated!");
    ITEMS = null; loadItemMaster();
    showItemListInMore();
  } catch (e) { toast("Error: " + e.message, true); }
}

async function showVendorListInMore() {
  const s = document.getElementById("screen-more");
  s.innerHTML = '<div class="card"><p>Loading vendors...</p></div>';
  try {
    const vendors = await api("/api/vendors");
    let html = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">🏪 Vendor Master (${vendors.length})</h3>
        <button class="btn btn-outline btn-sm" onclick="loadMore()">← Back</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="showCreateVendorInMore()" style="margin-bottom:10px">+ Add New Vendor</button>
      <div class="search-box"><input id="vendor-search" placeholder="Search vendors..." oninput="fuzzyFilter('.vendor-row','vendor-search')"></div>`;
    for (const v of vendors) {
      const sites = v.site_ids || '';
      html += `<div class="entry-row vendor-row" data-search="${(v.name + ' ' + v.contact + ' ' + v.category + ' ' + sites).toLowerCase()}">
        <div class="entry-left"><div class="item-name">${v.name}</div><div class="item-meta">📱 ${v.contact || '-'} · ${v.category || 'General'}${sites ? ' · Sites: ' + sites : ''}</div></div>
        <div class="entry-right"><span class="chip" style="cursor:pointer" onclick="showEditVendor('${v.vendor_id}','${v.name.replace(/'/g,"\\'")}','${v.contact||''}','${(v.address||'').replace(/'/g,"\\'")}','${v.category||'General'}','${sites}')">✏️</span></div>
      </div>`;
    }
    html += "</div>";
    s.innerHTML = html;
  } catch (e) { s.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p><button class="btn btn-outline btn-sm" onclick="loadMore()">← Back</button></div>`; }
}

async function showCreateVendorInMore() {
  const sites = await api("/api/sites").catch(() => []);
  const siteToggles = sites.map(s => `<div class="site-toggle">
    <div><div class="st-label">${s.name}</div><div class="st-sub">${s.site_id}</div></div>
    <div class="switch on" data-site="${s.site_id}" onclick="this.classList.toggle('on')"></div>
  </div>`).join("");
  const s = document.getElementById("screen-more");
  s.innerHTML = `<div class="card">
    <h3>🏪 Add New Vendor</h3>
    <div class="fg"><label>Vendor Name</label><input id="cv-name" placeholder="e.g. Wonder Cement Limited"></div>
    <div class="fg"><label>Contact (Mobile)</label><input id="cv-contact" type="tel" placeholder="9876543210"></div>
    <div class="fg"><label>Address</label><input id="cv-address" placeholder="e.g. Indore, MP"></div>
    <div class="fg"><label>Category</label>
      <select id="cv-category"><option>Material Supplier</option><option>Hardware Store</option><option>Steel Dealer</option><option>Cement Dealer</option><option>Sand/Aggregate</option><option>Electrical</option><option>Plumbing</option><option>Machinery</option><option>Transport</option><option>Labour Contractor</option><option>General</option></select>
    </div>
    <div class="fg"><label>Available at Sites</label>
      <div id="cv-sites-list" style="border:1.5px solid var(--border);border-radius:8px;padding:8px">
        ${siteToggles || '<p style="font-size:.78em;color:#999">No sites yet</p>'}
      </div>
    </div>
    <button class="btn btn-primary" onclick="doCreateVendorFromMore()">Add Vendor</button>
    <button class="btn btn-outline" onclick="showVendorListInMore()">Cancel</button>
  </div>`;
}

async function doCreateVendorFromMore() {
  const checked = [...document.querySelectorAll("#cv-sites-list .switch.on")].map(el => el.dataset.site);
  const fd = new FormData();
  fd.append("name", document.getElementById("cv-name").value.trim());
  fd.append("contact", document.getElementById("cv-contact").value.trim());
  fd.append("address", document.getElementById("cv-address").value.trim());
  fd.append("category", document.getElementById("cv-category").value);
  fd.append("site_ids", checked.join(","));
  try {
    await api("/api/vendors", { method: "POST", body: fd });
    toast("✅ Vendor added!");
    showVendorListInMore();
  } catch (e) { toast("Error: " + e.message, true); }
}

async function showEditVendor(vid, name, contact, address, category, siteIds) {
  const sites = await api("/api/sites").catch(() => []);
  const vSites = siteIds.split(",").map(s => s.trim());
  const siteToggles = sites.map(s => `<div class="site-toggle">
    <div><div class="st-label">${s.name}</div><div class="st-sub">${s.site_id}</div></div>
    <div class="switch ${vSites.includes(s.site_id)?'on':''}" data-site="${s.site_id}" onclick="this.classList.toggle('on')"></div>
  </div>`).join("");
  const s = document.getElementById("screen-more");
  s.innerHTML = `<div class="card">
    <h3>✏️ Edit Vendor</h3>
    <div class="fg"><label>Name</label><input id="ev-name" value="${name}"></div>
    <div class="fg"><label>Contact</label><input id="ev-contact" value="${contact}"></div>
    <div class="fg"><label>Address</label><input id="ev-address" value="${address}"></div>
    <div class="fg"><label>Category</label><input id="ev-category" value="${category}"></div>
    <div class="fg"><label>Sites</label><div id="ev-sites-list" style="border:1.5px solid var(--border);border-radius:8px;padding:8px">${siteToggles}</div></div>
    <button class="btn btn-primary" onclick="doEditVendor('${vid}')">Save</button>
    <button class="btn btn-outline" onclick="showVendorListInMore()">Cancel</button>
  </div>`;
}

async function doEditVendor(vid) {
  const checked = [...document.querySelectorAll("#ev-sites-list .switch.on")].map(el => el.dataset.site);
  const fd = new FormData();
  fd.append("name", document.getElementById("ev-name").value.trim());
  fd.append("contact", document.getElementById("ev-contact").value.trim());
  fd.append("address", document.getElementById("ev-address").value.trim());
  fd.append("category", document.getElementById("ev-category").value.trim());
  fd.append("site_ids", checked.join(","));
  try {
    await api(`/api/vendors/${vid}`, { method: "PUT", body: fd });
    toast("✅ Vendor updated!");
    showVendorListInMore();
  } catch (e) { toast("Error: " + e.message, true); }
}

async function showUserListInMore() {
  const s = document.getElementById("screen-more");
  s.innerHTML = '<div class="card"><p>Loading users...</p></div>';
  try {
    const users = await api("/api/users");
    let html = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">👥 Users (${users.length})</h3>
        <button class="btn btn-outline btn-sm" onclick="loadMore()">← Back</button>
      </div>
      <div class="search-box"><input id="user-search" placeholder="Search users..." oninput="fuzzyFilter('.user-row','user-search')"></div>`;
    for (const u of users) {
      html += `<div class="entry-row user-row" data-search="${(u.name + ' ' + u.mobile + ' ' + u.role + ' ' + (u.site_ids || '')).toLowerCase()}">
        <div class="entry-left"><div class="item-name">${u.name}</div><div class="item-meta">📱 ${u.mobile} · ${u.role}${u.site_ids ? ' · Sites: ' + u.site_ids : ''}</div></div>
      </div>`;
    }
    html += "</div>";
    s.innerHTML = html;
  } catch (e) { s.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p><button class="btn btn-outline btn-sm" onclick="loadMore()">← Back</button></div>`; }
}

// ── Fuzzy search helper ───────────────────────────────────────────
function fuzzyMatch(text, query) {
  if (!query) return true;
  text = text.toLowerCase();
  query = query.toLowerCase();
  // Check if all query chars appear in order
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

function fuzzyFilter(selector, inputId) {
  const q = document.getElementById(inputId).value.toLowerCase();
  document.querySelectorAll(selector).forEach(row => {
    const text = row.dataset.search || row.textContent;
    row.style.display = fuzzyMatch(text, q) ? "" : "none";
  });
}

async function loadNotifications() {
  try {
    const notifs = await api("/api/notifications");
    const unread = notifs.filter(n => !n.read).length;
  } catch (e) {}
}

async function loadNotifList() {
  try {
    const notifs = await api("/api/notifications");
    const el = document.getElementById("notif-list");
    if (!el) return;
    if (notifs.length === 0) { el.innerHTML = '<p style="font-size:.82em;color:#999">No notifications</p>'; return; }
    el.innerHTML = notifs.reverse().slice(0, 20).map(n => `
      <div class="entry-row" style="opacity:${n.read ? '.6' : '1'}" onclick="markRead('${n.id}',this)">
        <div class="entry-left"><div class="item-name" style="white-space:normal;font-size:.78em">${n.message}</div>
        <div class="item-meta">${n.created_at.split("T")[0]}</div></div>
      </div>`).join("");
  } catch (e) { const el = document.getElementById("notif-list"); if (el) el.innerHTML = '<p style="color:var(--danger)">Failed to load</p>'; }
}

async function markRead(id, el) {
  try { await api(`/api/notifications/${id}/read`, { method: "POST" }); el.style.opacity = ".6"; } catch (e) {}
}

// ── INIT & AUTO-UPDATE ────────────────────────────────────────────
const APP_VERSION = "1.1.0";

document.addEventListener("DOMContentLoaded", () => {
  // Register service worker with auto-update
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/static/sw.js").then((reg) => {
      // Check for updates every 30 minutes
      setInterval(() => reg.update(), 30 * 60 * 1000);
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            toast("🔄 App updated! Refreshing...");
            setTimeout(() => location.reload(), 1500);
          }
        });
      });
    }).catch(console.warn);
  }
  if (isLoggedIn()) showApp();
  else showLogin();
  // Hide splash after a short delay
  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (splash) { splash.classList.add("hide"); setTimeout(() => splash.remove(), 500); }
  }, 800);
});
