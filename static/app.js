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
  let html = `
    <div class="tab active" data-tab="entry"><span class="ico">📝</span>Entry</div>
    <div class="tab" data-tab="history"><span class="ico">📋</span>History</div>
    <div class="tab" data-tab="summary"><span class="ico">📊</span>Summary</div>`;
  if (isAdmin) {
    html += `<div class="tab" data-tab="reports"><span class="ico">📈</span>Reports</div>`;
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
  else if (name === "reports") loadReports();
  else if (name === "admin") loadAdmin();
  else if (name === "more") loadMore();
}

// ── Toast with sound ───────────────────────────────────────────────
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;
    if (type === "success") {
      osc.frequency.value = 800; osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === "error") {
      osc.frequency.value = 300; osc.type = "square";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.frequency.value = 600; osc.type = "sine";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    }
  } catch (e) {}
}

function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.style.display = "block";
  playSound(isError ? "error" : "success");
  setTimeout(() => { t.style.display = "none"; }, 2500);
}

// ── Reusable submit button animation ──────────────────────────────
async function animatedSubmit(btn, asyncFn) {
  if (btn._busy) return;
  btn._busy = true;
  const origHtml = btn.innerHTML;
  const origBg = btn.style.background;
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px"><span style="font-size:1.1em;animation:spin .7s linear infinite;display:inline-block">🏗️</span> Processing...</span>';
  btn.style.opacity = "0.7";
  try {
    await asyncFn();
    btn.innerHTML = "✅ Done!";
    btn.style.background = "var(--success)";
    btn.style.opacity = "1";
    playSound("success");
    await new Promise(r => setTimeout(r, 800));
  } catch (e) {
    btn.innerHTML = "❌ Failed";
    btn.style.background = "var(--danger)";
    btn.style.opacity = "1";
    playSound("error");
    toast("❌ " + e.message, true);
    await new Promise(r => setTimeout(r, 1200));
  } finally {
    btn.innerHTML = origHtml;
    btn.style.background = origBg || "";
    btn.style.opacity = "1";
    btn.disabled = false;
    btn._busy = false;
  }
}

// ── Loading skeleton ──────────────────────────────────────────────
function showLoading(el) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el) return;
  el.innerHTML = `<div class="loader"><div style="font-size:2em;animation:pulse 1s infinite">🏗️</div><div class="loader-text">Loading...</div></div>`;
}

