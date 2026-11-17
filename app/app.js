/* ═══════════════════════════════════════════════════════
   CARGARIA — Core App: State, Supabase, Formatters, Nav
   ═══════════════════════════════════════════════════════ */

const SUPA_URL = 'https://qosurbvbptavnhqpbawp.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvc3VyYnZicHRhdm5ocXBiYXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDQwODYsImV4cCI6MjEwNTkyMDA4Nn0.VSpTiI27Vg4Udm7H2w1fQBxdp2m8OkMOxD6D7EALITg';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

/* ── Global State ── */
const S = {
  user: null,
  userRecord: null,
  companyId: null,
  role: null,
  company: null,
  contracts: [],
  suppliers: [],
  customers: [],
  payments: [],
  ports: [],
  portGroups: [],
  countries: [],
};

/* ── Formatters ── */
const fmt = {
  usd(n) {
    if (n === null || n === undefined || n === '') return '—';
    const v = parseFloat(n);
    if (isNaN(v)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  },
  num(n, dec = 2) {
    if (n === null || n === undefined || n === '') return '—';
    const v = parseFloat(n);
    if (isNaN(v)) return '—';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(v);
  },
  date(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  pct(n) {
    if (n === null || n === undefined || n === '') return '—';
    const v = parseFloat(n);
    if (isNaN(v)) return '—';
    return (v * 100).toFixed(1) + '%';
  },
  reldate(d) {
    if (!d) return '—';
    const diff = Math.round((new Date(d) - new Date()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < 0) return Math.abs(diff) + 'd ago';
    return 'in ' + diff + 'd';
  },
  freeDays(arrivalDate, freeDays) {
    // Returns days used / free days remaining for detention calculation
    if (!arrivalDate) return { used: 0, free: freeDays || 14, remaining: freeDays || 14, overdue: false };
    const fd = parseInt(freeDays) || 14;
    const arrivalMs = new Date(arrivalDate).getTime();
    const nowMs = Date.now();
    const daysElapsed = Math.max(0, Math.round((nowMs - arrivalMs) / 86400000));
    const used = Math.min(daysElapsed, fd);
    const remaining = Math.max(0, fd - daysElapsed);
    return { used, free: fd, remaining, overdue: daysElapsed > fd, daysOverdue: Math.max(0, daysElapsed - fd) };
  },
};

/* ── Permission Helper ── */
function canWrite(section) {
  const r = S.role || 'admin';
  if (r === 'admin') return true;
  if (r === 'logistics') return ['contracts', 'suppliers'].includes(section);
  if (r === 'finance') return ['payments'].includes(section);
  if (r === 'sales') return ['contracts', 'customers'].includes(section);
  return false;
}

/* ── Content Helper ── */
function setContent(html) {
  document.getElementById('main-content').innerHTML = html;
}

/* ── Sidebar Toggle ── */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('open');
}

function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

/* ── Modal Helpers ── */
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = html;
  root.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  root.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Print Header ── */
function getPrintHeader(title) {
  const co = S.company;
  const logoHtml = co?.logo_url
    ? `<img src="${co.logo_url}" style="height:40px;object-fit:contain">`
    : `<div style="width:40px;height:40px;border-radius:8px;background:var(--teal-dark);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(co?.name||'C').substring(0,1)}</div>`;
  return `
    <div class="print-header" style="align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2px solid #000;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        ${logoHtml}
        <div>
          <div style="font-size:16px;font-weight:700">${co?.name||'Cargaria'}</div>
          <div style="font-size:11px;color:#555">${co?.address||''}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:700">${title}</div>
        <div style="font-size:11px;color:#555">Printed: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
      </div>
    </div>`;
}

/* ── Load All Reference Data ── */
async function loadAllData() {
  const [
    { data: contracts },
    { data: suppliers },
    { data: customers },
    { data: payments },
    { data: ports },
    { data: portGroups },
    { data: countries },
  ] = await Promise.all([
    sb.from('contract_summary').select('*').eq('company_id', S.companyId).order('created_at', { ascending: false }),
    sb.from('suppliers').select('*, countries(name)').eq('company_id', S.companyId).eq('is_active', true).order('name'),
    sb.from('customers').select('*, countries(name)').eq('company_id', S.companyId).eq('is_active', true).order('name'),
    sb.from('payments').select('*').eq('company_id', S.companyId).order('payment_date', { ascending: false }),
    sb.from('ports').select('*, port_groups(name)').eq('is_active', true).order('display_name'),
    sb.from('port_groups').select('*').order('name'),
    sb.from('countries').select('*').order('name'),
  ]);

  S.contracts  = contracts  || [];
  S.suppliers  = suppliers  || [];
  S.customers  = customers  || [];
  S.payments   = payments   || [];
  S.ports      = ports      || [];
  S.portGroups = portGroups || [];
  S.countries  = countries  || [];
}

async function refreshContracts() {
  cconst { data } = await sb.from('contract_summary')
    .select('*')
    .eq('company_id', S.companyId)
    .order('created_at', { ascending: false });
  S.contracts = data || [];
  // Re-render dashboard alerts if dashboard is currently active
  if (S.currentPage === 'dashboard') {
    dashboard();
  }
}

/* ── Navigation ── */
const NAV_ITEMS = [
  { key: 'dashboard',  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`, label: 'Dashboard' },
  { key: 'contracts',  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`, label: 'Contracts' },
  { key: 'payments',   icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`, label: 'Payments' },
  { key: 'reports',    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, label: 'Reports & P&L' },
  { key: 'suppliers',  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`, label: 'Suppliers' },
  { key: 'customers',  icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, label: 'Customers' },
  { key: 'ledger',     icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`, label: 'Ledgers' },
  { key: 'settings',   icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`, label: 'Settings' },
];

function buildSidebar() {
  const co = S.company;

  // Build nav items into existing #sidebar-nav element
  const navEl = document.getElementById('sidebar-nav');
  if (navEl) {
    navEl.innerHTML = NAV_ITEMS.map(item => `
      <div class="nav-item" id="nav-${item.key}" onclick="nav('${item.key}');closeSidebar()">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
      </div>
    `).join('') + `
      <div class="nav-item" onclick="nav('settings');closeSidebar()" style="margin-top:auto;border-top:1px solid var(--border);padding-top:8px">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>
        <span>${(co?.plan||'free') === 'free' ? 'Upgrade' : 'Pro Plan'}</span>
      </div>
      <div class="nav-item" onclick="doLogout()" style="margin-top:4px">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
        <span>Log Out</span>
      </div>`;
  }

  // Populate user/company info in sidebar footer
  const userEl = document.getElementById('sidebar-user');
  if (userEl) {
    const logoHtml = co?.logo_url
      ? `<img src="${co.logo_url}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0">`
      : `<div style="width:32px;height:32px;border-radius:6px;background:var(--teal-mid);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0">${(co?.name||'C').substring(0,1).toUpperCase()}</div>`;
    userEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px">
        ${logoHtml}
        <div style="overflow:hidden">
          <div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${co?.name || 'Cargaria'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:capitalize">${S.role || 'admin'}</div>
        </div>
      </div>`;
  }
}

function nav(section) {
  S.currentPage = section;
  // Update active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById('nav-' + section);
  if (activeEl) activeEl.classList.add('active');

  // Update page title
  const item = NAV_ITEMS.find(n => n.key === section);
  document.getElementById('page-title').textContent = item?.label || section;
  document.getElementById('topbar-actions').innerHTML = '';

  // Route to screen
  switch (section) {
    case 'dashboard':  dashboard();         break;
    case 'contracts':  contracts();         break;
    case 'payments':   payments();          break;
    case 'reports':    reports();           break;
    case 'suppliers':  suppliersScreen();   break;
    case 'customers':  customersScreen();   break;
    case 'ledger':     ledger();            break;
    case 'settings':   settings();          break;
    case 'upgrade':    settings('upgrade'); break;
    default:           dashboard();
  }
}

/* ── Session Management ── */
async function initSession() {
  // Load user record
  const { data: userRecord } = await sb.from('users')
    .select('*, companies(*)').eq('id', S.user.id).single();

  if (!userRecord?.company_id) {
    // New user — show onboarding
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('onboarding-screen').style.display = 'flex';
    return;
  }

  S.userRecord = userRecord;
  S.companyId  = userRecord.company_id;
  S.role       = userRecord.role || 'admin';
  S.company    = userRecord.companies || {};

  await loadAndShowApp();
}

async function loadAndShowApp() {
  await loadAllData();
  const { data: co } = await sb.from('companies').select('*').eq('id', S.companyId).single();
  S.company = co || {};

  buildSidebar();
  document.getElementById('auth-screen').style.display      = 'none';
  document.getElementById('onboarding-screen').style.display = 'none';
  document.getElementById('app-shell').style.display         = 'flex';

  nav('dashboard');
}

async function doLogout() {
  await sb.auth.signOut();
  location.reload();
}

/* ── Payment Alerts ── */
function getPaymentAlerts() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const alerts = [];
  for (const c of (S.contracts || [])) {
    if (c.payable_due_date) {
      const d = new Date(c.payable_due_date); d.setHours(0, 0, 0, 0);
      const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
      if (diff < 8) alerts.push({
        type: 'payable', urgency: diff < 0 ? 'overdue' : 'soon',
        contract: c, diff,
        label: (diff < 0 ? 'Overdue: Pay ' : `Due in ${diff}d: Pay `) + (c.supplier_name || 'Supplier') + ' — ' + (c.contract_number || ''),
        amount: c.purchase_value, date: c.payable_due_date,
      });
    }
    if (c.receivable_due_date) {
      const d = new Date(c.receivable_due_date); d.setHours(0, 0, 0, 0);
      const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
      if (diff < 8) alerts.push({
        type: 'receivable', urgency: diff < 0 ? 'overdue' : 'soon',
        contract: c, diff,
        label: (diff < 0 ? 'Overdue: Collect from ' : `Due in ${diff}d: Collect from `) + (c.customer_name || 'Buyer') + ' — ' + (c.contract_number || ''),
        amount: c.sales_value, date: c.receivable_due_date,
      });
    }
  }
  return alerts.sort((a, b) => a.diff - b.diff);
}

/* ── App Initialisation ── */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    S.user = session.user;
    await initSession();
  }
  // Auth screen is shown by default via HTML
})();

function renderPaymentAlerts(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const alerts = getPaymentAlerts();
  if (!alerts.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const overdue  = alerts.filter(a => a.urgency === 'overdue');
  const upcoming = alerts.filter(a => a.urgency !== 'overdue');
  const totalAmt = alerts.reduce((s, a) => s + a.amount, 0);
  const bannerId = containerId + '-banner';
  const listId   = containerId + '-list';
  const parts = [];
  if (overdue.length)  parts.push(`<span style="color:var(--red)">${overdue.length} overdue</span>`);
  if (upcoming.length) parts.push(`<span style="color:#92400E">${upcoming.length} upcoming</span>`);
  const summary = parts.join(' &nbsp;·&nbsp; ') + ` &nbsp;—&nbsp; <strong>${fmt.usd(totalAmt)}</strong>`;
  el.innerHTML = `<div id="${bannerId}" style="margin-bottom:12px"><div onclick="togglePaymentAlerts('${listId}','${bannerId}')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:8px;background:#FEF2F2;border:1px solid #FECACA;user-select:none"><div style="display:flex;align-items:center;gap:8px;font-size:13px"><span>⚠️</span><span style="font-weight:600;color:var(--red)">Payment Alerts</span><span style="color:var(--text2)">${summary}</span></div><span id="${bannerId}-chevron" style="font-size:11px;color:var(--text2)">▾</span></div><div id="${listId}" style="display:none;flex-direction:column;gap:5px;margin-top:6px">${alerts.map(a => `<div onclick="contractDetail('${a.contract.id}')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-radius:7px;background:${a.urgency==='overdue'?'#FEF2F2':'#FFFBEB'};border:1px solid ${a.urgency==='overdue'?'#FECACA':'#FCD34D'}"><div style="display:flex;align-items:center;gap:10px"><span>${a.type==='receivable'?'📥':'📤'}</span><div><div style="font-size:13px;font-weight:600;color:${a.urgency==='overdue'?'var(--red)':'#92400E'}">${a.label}</div><div style="font-size:11px;color:var(--text2)">Due: ${a.date} · ${a.type==='receivable'?'Receivable':'Payable'}</div></div></div><div style="font-size:13px;font-weight:700;color:${a.urgency==='overdue'?'var(--red)':'#92400E'}">${fmt.usd(a.amount)}</div></div>`).join('')}</div></div>`;
  document.getElementById(listId).style.display = 'none';
}

function togglePaymentAlerts(listId, bannerId) {
  const list = document.getElementById(listId);
  const chevron = document.getElementById(bannerId + '-chevron');
  if (!list) return;
  const isOpen = list.style.display !== 'none';
  list.style.display = isOpen ? 'none' : 'flex';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}
