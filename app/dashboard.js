/* ═══════════════════════════════════════════════════════
   CARGARIA — Dashboard Screen
   ═══════════════════════════════════════════════════════ */

function dashboard() {
  document.getElementById('page-title').textContent = '';
  document.getElementById('topbar-actions').innerHTML = '';

  // Fetch market widgets async (non-blocking)
  _fetchMarketWidgets();

  const cs = S.contracts || [];
  const active = cs.filter(c => ['open','shipped','arrived'].includes(c.status));

  // KPI calculations
  const totalCapital   = active.reduce((s, c) => s + (+c.capital_employed || 0), 0);
  const totalPayable   = active.reduce((s, c) => s + (+c.purchase_balance_payable || 0), 0);
  const totalReceivable= active.reduce((s, c) => s + (+c.sales_balance_receivable || 0), 0);
  const unsoldStock    = active.filter(c => !c.customer_id || !c.sales_value)
    .reduce((s, c) => s + (+c.purchase_value || 0), 0);

  // Detention alerts
  const today = new Date(); today.setHours(0,0,0,0);
  const detentionAlerts = active.filter(c => {
    if (!c.arrival_date || !c.free_days) return false;
    const arrivalDate = new Date(c.arrival_date);
    arrivalDate.setHours(0,0,0,0);
    const freeUntil = new Date(arrivalDate);
    freeUntil.setDate(freeUntil.getDate() + parseInt(c.free_days || 0));
    if (c.containers_returned_date) return false;
    return today >= freeUntil;
  });

  setContent(`
    <!-- Welcome Bar -->
    <div class="welcome-bar">
      <div>
        <div class="welcome-greeting" id="welcome-greeting">Good morning</div>
        <div class="welcome-date" id="welcome-date"></div>
      </div>
    </div>

    <!-- Market Widgets -->
    <div class="market-widgets" id="market-widgets">
      <div class="market-widget" id="mw-usdinr">
        <div class="mw-label">USD / INR</div>
        <div class="mw-value" id="mw-usdinr-val"><span class="mw-loading">Loading…</span></div>
        <div class="mw-sub" id="mw-usdinr-sub">Live rate</div>
      </div>
      <div class="market-widget mw-link" onclick="window.open('https://www.balticexchange.com/en/data/indices/bdi.html','_blank')">
        <div class="mw-label">Baltic Dry Index</div>
        <div class="mw-value" id="mw-bdi-val"><span class="mw-loading">—</span></div>
        <div class="mw-sub">Click for live chart ↗</div>
      </div>
      <div class="market-widget mw-link" onclick="window.open('https://fbx.freightos.com/','_blank')">
        <div class="mw-label">Freightos FBX</div>
        <div class="mw-value" id="mw-fbx-val"><span class="mw-loading">—</span></div>
        <div class="mw-sub">Container index ↗</div>
      </div>
      <div class="market-widget mw-link" onclick="window.open('https://www.indexmundi.com/commodities/?commodity=sawnwood&months=60','_blank')">
        <div class="mw-label">Sawnwood Price</div>
        <div class="mw-value">Index</div>
        <div class="mw-sub">World Bank · Click ↗</div>
      </div>
    </div>

    <!-- Payment Alerts -->
    <div id="payment-alerts-banner"></div>

    <!-- Detention Alert -->
    ${detentionAlerts.length ? `
    <div class="alert alert-warning mb-16">
      <span style="font-size:18px">🚨</span>
      <div>
        <strong>${detentionAlerts.length} contract${detentionAlerts.length > 1 ? 's' : ''} in detention —</strong>
        containers not yet returned.
        ${detentionAlerts.map(c => `<a href="#" onclick="contractDetail('${c.id}');return false;" style="margin-left:8px;font-weight:600">${c.contract_number}</a>`).join('')}
      </div>
    </div>` : ''}

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi navy" style="cursor:pointer" onclick="showDashDetail('active')">
        <div class="kpi-label">Active Contracts</div>
        <div class="kpi-value">${active.length}</div>
        <div class="kpi-sub">Click to view</div>
      </div>
      <div class="kpi teal" style="cursor:pointer" onclick="showDashDetail('capital')">
        <div class="kpi-label">Capital Employed</div>
        <div class="kpi-value">${fmt.usd(totalCapital)}</div>
        <div class="kpi-sub">Active deals</div>
      </div>
      <div class="kpi amber" style="cursor:pointer" onclick="showDashDetail('payable')">
        <div class="kpi-label">Payable Balance</div>
        <div class="kpi-value">${fmt.usd(totalPayable)}</div>
        <div class="kpi-sub">To suppliers</div>
      </div>
      <div class="kpi green" style="cursor:pointer" onclick="showDashDetail('receivable')">
        <div class="kpi-label">Receivable Balance</div>
        <div class="kpi-value">${fmt.usd(totalReceivable)}</div>
        <div class="kpi-sub">From buyers</div>
      </div>
      <div class="kpi red" style="cursor:pointer" onclick="showDashDetail('unsold')">
        <div class="kpi-label">Unsold Stock</div>
        <div class="kpi-value">${fmt.usd(unsoldStock)}</div>
        <div class="kpi-sub">No buyer assigned</div>
      </div>
    </div>

    <!-- Expandable detail panel -->
    <div id="dash-detail-panel"></div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;align-items:start">

      <!-- Active Contracts Table -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="card-title" style="margin:0">Active Contracts</div>
          <button class="btn btn-sm btn-cta" onclick="nav('contracts')">View All</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Product</th>
                <th>Status</th>
                <th>ETA</th>
                <th class="num">Net Margin</th>
              </tr>
            </thead>
            <tbody>
              ${active.slice(0, 8).map(c => `
                <tr class="clickable" onclick="contractDetail('${c.id}')">
                  <td><strong>${c.contract_number || '—'}</strong><br><span class="text-muted">${c.supplier_name || '—'}</span></td>
                  <td>${c.product || '—'}</td>
                  <td><span class="badge badge-${c.status}">${c.status || '—'}</span></td>
                  <td>${fmt.date(c.arrival_date)}</td>
                  <td class="amt ${(+c.net_margin_pct||0) >= 0 ? 'text-green' : 'text-red'}">${fmt.pct(c.net_margin_pct)}</td>
                </tr>`).join('') || '<tr><td colspan="5" class="text-muted text-center" style="padding:24px">No active contracts</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Payments -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="card-title" style="margin:0">Recent Payments</div>
          <button class="btn btn-sm btn-cta" onclick="nav('payments')">View All</button>
        </div>
        ${(S.payments || []).slice(0, 6).map(p => {
          const c = S.contracts.find(x => x.id === p.contract_id);
          const isOut = p.direction === 'paid_to_supplier';
          return `
            <div onclick="contractDetail('${p.contract_id}')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:16px">${isOut ? '📤' : '📥'}</span>
                <div>
                  <div style="font-size:13px;font-weight:600">${c?.contract_number || '—'}</div>
                  <div class="text-muted" style="font-size:11px">${fmt.date(p.payment_date)}</div>
                </div>
              </div>
              <div style="font-size:13px;font-weight:700;color:${isOut ? 'var(--red)' : 'var(--green)'}">
                ${isOut ? '-' : '+'}${fmt.usd(p.amount)}
              </div>
            </div>`;
        }).join('') || '<p class="text-muted text-center" style="padding:16px">No payments yet</p>'}
      </div>

    </div>`);

  renderPaymentAlerts('payment-alerts-banner');
}