function showSkeleton(el, rows = 4) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el) return;
  let html = '<div class="card"><div style="text-align:center;padding:10px"><div style="font-size:1.5em;animation:pulse 1s infinite">🏗️</div></div>';
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
    <div id="fund-balance-bar"></div>
    <div class="card">
      <h3>📝 New Cash Entry</h3>
      ${sitesHtml}
      <div class="row2">
        <div class="fg"><label>Date</label><input type="date" id="e-date" value="${today}"></div>
        <div class="fg"><label>Bill / Challan No.</label><input id="e-bill" placeholder="SB-68 or Nil" value="Nil"></div>
      </div>
      <div class="fg"><label>Party / Vendor</label>
        <select id="e-party" onchange="onVendorChange()"><option value="">Loading vendors...</option></select>
      </div>
      <div class="row2">
        <div class="fg"><label>Payment Mode</label><select id="e-payment">${(ITEMS?.payment_modes || ["Cash","UPI","Bank Transfer","Challan","Credit","HO (Head Office)"]).map(m => `<option>${m}</option>`).join("")}</select></div>
        <div class="fg"><label>Ref Ledger</label><select id="e-ledger">${(ITEMS?.ledger_types || ["Material"]).map(l => `<option>${l}</option>`).join("")}</select></div>
      </div>

      <div style="font-size:.75em;font-weight:700;color:var(--primary);margin:10px 0 6px">📦 Line Items</div>
      <div id="line-items-list"></div>
      <button type="button" class="btn btn-outline btn-sm" onclick="addLineItem()" style="margin-bottom:10px">+ Add Item</button>

      <div class="amount-box">
        <span class="label">Grand Total</span>
        <span class="value" id="e-total">₹ 0</span>
      </div>
      <div class="fg"><label>📸 Invoice</label>
        <div style="display:flex;align-items:center;gap:8px">
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('e-file').click()" style="flex-shrink:0">📷 Capture</button>
          <span id="file-name" style="font-size:.75em;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">No file</span>
        </div>
        <input type="file" id="e-file" accept="image/*" capture="environment" style="display:none" onchange="onFileSelected(this)">
      </div>
      <div class="fg"><label>Remarks</label><textarea id="e-remarks" rows="2" placeholder="Optional notes..."></textarea></div>
      <button class="btn btn-primary" id="save-entry-btn" onclick="submitEntry()">💾 Save Entry</button>
    </div>`;
  // Load vendors and add first line item
  addLineItem();
  // Load vendors into select dropdown (grouped by category)
  try {
    const vendors = await api("/api/vendors");
    const sel = document.getElementById("e-party");
    if (sel) {
      const groups = {};
      for (const v of vendors) {
        const cat = v.category || "General";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(v);
      }
      let html = '<option value="">-- Select Vendor --</option>';
      html += '<option value="__new__">+ Add New Vendor</option>';
      for (const [cat, vlist] of Object.entries(groups)) {
        html += `<optgroup label="${cat}">`;
        for (const v of vlist) html += `<option value="${v.name}">${v.name}</option>`;
        html += '</optgroup>';
      }
      sel.innerHTML = html;
    }
  } catch (e) { console.warn("Vendor load failed", e); }

  // Load fund balance
  updateFundBalance();
}

function onVendorChange() {
  const sel = document.getElementById("e-party");
  if (sel && sel.value === "__new__") {
    const name = prompt("Enter new vendor name:");
    if (name) {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
      sel.value = name;
    } else { sel.value = ""; }
  }
}

// ── Line Items ────────────────────────────────────────────────────
let _lineItemCount = 0;

function addLineItem() {
  const idx = _lineItemCount++;
  const list = document.getElementById("line-items-list");
  if (!list) return;
  const div = document.createElement("div");
  div.id = `li-${idx}`;
  div.className = "card";
  div.style.cssText = "padding:10px;margin-bottom:8px;border:1.5px solid var(--border);position:relative";
  div.innerHTML = `
    ${idx > 0 ? `<span style="position:absolute;top:6px;right:8px;cursor:pointer;font-size:.8em;color:var(--danger)" onclick="removeLineItem(${idx})">✕</span>` : ''}
    <div class="fg"><label>Item</label><select class="li-item" onchange="onLineItemChange(${idx})">${buildItemOptions()}</select></div>
    <div class="li-custom" style="display:none"><div class="fg"><label>Custom Item</label><input class="li-custom-name" placeholder="Type item name"></div></div>
    <div class="row3">
      <div class="fg"><label>Qty</label><input type="number" class="li-qty" placeholder="0" oninput="calcGrandTotal()"></div>
      <div class="fg"><label>Unit</label><select class="li-unit">${buildUnitOptions("No.")}</select></div>
      <div class="fg"><label>Rate ₹</label><input type="number" class="li-rate" placeholder="0" oninput="calcGrandTotal()"></div>
    </div>
    <div style="text-align:right;font-size:.82em;font-weight:700;color:var(--primary)" class="li-subtotal">₹ 0</div>`;
  list.appendChild(div);
}

function removeLineItem(idx) {
  const el = document.getElementById(`li-${idx}`);
  if (el) { el.remove(); calcGrandTotal(); }
}

function onLineItemChange(idx) {
  const div = document.getElementById(`li-${idx}`);
  if (!div) return;
  const sel = div.querySelector(".li-item");
  const opt = sel.options[sel.selectedIndex];
  if (sel.value === "__custom__") {
    div.querySelector(".li-custom").style.display = "block";
  } else {
    div.querySelector(".li-custom").style.display = "none";
    if (opt.dataset.unit) div.querySelector(".li-unit").value = opt.dataset.unit;
    if (opt.dataset.ledger) {
      const ledgerSel = document.getElementById("e-ledger");
      if (ledgerSel) ledgerSel.value = opt.dataset.ledger;
    }
  }
  calcGrandTotal();
}

function calcGrandTotal() {
  let total = 0;
  document.querySelectorAll("#line-items-list > div").forEach(div => {
    const q = parseFloat(div.querySelector(".li-qty")?.value) || 0;
    const r = parseFloat(div.querySelector(".li-rate")?.value) || 0;
    const sub = q * r;
    total += sub;
    const subEl = div.querySelector(".li-subtotal");
    if (subEl) subEl.textContent = "₹ " + sub.toLocaleString("en-IN");
  });
  const totalEl = document.getElementById("e-total");
  if (totalEl) totalEl.textContent = "₹ " + total.toLocaleString("en-IN");
}

function getLineItems() {
  const items = [];
  document.querySelectorAll("#line-items-list > div").forEach(div => {
    const sel = div.querySelector(".li-item");
    if (!sel) return;
    const itemName = sel.value === "__custom__"
      ? div.querySelector(".li-custom-name")?.value?.trim() || ""
      : sel.value;
    const qty = parseFloat(div.querySelector(".li-qty")?.value) || 0;
    const rate = parseFloat(div.querySelector(".li-rate")?.value) || 0;
    const unit = div.querySelector(".li-unit")?.value || "No.";
    // Include item if it has a name (even if qty is 0, user might have forgotten)
    if (itemName && itemName !== "" && itemName !== "-- Select Item --") {
      items.push({ item: itemName, qty: qty || 1, unit, rate, amount: (qty || 1) * rate });
    }
  });
  return items;
}

function onSiteChange() {
  const sel = document.getElementById("e-site");
  if (sel) {
    CURRENT_SITE = sel.value;
    localStorage.setItem("current_site", CURRENT_SITE);
    const opt = sel.options[sel.selectedIndex];
    document.getElementById("header-site").textContent = "📍 " + opt.textContent;
    // Refresh fund balance for new site
    updateFundBalance();
  }
}

async function updateFundBalance() {
  const bar = document.getElementById("fund-balance-bar");
  if (!bar) return;
  bar.innerHTML = '<div style="text-align:center;padding:8px;font-size:.75em;color:#999">Updating balance...</div>';
  try {
    // Get funds given to THIS user for the current site
    const myMobile = USER?.mobile || "";
    let fundsUrl = "/api/funds?";
    if (CURRENT_SITE) fundsUrl += "site_id=" + CURRENT_SITE + "&";
    if (myMobile) fundsUrl += "engineer_mobile=" + myMobile;
    const myFunds = await api(fundsUrl);
    const totalGiven = myFunds.reduce((s, f) => s + Number(f.amount), 0);

    // Get MY entries for the current site (already filtered by user on backend for engineers)
    let totalSpent = 0;
    if (CURRENT_SITE) {
      const myEntries = await api("/api/entries/" + CURRENT_SITE);
      // Only count cash-deducting entries (exclude HO payment mode, Challan, and HO vendors)
      totalSpent = myEntries
        .filter(e => {
          if (e.payment_mode === "HO (Head Office)" || e.payment_mode === "Challan") return false;
          const vendor = (e.party_name || "").toUpperCase();
          if (vendor.startsWith("HO ") || vendor.includes(" HO ") || vendor === "HO") return false;
          return true;
        })
        .reduce((s, e) => s + Number(e.amount), 0);
    }

    const bal = totalGiven - totalSpent;
    if (totalGiven > 0) {
      const color = bal >= 0 ? "var(--success)" : "var(--danger)";
      bar.innerHTML = `<div class="card" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:${bal >= 0 ? '#e8fbe8' : '#fde8e8'}">
        <div><div style="font-size:.7em;color:#666">Your Fund Balance</div><div style="font-size:.65em;color:#999">Given: ₹${Number(totalGiven).toLocaleString("en-IN")} · Spent: ₹${Number(totalSpent).toLocaleString("en-IN")}</div></div>
        <div style="font-size:1.2em;font-weight:800;color:${color}">₹${Number(bal).toLocaleString("en-IN")}</div>
      </div>`;
    } else {
      bar.innerHTML = "";
    }
  } catch (e) { bar.innerHTML = ""; }
}

function calcTotal() { calcGrandTotal(); }

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

let _submitting = false;
async function submitEntry() {
  if (_submitting) return;
  const lineItems = getLineItems();
  if (lineItems.length === 0) { toast("Add at least one item with quantity", true); return; }

  // Warn about items without qty
  const allDivs = document.querySelectorAll("#line-items-list > div");
  let skipped = allDivs.length - lineItems.length;
  if (skipped > 0) toast(`⚠️ ${skipped} item(s) skipped (no item selected)`, true);

  const siteEl = document.getElementById("e-site");
  const targetSite = siteEl ? siteEl.value : CURRENT_SITE;
  if (!targetSite) { toast("No site selected", true); return; }

  _submitting = true;
  const btn = document.getElementById("save-entry-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px"><span style="font-size:1.1em;animation:spin .7s linear infinite;display:inline-block">🏗️</span> Saving ${lineItems.length} item(s)...</span>`;
    btn.style.opacity = "0.7";
  }

  const commonData = {
    entry_date: document.getElementById("e-date").value,
    bill_no: document.getElementById("e-bill").value || "Nil",
    party_name: document.getElementById("e-party").value.trim() || "Cash Purchase",
    payment_mode: document.getElementById("e-payment").value,
    ref_ledger: document.getElementById("e-ledger").value,
    remarks: document.getElementById("e-remarks").value,
  };

  try {
    let lastResult = null;
    // Generate batch ID to group all line items
    const batchId = "B-" + Date.now().toString(36).toUpperCase();
    for (const li of lineItems) {
      const body = {
        ...commonData,
        item_description: li.item,
        quantity: li.qty,
        unit: li.unit,
        rate: li.rate,
        amount: li.amount,
      };
      lastResult = await api(`/api/entries/${targetSite}?batch_id=${batchId}`, { method: "POST", body });
    }

    api("/api/cache/clear", { method: "POST" }).catch(() => {});
    toast(`✅ ${lineItems.length} item(s) saved!`);
    if (btn) { btn.innerHTML = "✅ Saved!"; btn.style.background = "var(--success)"; btn.style.opacity = "1"; }

    const fileInput = document.getElementById("e-file");
    if (fileInput.files && fileInput.files[0] && lastResult) {
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      try {
        await api(`/api/invoices/${targetSite}/${lastResult.entry_id}`, { method: "POST", body: fd });
        toast("📸 Invoice uploaded!");
      } catch (e) { toast("Items saved but invoice upload failed", true); }
    }

    await new Promise(r => setTimeout(r, 1000));
    _lineItemCount = 0;
    loadEntryForm();
  } catch (e) {
    toast("❌ " + e.message, true);
    if (btn) { btn.innerHTML = "❌ Failed — Tap to retry"; btn.style.background = "var(--danger)"; btn.style.opacity = "1"; btn.disabled = false; }
  } finally {
    _submitting = false;
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
      window._historyEntries = entries;
      // Group by batch_id for display
      let shownBatches = new Set();
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const bid = e.batch_id || "";
        // If this entry has a batch, show grouped
        if (bid && !shownBatches.has(bid)) {
          shownBatches.add(bid);
          const batchItems = entries.filter(x => x.batch_id === bid);
          const batchTotal = batchItems.reduce((s, x) => s + Number(x.amount), 0);
          const itemNames = batchItems.map(x => x.item_description).join(", ");
          html += `<div class="entry-row" style="cursor:pointer" onclick="showBatchDetail('${bid}')" data-search="${(itemNames + ' ' + e.party_name + ' ' + batchTotal).toLowerCase()}">
            <div class="entry-left">
              <div class="item-name">${batchItems.length} items: ${itemNames.length > 40 ? itemNames.substring(0, 40) + '...' : itemNames}</div>
              <div class="item-meta">${e.party_name} · ${e.bill_no} · ${e.payment_mode} <span class="status-badge status-${e.status}">${e.status}</span></div>
            </div>
            <div class="entry-right">
              <div class="amount">₹${Number(batchTotal).toLocaleString("en-IN")}</div>
              <div class="date">${e.entry_date}${e.invoice_url ? ' 📎' : ''}</div>
            </div>
          </div>`;
        } else if (!bid) {
          // Single entry (no batch)
          html += `<div class="entry-row" style="cursor:pointer" onclick="showEntryDetail(${i})" data-search="${(e.item_description + ' ' + e.party_name + ' ' + e.amount).toLowerCase()}">
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

// ── Entry Detail View ─────────────────────────────────────────────
function showBatchDetail(batchId) {
  const entries = (window._historyEntries || []).filter(e => e.batch_id === batchId);
  if (entries.length === 0) return;
  const s = document.getElementById("screen-history");
  const e0 = entries[0];
  const isAdmin = USER && (USER.role === "admin" || USER.role === "Role.admin");
  const batchTotal = entries.reduce((s, e) => s + Number(e.amount), 0);

  let html = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">📋 Bill Detail (${entries.length} items)</h3>
      <button class="btn btn-outline btn-sm" onclick="loadHistory()">← Back</button>
    </div>
    <table style="width:100%;font-size:.82em;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#888">Date</td><td style="font-weight:600">${e0.entry_date}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Bill No.</td><td style="font-weight:600">${e0.bill_no}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Vendor</td><td style="font-weight:600">${e0.party_name}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Payment</td><td>${e0.payment_mode}</td></tr>
      <tr><td style="padding:4px 0;color:#888">By</td><td>${e0.entered_by}</td></tr>
      <tr><td style="padding:4px 0;color:#888">Status</td><td><span class="status-badge status-${e0.status}">${e0.status}</span></td></tr>
    </table>
  </div>
  <div class="card"><h3>📦 Line Items</h3>`;

  for (const e of entries) {
    html += `<div class="entry-row">
      <div class="entry-left">
        <div class="item-name">${e.item_description}</div>
        <div class="item-meta">${e.quantity} ${e.unit} × ₹${Number(e.rate).toLocaleString("en-IN")}</div>
      </div>
      <div class="entry-right"><div class="amount">₹${Number(e.amount).toLocaleString("en-IN")}</div></div>
    </div>`;
  }
  html += `<div style="border-top:2px solid var(--primary);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between">
    <span style="font-weight:700">Total</span>
    <span style="font-weight:800;color:var(--primary);font-size:1.1em">₹${Number(batchTotal).toLocaleString("en-IN")}</span>
  </div></div>`;

  // Admin approve/reject for pending batches
  if (isAdmin && e0.status === "Pending") {
    html += `<div class="card">
      <h3>✅ Approve / Reject Batch</h3>
      <div class="fg"><label>Admin Remarks</label><input id="batch-remarks" placeholder="Optional remarks"></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-success" onclick="reconcileBatch('${e0.site_id}','${batchId}','Approved')">✅ Approve All</button>
        <button class="btn btn-danger" onclick="reconcileBatch('${e0.site_id}','${batchId}','Rejected')">❌ Reject All</button>
      </div>
    </div>`;
  }

  s.innerHTML = html;
}

async function reconcileBatch(siteId, batchId, action) {
  const remarks = document.getElementById("batch-remarks")?.value || "";
  const entries = (window._historyEntries || []).filter(e => e.batch_id === batchId);
  try {
    for (const e of entries) {
      await api(`/api/reconcile/${siteId}`, {
        method: "POST", body: { entry_id: e.entry_id, action, admin_remarks: remarks },
      });
    }
    toast(`${action === "Approved" ? "✅" : "❌"} ${entries.length} items ${action}`);
    api("/api/cache/clear", { method: "POST" }).catch(() => {});
    loadHistory();
  } catch (e) { toast("Error: " + e.message, true); }
}

function showEntryDetail(idx) {
  const e = window._historyEntries?.[idx];
  if (!e) return;
  const s = document.getElementById("screen-history");
  const isAdmin = USER && (USER.role === "admin" || USER.role === "Role.admin");
  const canEdit = isAdmin && e.status === "Pending";

  let html = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">📋 Entry Detail</h3>
      <button class="btn btn-outline btn-sm" onclick="loadHistory()">← Back</button>
    </div>
    <div style="text-align:center;margin-bottom:12px">
      <span class="status-badge status-${e.status}" style="font-size:.85em;padding:4px 14px">${e.status}</span>
    </div>
    <table style="width:100%;font-size:.82em;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#888;width:35%">Date</td><td style="padding:6px 0;font-weight:600">${e.entry_date}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Bill No.</td><td style="padding:6px 0;font-weight:600">${e.bill_no}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Vendor</td><td style="padding:6px 0;font-weight:600">${e.party_name}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Item</td><td style="padding:6px 0;font-weight:600">${e.item_description}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Qty × Rate</td><td style="padding:6px 0;font-weight:600">${e.quantity} ${e.unit} × ₹${Number(e.rate).toLocaleString("en-IN")}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:1.1em">Amount</td><td style="padding:6px 0;font-weight:800;font-size:1.1em;color:var(--primary)">₹${Number(e.amount).toLocaleString("en-IN")}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Payment</td><td style="padding:6px 0">${e.payment_mode}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Ledger</td><td style="padding:6px 0">${e.ref_ledger}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Entered By</td><td style="padding:6px 0">${e.entered_by}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Entry ID</td><td style="padding:6px 0;font-size:.7em;color:#999">${e.entry_id}</td></tr>
      ${e.remarks ? `<tr><td style="padding:6px 0;color:#888">Remarks</td><td style="padding:6px 0">${e.remarks}</td></tr>` : ''}
      ${e.invoice_url ? `<tr><td style="padding:6px 0;color:#888">Invoice</td><td style="padding:6px 0"><a href="${e.invoice_url}" target="_blank" class="btn btn-outline btn-sm">📎 View Invoice</a></td></tr>` : ''}
    </table>
  </div>`;

  // Admin can edit pending entries from site engineers
  if (canEdit) {
    html += `<div class="card">
      <h3>✏️ Edit Entry (Admin)</h3>
      <div class="row2">
        <div class="fg"><label>Qty</label><input type="number" id="ed-qty" value="${e.quantity}"></div>
        <div class="fg"><label>Rate (₹)</label><input type="number" id="ed-rate" value="${e.rate}"></div>
      </div>
      <div class="fg"><label>Amount (₹)</label><input type="number" id="ed-amount" value="${e.amount}"></div>
      <div class="fg"><label>Remarks</label><input id="ed-remarks" value="${e.remarks || ''}" placeholder="Admin remarks"></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-success" onclick="approveWithEdit('${e.site_id}','${e.entry_id}')">✅ Approve</button>
        <button class="btn btn-danger" onclick="rejectEntry('${e.site_id}','${e.entry_id}')">❌ Reject</button>
      </div>
    </div>`;
  }

  s.innerHTML = html;
}

async function approveWithEdit(siteId, entryId) {
  const remarks = document.getElementById("ed-remarks")?.value || "";
  try {
    await api(`/api/reconcile/${siteId}`, {
      method: "POST", body: { entry_id: entryId, action: "Approved", admin_remarks: remarks },
    });
    toast("✅ Entry approved!");
    loadHistory();
  } catch (e) { toast("Error: " + e.message, true); }
}

async function rejectEntry(siteId, entryId) {
  const remarks = document.getElementById("ed-remarks")?.value || prompt("Reason for rejection:") || "";
  try {
    await api(`/api/reconcile/${siteId}`, {
      method: "POST", body: { entry_id: entryId, action: "Rejected", admin_remarks: remarks },
    });
    toast("❌ Entry rejected");
    loadHistory();
  } catch (e) { toast("Error: " + e.message, true); }
}

// ── SUMMARY ───────────────────────────────────────────────────────
let SUMMARY_FILTER = "month"; // week, month, year, all, custom
let SUMMARY_FROM = "";
let SUMMARY_TO = "";

async function loadSummary() {
  const s = document.getElementById("screen-summary");
  const isAdmin = USER && (USER.role === "admin" || USER.role === "Role.admin");
  s.innerHTML = '<div class="loader"><div style="font-size:2em;animation:pulse 1s infinite">🏗️</div><div class="loader-text">Loading summary...</div></div>';

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
      <div id="admin-btns" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button class="btn btn-outline btn-sm admin-action" onclick="adminAction(this,'showCreateSite')">📍 New Site</button>
        <button class="btn btn-outline btn-sm admin-action" onclick="adminAction(this,'showCreateUser')">👤 Add Engineer</button>
        <button class="btn btn-outline btn-sm admin-action" onclick="adminAction(this,'showReleaseFund')">💰 Release Fund</button>
        <button class="btn btn-outline btn-sm admin-action" onclick="adminAction(this,'showFundRecon')">📊 Fund Recon</button>
        <button class="btn btn-outline btn-sm admin-action" onclick="adminAction(this,'detectNewSheets')">📄 Detect Sheets</button>
        <button class="btn btn-outline btn-sm admin-action" onclick="adminAction(this,'doRefresh')">🔄 Refresh</button>
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

  // Reconciliation — group by batch (invoice level)
  try {
    const sites = await api("/api/sites");
    let pendingHtml = "";
    let pendingCount = 0;
    for (const site of sites) {
      if (site.name && site.name.startsWith("[CLOSED]")) continue;
      const entries = await api(`/api/entries/${site.site_id}?status=Pending`);
      if (entries.length === 0) continue;

      // Group by batch_id (or entry_id for single items)
      const batches = {};
      for (const e of entries) {
        const key = e.batch_id || e.entry_id;
        if (!batches[key]) batches[key] = { items: [], site };
        batches[key].items.push(e);
      }

      for (const [batchKey, batch] of Object.entries(batches)) {
        pendingCount++;
        const items = batch.items;
        const e0 = items[0];
        const total = items.reduce((s, x) => s + Number(x.amount), 0);
        const itemNames = items.map(x => x.item_description).join(", ");
        const shortItems = itemNames.length > 50 ? itemNames.substring(0, 50) + "..." : itemNames;

        pendingHtml += `<div class="entry-row" style="flex-wrap:wrap;cursor:pointer" onclick="showBatchForApproval('${site.site_id}','${batchKey}')">
          <div class="entry-left" style="flex-basis:100%">
            <div class="item-name">${items.length > 1 ? items.length + ' items: ' : ''}${shortItems}</div>
            <div class="item-meta">₹${Number(total).toLocaleString("en-IN")} · ${e0.party_name} · ${e0.entered_by} · ${site.name} · ${e0.entry_date}</div>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();showBatchForApproval('${site.site_id}','${batchKey}')">📋 View Invoice</button>
          </div>
        </div>`;
      }
    }
    html += `<div class="card"><h3>⏳ Pending Invoices (${pendingCount})</h3>`;
    html += pendingCount ? pendingHtml : '<p style="font-size:.82em;color:#999">No pending invoices</p>';
    html += "</div>";
  } catch (e) {}

  s.innerHTML = html;
}

async function showBatchForApproval(siteId, batchKey) {
  const c = document.getElementById("admin-content");
  c.innerHTML = '<div class="loader"><div style="font-size:2em;animation:pulse 1s infinite">🏗️</div><div class="loader-text">Loading invoice...</div></div>';
  try {
    const allEntries = await api(`/api/entries/${siteId}?status=Pending`);
    // Find entries matching this batch
    let items = allEntries.filter(e => (e.batch_id || e.entry_id) === batchKey);
    if (items.length === 0) items = allEntries.filter(e => e.entry_id === batchKey);
    if (items.length === 0) { c.innerHTML = '<div class="card"><p>Invoice not found</p></div>'; return; }

    const e0 = items[0];
    const total = items.reduce((s, x) => s + Number(x.amount), 0);
    const hasInvoice = items.some(x => x.invoice_url);

    // Store items for editing
    window._approvalItems = items;

    let html = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">📋 Invoice for Approval</h3>
        <button class="btn btn-outline btn-sm" onclick="loadAdmin()">← Back</button>
      </div>
      <table style="width:100%;font-size:.85em;border-collapse:collapse">
        <tr><td style="padding:5px 0;color:#888;width:30%">Date</td><td style="font-weight:600">${e0.entry_date}</td></tr>
        <tr><td style="padding:5px 0;color:#888">Bill No.</td><td style="font-weight:600">${e0.bill_no}</td></tr>
        <tr><td style="padding:5px 0;color:#888">Vendor</td><td style="font-weight:600">${e0.party_name}</td></tr>
        <tr><td style="padding:5px 0;color:#888">Payment</td><td><select id="edit-payment" style="padding:4px;font-size:.9em">${(ITEMS?.payment_modes || ["Cash","UPI","Bank Transfer","Challan","Credit","HO (Head Office)"]).map(m => `<option ${m === e0.payment_mode ? 'selected' : ''}>${m}</option>`).join("")}</select></td></tr>
        <tr><td style="padding:5px 0;color:#888">Entered By</td><td>${e0.entered_by}</td></tr>
        <tr><td style="padding:5px 0;color:#888">Site</td><td>${siteId}</td></tr>
      </table>
    </div>

    <div class="card">
      <h3>📦 Edit Items (${items.length})</h3>`;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      html += `<div style="padding:8px 0;border-bottom:1px solid #f0f0f0">
        <div style="font-size:.85em;font-weight:600;margin-bottom:4px">${item.item_description}</div>
        <div class="row3">
          <div class="fg" style="margin:0"><label style="font-size:.65em">Qty</label><input type="number" class="edit-qty" data-idx="${i}" value="${item.quantity}" oninput="recalcInvoiceTotal()" style="padding:6px"></div>
          <div class="fg" style="margin:0"><label style="font-size:.65em">UOM</label><input class="edit-unit" data-idx="${i}" value="${item.unit}" style="padding:6px;font-size:.85em" readonly></div>
          <div class="fg" style="margin:0"><label style="font-size:.65em">Unit Price ₹</label><input type="number" class="edit-rate" data-idx="${i}" value="${item.rate}" oninput="recalcInvoiceTotal()" style="padding:6px"></div>
        </div>
        <div style="text-align:right;font-size:.78em;color:var(--primary);font-weight:700" class="edit-subtotal">= ₹${Number(item.amount).toLocaleString("en-IN")}</div>
        <input type="hidden" class="edit-amt" data-idx="${i}" value="${item.amount}">
      </div>`;
    }

    html += `<div id="invoice-total-bar" style="border-top:2px solid var(--primary);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between">
      <span style="font-weight:700;font-size:1em">Invoice Total</span>
      <span style="font-weight:800;color:var(--primary);font-size:1.2em" id="invoice-edit-total">₹${Number(total).toLocaleString("en-IN")}</span>
    </div></div>`;

    // Invoice photo
    if (hasInvoice) {
      const invoiceUrl = items.find(x => x.invoice_url)?.invoice_url;
      html += `<div class="card">
        <h3>📸 Invoice Photo</h3>
        <img src="${invoiceUrl}" style="width:100%;border-radius:8px;max-height:400px;object-fit:contain" onerror="this.parentElement.innerHTML='<p style=color:#999>Could not load image</p>'">
        <a href="${invoiceUrl}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px;display:block;text-align:center">Open Full Size</a>
      </div>`;
    }

    // Approve / Reject (with save)
    html += `<div class="card">
      <div class="fg"><label>Admin Remarks</label><input id="approval-remarks" placeholder="Optional remarks"></div>
      <button class="btn btn-outline" onclick="animatedSubmit(this, ()=>saveInvoiceEdits('${siteId}','${batchKey}'))" style="margin-bottom:8px">💾 Save Changes Only</button>
      <div style="display:flex;gap:6px">
        <button class="btn btn-success" onclick="animatedSubmit(this, ()=>approveBatch('${siteId}','${batchKey}','Approved'))">✅ Save & Approve</button>
        <button class="btn btn-danger" onclick="animatedSubmit(this, ()=>approveBatch('${siteId}','${batchKey}','Rejected'))">❌ Reject</button>
      </div>
    </div>`;

    c.innerHTML = html;
  } catch (e) { c.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p></div>`; }
}

function recalcInvoiceTotal() {
  let total = 0;
  document.querySelectorAll(".edit-qty").forEach(qEl => {
    const idx = qEl.dataset.idx;
    const q = parseFloat(qEl.value) || 0;
    const r = parseFloat(document.querySelector(`.edit-rate[data-idx="${idx}"]`)?.value) || 0;
    const amt = q * r;
    total += amt;
    const amtEl = document.querySelector(`.edit-amt[data-idx="${idx}"]`);
    if (amtEl) amtEl.value = amt;
    const subEl = qEl.closest("div[style]")?.parentElement?.querySelector(".edit-subtotal");
    if (subEl) subEl.textContent = "= ₹" + amt.toLocaleString("en-IN");
  });
  const totalEl = document.getElementById("invoice-edit-total");
  if (totalEl) totalEl.textContent = "₹ " + total.toLocaleString("en-IN");
}

async function saveInvoiceEdits(siteId, batchKey) {
  const items = window._approvalItems || [];
  for (let i = 0; i < items.length; i++) {
    const qtyEl = document.querySelector(`.edit-qty[data-idx="${i}"]`);
    const rateEl = document.querySelector(`.edit-rate[data-idx="${i}"]`);
    const amtEl = document.querySelector(`.edit-amt[data-idx="${i}"]`);
    const newQty = parseFloat(qtyEl?.value) || 0;
    const newRate = parseFloat(rateEl?.value) || 0;
    const newAmt = parseFloat(amtEl?.value) || newQty * newRate;
    const fd = new FormData();
    fd.append("quantity", newQty);
    fd.append("rate", newRate);
    fd.append("amount", newAmt);
    const payEl = document.getElementById("edit-payment");
    if (payEl) fd.append("payment_mode", payEl.value);
    await api(`/api/entries/${siteId}/${items[i].entry_id}`, { method: "PUT", body: fd });
  }
  api("/api/cache/clear", { method: "POST" }).catch(() => {});
  toast("✅ Changes saved!");
}

async function approveBatch(siteId, batchKey, action) {
  const remarks = document.getElementById("approval-remarks")?.value || "";
  const items = window._approvalItems || [];

  // Save any edits first
  for (let i = 0; i < items.length; i++) {
    const qtyEl = document.querySelector(`.edit-qty[data-idx="${i}"]`);
    const rateEl = document.querySelector(`.edit-rate[data-idx="${i}"]`);
    const amtEl = document.querySelector(`.edit-amt[data-idx="${i}"]`);
    if (qtyEl && rateEl) {
      const newQty = parseFloat(qtyEl.value) || 0;
      const newRate = parseFloat(rateEl.value) || 0;
      const newAmt = parseFloat(amtEl?.value) || newQty * newRate;
      // Only update if changed
      if (newQty != items[i].quantity || newRate != items[i].rate) {
        const fd = new FormData();
        fd.append("quantity", newQty);
        fd.append("rate", newRate);
        fd.append("amount", newAmt);
        const payEl = document.getElementById("edit-payment");
        if (payEl) fd.append("payment_mode", payEl.value);
        await api(`/api/entries/${siteId}/${items[i].entry_id}`, { method: "PUT", body: fd });
      }
    }
  }

  // Also save payment mode change for all items
  const payEl = document.getElementById("edit-payment");
  if (payEl && items.length > 0 && payEl.value !== items[0].payment_mode) {
    for (const item of items) {
      const fd = new FormData();
      fd.append("payment_mode", payEl.value);
      await api(`/api/entries/${siteId}/${item.entry_id}`, { method: "PUT", body: fd });
    }
  }

  // Now approve/reject
  const allEntries = await api(`/api/entries/${siteId}?status=Pending`);
  let batchItems = allEntries.filter(e => (e.batch_id || e.entry_id) === batchKey);
  if (batchItems.length === 0) batchItems = allEntries.filter(e => e.entry_id === batchKey);

  for (const e of batchItems) {
    await api(`/api/reconcile/${siteId}`, {
      method: "POST", body: { entry_id: e.entry_id, action, admin_remarks: remarks },
    });
  }
  api("/api/cache/clear", { method: "POST" }).catch(() => {});
  toast(`${action === "Approved" ? "✅" : "❌"} Invoice ${action} (${batchItems.length} items)`);
  loadAdmin();
}

function adminAction(btn, fnName) {
  // Highlight the clicked button, reset others
  document.querySelectorAll(".admin-action").forEach(b => {
    b.classList.remove("btn-primary");
    b.classList.add("btn-outline");
  });
  btn.classList.remove("btn-outline");
  btn.classList.add("btn-primary");
  // Call the function
  if (fnName === "doRefresh") {
    api("/api/cache/clear", { method: "POST" }).then(() => { toast("Cache cleared"); loadAdmin(); });
  } else {
    window[fnName]();
  }
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, doReleaseFund)">💰 Release Fund</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doReleaseFund() {
  const engSel = document.getElementById("rf-eng");
  const engOpt = engSel.options[engSel.selectedIndex];
  if (!engSel.value) throw new Error("Select an engineer");
  const fd = new FormData();
  fd.append("site_id", document.getElementById("rf-site").value);
  fd.append("engineer_mobile", engSel.value);
  fd.append("engineer_name", engOpt.dataset.name || "");
  fd.append("amount", document.getElementById("rf-amount").value);
  fd.append("date", document.getElementById("rf-date").value);
  fd.append("payment_mode", document.getElementById("rf-mode").value);
  fd.append("remarks", document.getElementById("rf-remarks").value);
  await api("/api/funds", { method: "POST", body: fd });
  toast("✅ Fund released!");
  loadAdmin();
}

// ── Fund Reconciliation View ──────────────────────────────────────
async function showFundRecon() {
  const c = document.getElementById("admin-content");
  c.innerHTML = '<div class="loader"><div style="font-size:2em;animation:pulse 1s infinite">🏗️</div><div class="loader-text">Loading reconciliation...</div></div>';
  try {
    const data = await api("/api/funds/reconciliation");
    let html = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">💰 Fund Reconciliation</h3>
        <button class="btn btn-outline btn-sm" onclick="loadAdmin()">← Back</button>
      </div>
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="val" style="color:var(--success)">₹${Number(data.total_given).toLocaleString("en-IN")}</div><div class="lbl">Total Fund Given</div></div>
        <div class="stat"><div class="val" style="color:var(--danger)">₹${Number(data.total_spent).toLocaleString("en-IN")}</div><div class="lbl">Engineers Spent</div></div>
        <div class="stat" style="grid-column:span 2"><div class="val" style="color:${data.total_balance >= 0 ? 'var(--success)' : 'var(--danger)'}">₹${Number(data.total_balance).toLocaleString("en-IN")}</div><div class="lbl">Remaining Balance</div></div>
      </div>
      <p style="font-size:.65em;color:#999;margin-top:-8px">* Only site engineer entries count as spent. Admin entries excluded.</p>
    </div>`;

    // Per-site breakdown
    for (const site of (data.sites || [])) {
      const balColor = site.balance >= 0 ? "var(--success)" : "var(--danger)";
      html += `<div class="card">
        <h3>📍 ${site.site_name || site.site_id}</h3>
        <div class="stat-grid" style="margin-bottom:8px">
          <div class="stat"><div class="val" style="font-size:1.1em;color:var(--success)">₹${Number(site.total_given).toLocaleString("en-IN")}</div><div class="lbl">Given</div></div>
          <div class="stat"><div class="val" style="font-size:1.1em;color:var(--danger)">₹${Number(site.total_spent).toLocaleString("en-IN")}</div><div class="lbl">Spent</div></div>
        </div>
        <div style="text-align:center;margin-bottom:8px"><span style="font-size:1em;font-weight:800;color:${balColor}">Balance: ₹${Number(site.balance).toLocaleString("en-IN")}</span></div>`;

      // Engineers in this site
      if (site.engineers && site.engineers.length > 0) {
        html += '<div style="font-size:.7em;font-weight:700;color:#666;margin:6px 0 4px">Engineers:</div>';
        for (const eng of site.engineers) {
          const eColor = eng.balance >= 0 ? "var(--success)" : "var(--danger)";
          html += `<div class="entry-row">
            <div class="entry-left">
              <div class="item-name">👤 ${eng.name}</div>
              <div class="item-meta">Given: ₹${Number(eng.given).toLocaleString("en-IN")} · Spent: ₹${Number(eng.spent).toLocaleString("en-IN")}</div>
            </div>
            <div class="entry-right"><div class="amount" style="color:${eColor}">₹${Number(eng.balance).toLocaleString("en-IN")}</div><div class="date">Balance</div></div>
          </div>`;
        }
      }
      html += "</div>";
    }

    // Recent fund releases with full details
    const funds = await api("/api/funds");
    if (funds.length > 0) {
      html += '<div class="card"><h3>📋 Fund Release History</h3>';
      for (const f of funds.slice(-30).reverse()) {
        const dt = f.created_at ? new Date(f.created_at) : null;
        const timeStr = dt ? dt.toLocaleString("en-IN", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : f.date;
        html += `<div class="entry-row">
          <div class="entry-left">
            <div class="item-name">₹${Number(f.amount).toLocaleString("en-IN")} → ${f.engineer_name}</div>
            <div class="item-meta">📍 ${f.site_id} · ${f.payment_mode}${f.remarks ? ' · ' + f.remarks : ''}</div>
            <div class="item-meta">🕐 ${timeStr} · By: ${f.released_by || 'Admin'}</div>
          </div>
        </div>`;
      }
      html += "</div>";
    }

    c.innerHTML = html;
  } catch (e) { c.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p><button class="btn btn-outline btn-sm" onclick="loadAdmin()">← Back</button></div>`; }
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, doCreateSite)">📍 Create Site</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doCreateSite() {
  const siteId = document.getElementById("cs-id").value.trim();
  if (!siteId) throw new Error("Site ID is required");
  await api("/api/sites", { method: "POST", body: {
    site_id: siteId,
    name: document.getElementById("cs-name").value.trim(),
    location: document.getElementById("cs-loc").value.trim(),
    sheet_name: siteId,
  }});
  toast("✅ Site created! Sheet tab: " + siteId);
  loadAdmin();
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, doCreateUser)">👤 Create Account</button>
    <button class="btn btn-outline" onclick="loadAdmin()">Cancel</button>
  </div>`;
}

async function doCreateUser() {
  const checked = [...document.querySelectorAll("#cu-sites-list .switch.on")].map(el => el.dataset.site);
  await api("/api/users", { method: "POST", body: {
    name: document.getElementById("cu-name").value.trim(),
    mobile: document.getElementById("cu-mobile").value.trim(),
    password: document.getElementById("cu-pass").value,
    site_ids: checked.join(","),
  }});
  toast("✅ Site engineer account created!");
  loadAdmin();
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, ()=>doEditUser('${mobile}'))">💾 Save Changes</button>
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
  await api(`/api/users/${mobile}`, { method: "PUT", body: fd });
  toast("✅ User updated!");
  loadAdmin();
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, doAddItemFromMore)">📦 Add Item</button>
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, ()=>doEditItem('${iid}'))">💾 Save</button>
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, doCreateVendorFromMore)">🏪 Add Vendor</button>
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
    <button class="btn btn-primary" onclick="animatedSubmit(this, ()=>doEditVendor('${vid}'))">💾 Save</button>
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

