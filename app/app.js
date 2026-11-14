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
    return v.toFixed(1) + '%';
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
    <div class="print-header" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2px solid #000;margin-bottom:16px">
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
    sb.from('contract_summary').select('*').order('created_at', { ascending: false }),
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
  const { data } = await sb.from('contract_summary')
    .select('*')
    .order('created_at', { ascending: false });
  S.contracts = data || [];
}

/* ── Navigation ── */
const NAV_ITEMS = [
  { key: 'dashboard',  icon: '📊', label: 'Dashboard' },
  { key: 'contracts',  icon: '📋', label: 'Contracts' },
  { key: 'payments',   icon: '💳', label: 'Payments' },
  { key: 'reports',    icon: '📈', label: 'Reports & P&L' },
  { key: 'suppliers',  icon: '🏭', label: 'Suppliers' },
  { key: 'customers',  icon: '🤝', label: 'Customers' },
  { key: 'ledger',     icon: '📒', label: 'Ledgers' },
  { key: 'settings',   icon: '⚙️',  label: 'Settings' },
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
        <span class="nav-icon">⭐</span>
        <span>${(co?.plan||'free') === 'free' ? 'Upgrade' : 'Pro Plan'}</span>
      </div>
      <div class="nav-item" onclick="doLogout()" style="margin-top:4px">
        <span class="nav-icon">🚪</span>
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
          <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${co?.name || 'Cargaria'}</div>
          <div style="font-size:11px;color:var(--text3);text-transform:capitalize">${S.role || 'admin'}</div>
        </div>
      </div>`;
  }
}

function nav(section) {
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

function renderPaymentAlerts(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const alerts = getPaymentAlerts();
  if (!alerts.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--red);margin-bottom:10px">⚠️ Payment Alerts (${alerts.length})</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${alerts.map(a => `
          <div onclick="contractDetail('${a.contract.id}')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:8px;background:${a.urgency === 'overdue' ? '#FEF2F2' : '#FFFBEB'};border:1px solid ${a.urgency === 'overdue' ? '#FECACA' : '#FCD34D'}">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:16px">${a.type === 'receivable' ? '📥' : '📤'}</span>
              <div>
                <div style="font-size:13px;font-weight:600;color:${a.urgency === 'overdue' ? 'var(--red)' : '#92400E'}">${a.label}</div>
                <div style="font-size:11px;color:var(--text2)">Due: ${a.date} &nbsp;·&nbsp; ${a.type === 'receivable' ? 'Receivable' : 'Payable'}</div>
              </div>
            </div>
            <div style="font-size:14px;font-weight:700;color:${a.urgency === 'overdue' ? 'var(--red)' : '#92400E'}">${fmt.usd(a.amount)}</div>
          </div>`).join('')}
      </div>
    </div>`;
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