function showDashDetail(type) {
  const panel = document.getElementById('dash-detail-panel');
  if (!panel) return;

  // Toggle off if same
  if (panel.dataset.type === type && panel.innerHTML !== '') {
    panel.innerHTML = '';
    panel.dataset.type = '';
    return;
  }
  panel.dataset.type = type;

  const cs = S.contracts || [];
  const active = cs.filter(c => ['open','shipped','arrived'].includes(c.status));

  let html = '';

  if (type === 'active') {
    html = `<div class="card mb-16">
      <div class="card-title">Active Contracts Detail</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Product</th><th>Supplier</th><th>Buyer</th><th>Status</th><th>ETA</th><th class="num">Purchase</th><th class="num">Sales</th><th class="num">Net Margin</th></tr></thead>
        <tbody>${active.map(c => `<tr class="clickable" onclick="contractDetail('${c.id}')">
          <td><strong>${c.contract_number}</strong></td>
          <td>${c.product||'—'}</td>
          <td>${c.supplier_name||'—'}</td>
          <td>${c.customer_name||'<span class="text-muted">No buyer</span>'}</td>
          <td><span class="badge badge-${c.status}">${c.status}</span></td>
          <td>${fmt.date(c.arrival_date)}</td>
          <td class="amt">${fmt.usd(c.purchase_value)}</td>
          <td class="amt">${c.sales_value ? fmt.usd(c.sales_value) : '<span class="text-muted">—</span>'}</td>
          <td class="amt ${(+c.net_margin_pct||0)>=0?'text-green':'text-red'}">${fmt.pct(c.net_margin_pct)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  } else if (type === 'capital') {
    html = `<div class="card mb-16">
      <div class="card-title">Capital Employed by Contract</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Product</th><th>Status</th><th class="num">Purchase</th><th class="num">Advance Paid</th><th class="num">Capital Employed</th></tr></thead>
        <tbody>${active.sort((a,b) => (+b.capital_employed||0)-(+a.capital_employed||0)).map(c => `<tr class="clickable" onclick="contractDetail('${c.id}')">
          <td><strong>${c.contract_number}</strong></td>
          <td>${c.product||'—'}</td>
          <td><span class="badge badge-${c.status}">${c.status}</span></td>
          <td class="amt">${fmt.usd(c.purchase_value)}</td>
          <td class="amt">${fmt.usd(c.advance_paid)}</td>
          <td class="amt"><strong>${fmt.usd(c.capital_employed)}</strong></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  } else if (type === 'payable') {
    const withPayable = active.filter(c => (+c.purchase_balance_payable||0) > 0);
    html = `<div class="card mb-16">
      <div class="card-title">Payable Balances</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Supplier</th><th class="num">Purchase</th><th class="num">Advance Paid</th><th class="num">Balance Due</th><th>Due Date</th></tr></thead>
        <tbody>${withPayable.map(c => `<tr class="clickable" onclick="contractDetail('${c.id}')">
          <td><strong>${c.contract_number}</strong></td>
          <td>${c.supplier_name||'—'}</td>
          <td class="amt">${fmt.usd(c.purchase_value)}</td>
          <td class="amt">${fmt.usd(c.advance_paid)}</td>
          <td class="amt text-amber"><strong>${fmt.usd(c.purchase_balance_payable)}</strong></td>
          <td>${fmt.date(c.payable_due_date)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  } else if (type === 'receivable') {
    const withRec = active.filter(c => (+c.sales_balance_receivable||0) > 0);
    html = `<div class="card mb-16">
      <div class="card-title">Receivable Balances</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Buyer</th><th class="num">Sales Value</th><th class="num">Advance Received</th><th class="num">Balance Due</th><th>Due Date</th></tr></thead>
        <tbody>${withRec.map(c => `<tr class="clickable" onclick="contractDetail('${c.id}')">
          <td><strong>${c.contract_number}</strong></td>
          <td>${c.customer_name||'—'}</td>
          <td class="amt">${fmt.usd(c.sales_value)}</td>
          <td class="amt">${fmt.usd(c.advance_received||0)}</td>
          <td class="amt text-green"><strong>${fmt.usd(c.sales_balance_receivable)}</strong></td>
          <td>${fmt.date(c.receivable_due_date)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  } else if (type === 'unsold') {
    const unsold = active.filter(c => !c.customer_id || !c.sales_value);
    html = `<div class="card mb-16">
      <div class="card-title">Unsold Stock (No Buyer)</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Product</th><th>Supplier</th><th>Status</th><th>ETA</th><th class="num">Purchase Value</th></tr></thead>
        <tbody>${unsold.map(c => `<tr class="clickable" onclick="contractDetail('${c.id}')">
          <td><strong>${c.contract_number}</strong></td>
          <td>${c.product||'—'}</td>
          <td>${c.supplier_name||'—'}</td>
          <td><span class="badge badge-${c.status}">${c.status}</span></td>
          <td>${fmt.date(c.arrival_date)}</td>
          <td class="amt"><strong>${fmt.usd(c.purchase_value)}</strong></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  panel.innerHTML = html;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ── Dashboard: welcome bar + market widgets ── */
function _dashGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function _dashDate() {
  return new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

async function _fetchMarketWidgets() {
  // Set greeting + date
  const gr = document.getElementById('welcome-greeting');
  const dt = document.getElementById('welcome-date');
  const firstName = (S.userRecord?.name || S.user?.email || '').split(' ')[0].split('@')[0];
  if (gr) gr.textContent = _dashGreeting() + (firstName ? ', ' + firstName : '');
  if (dt) dt.textContent = _dashDate();

  // USD/INR — open.er-api.com (no key needed, CORS-open)
  const el  = document.getElementById('mw-usdinr-val');
  const sub = document.getElementById('mw-usdinr-sub');
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const rate = d?.rates?.INR;
    if (el && rate) {
      el.textContent = '₹ ' + rate.toFixed(2);
      if (sub) sub.textContent = 'Updated ' + (d.time_last_update_utc || '').slice(0,16);
    }
  } catch(e) {
    // Fallback: try exchangerate-api free tier
    try {
      const r2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const d2 = await r2.json();
      const rate2 = d2?.rates?.INR;
      if (el && rate2) {
        el.textContent = '₹ ' + rate2.toFixed(2);
        if (sub) sub.textContent = 'Live rate';
      }
    } catch(e2) {
      if (el) el.innerHTML = '<span style="font-size:13px;color:var(--text2)">See XE.com</span>';
      if (sub) sub.innerHTML = '<a href="https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=INR" target="_blank" style="color:var(--teal-mid)">Open XE ↗</a>';
    }
  }
}