// ── REPORTS TAB (Admin Analytics) ─────────────────────────────────
async function loadReports() {
  const s = document.getElementById("screen-reports");
  if (!s) return;
  s.innerHTML = '<div class="loader"><div style="font-size:2em;animation:pulse 1s infinite">🏗️</div><div class="loader-text">Loading reports...</div></div>';

  try {
    const sites = await api("/api/sites");
    let allEntries = [];
    for (const site of sites) {
      if (site.name && site.name.startsWith("[CLOSED]")) continue;
      const entries = await api(`/api/entries/${site.site_id}`);
      allEntries = allEntries.concat(entries.map(e => ({ ...e, site_name: site.name })));
    }

    let html = `<div class="card"><h3>📈 Reports & Analytics</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="showMaterialReport()">📦 Material Usage</button>
        <button class="btn btn-outline btn-sm" onclick="showDailyReport()">📅 Daily Spending</button>
        <button class="btn btn-outline btn-sm" onclick="showSiteComparison()">📍 Site Comparison</button>
        <button class="btn btn-outline btn-sm" onclick="showPriceAnomalies()">⚠️ Price Anomalies</button>
      </div>
    </div>
    <div id="report-content"></div>`;

    // Quick stats
    const totalAmt = allEntries.reduce((s, e) => s + Number(e.amount), 0);
    const thisMonth = allEntries.filter(e => {
      const d = new Date(e.entry_date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const thisMonthAmt = thisMonth.reduce((s, e) => s + Number(e.amount), 0);

    html += `<div class="card"><h3>📊 Quick Stats</h3>
      <div class="stat-grid">
        <div class="stat"><div class="val">${allEntries.length}</div><div class="lbl">Total Entries</div></div>
        <div class="stat"><div class="val">₹${totalAmt >= 100000 ? (totalAmt/100000).toFixed(1)+'L' : (totalAmt/1000).toFixed(0)+'K'}</div><div class="lbl">All Time Spend</div></div>
        <div class="stat"><div class="val">${thisMonth.length}</div><div class="lbl">This Month</div></div>
        <div class="stat"><div class="val">₹${thisMonthAmt >= 100000 ? (thisMonthAmt/100000).toFixed(1)+'L' : (thisMonthAmt/1000).toFixed(0)+'K'}</div><div class="lbl">This Month ₹</div></div>
      </div>
    </div>`;

    // Store for sub-reports
    window._reportEntries = allEntries;
    window._reportSites = sites;
    s.innerHTML = html;
  } catch (e) {
    s.innerHTML = `<div class="card"><p style="color:var(--danger)">${e.message}</p></div>`;
  }
}

function showMaterialReport() {
  const entries = window._reportEntries || [];
  const c = document.getElementById("report-content");
  // Group by item
  const items = {};
  for (const e of entries) {
    const name = e.item_description || "Unknown";
    if (!items[name]) items[name] = { qty: 0, amount: 0, count: 0, rates: [], sites: new Set() };
    items[name].qty += Number(e.quantity);
    items[name].amount += Number(e.amount);
    items[name].count++;
    items[name].rates.push(Number(e.rate));
    items[name].sites.add(e.site_id || "");
  }
  const sorted = Object.entries(items).sort((a, b) => b[1].amount - a[1].amount);

  let html = '<div class="card"><h3>📦 Material Usage Report</h3><div class="search-box"><input id="mat-search" placeholder="Search material..." oninput="fuzzyFilter(\'.mat-row\',\'mat-search\')"></div>';
  for (const [name, data] of sorted.slice(0, 50)) {
    const avgRate = data.rates.length ? (data.rates.reduce((a,b)=>a+b,0) / data.rates.length).toFixed(0) : 0;
    html += `<div class="entry-row mat-row" data-search="${name.toLowerCase()}">
      <div class="entry-left">
        <div class="item-name">${name}</div>
        <div class="item-meta">${data.count} entries · Avg rate: ₹${avgRate} · Sites: ${[...data.sites].join(", ")}</div>
      </div>
      <div class="entry-right"><div class="amount">₹${Number(data.amount).toLocaleString("en-IN")}</div><div class="date">Qty: ${data.qty}</div></div>
    </div>`;
  }
  html += '</div>';
  c.innerHTML = html;
}

function showDailyReport() {
  const entries = window._reportEntries || [];
  const c = document.getElementById("report-content");
  // Group by date
  const days = {};
  for (const e of entries) {
    const d = e.entry_date || "Unknown";
    if (!days[d]) days[d] = { amount: 0, count: 0 };
    days[d].amount += Number(e.amount);
    days[d].count++;
  }
  const sorted = Object.entries(days).sort((a, b) => b[0].localeCompare(a[0]));
  const maxAmt = Math.max(...sorted.map(x => x[1].amount), 1);

  let html = '<div class="card"><h3>📅 Daily Spending (last 30 days)</h3>';
  for (const [date, data] of sorted.slice(0, 30)) {
    const pct = (data.amount / maxAmt * 100).toFixed(0);
    html += `<div style="margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;font-size:.78em"><span>${date} (${data.count})</span><span style="font-weight:700">₹${Number(data.amount).toLocaleString("en-IN")}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }
  html += '</div>';
  c.innerHTML = html;
}

function showSiteComparison() {
  const entries = window._reportEntries || [];
  const sites = window._reportSites || [];
  const c = document.getElementById("report-content");
  // Group by site
  const siteData = {};
  for (const e of entries) {
    const sid = e.site_id || "Unknown";
    if (!siteData[sid]) siteData[sid] = { amount: 0, count: 0, engineers: new Set() };
    siteData[sid].amount += Number(e.amount);
    siteData[sid].count++;
    siteData[sid].engineers.add(e.entered_by);
  }
  const maxAmt = Math.max(...Object.values(siteData).map(x => x.amount), 1);

  let html = '<div class="card"><h3>📍 Site Comparison</h3>';
  const colors = ["#1a7fb5","#e67e22","#27ae60","#8e44ad","#e74c3c"];
  let ci = 0;
  for (const [sid, data] of Object.entries(siteData).sort((a,b) => b[1].amount - a[1].amount)) {
    const siteName = sites.find(s => s.site_id === sid)?.name || sid;
    const pct = (data.amount / maxAmt * 100).toFixed(0);
    html += `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:.82em"><span style="font-weight:600">${siteName}</span><span style="font-weight:700">₹${Number(data.amount).toLocaleString("en-IN")}</span></div>
      <div style="font-size:.68em;color:#888">${data.count} entries · ${data.engineers.size} engineers</div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${colors[ci++%colors.length]}"></div></div>
    </div>`;
  }
  html += '</div>';
  c.innerHTML = html;
}

function showPriceAnomalies() {
  const entries = window._reportEntries || [];
  const c = document.getElementById("report-content");
  // Find items with varying rates (potential fraud/price changes)
  const itemRates = {};
  for (const e of entries) {
    const name = e.item_description || "";
    if (!name || Number(e.rate) === 0) continue;
    if (!itemRates[name]) itemRates[name] = [];
    itemRates[name].push({ rate: Number(e.rate), date: e.entry_date, site: e.site_id, by: e.entered_by, vendor: e.party_name });
  }

  // Find items with >20% rate variation
  const anomalies = [];
  for (const [name, rates] of Object.entries(itemRates)) {
    if (rates.length < 2) continue;
    const values = rates.map(r => r.rate);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === 0) continue;
    const variation = ((max - min) / min * 100).toFixed(0);
    if (variation > 20) {
      anomalies.push({ name, min, max, variation, count: rates.length, details: rates });
    }
  }
  anomalies.sort((a, b) => b.variation - a.variation);

  let html = '<div class="card"><h3>⚠️ Price Anomalies</h3>';
  html += '<p style="font-size:.72em;color:#888;margin-bottom:10px">Items with >20% rate variation across entries (may indicate price changes or discrepancies)</p>';

  if (anomalies.length === 0) {
    html += '<p style="font-size:.82em;color:var(--success)">✅ No significant price anomalies found</p>';
  } else {
    for (const a of anomalies.slice(0, 20)) {
      html += `<div class="entry-row" style="flex-wrap:wrap">
        <div class="entry-left" style="flex-basis:100%">
          <div class="item-name">⚠️ ${a.name}</div>
          <div class="item-meta">Rate range: ₹${a.min} — ₹${a.max} (${a.variation}% variation) · ${a.count} entries</div>
        </div>
        <div style="font-size:.7em;color:#666;width:100%;margin-top:4px">`;
      for (const d of a.details.slice(-5)) {
        html += `<div>${d.date} · ₹${d.rate} · ${d.vendor} · ${d.site} · by ${d.by}</div>`;
      }
      html += `</div></div>`;
    }
  }
  html += '</div>';
  c.innerHTML = html;
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
