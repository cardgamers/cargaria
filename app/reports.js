/* ═══════════════════════════════════════════════════════
   CARGARIA — Reports: P&L, Capital, A/P & A/R
   ═══════════════════════════════════════════════════════ */

/* ── Reports Router ── */
function reports(tab) {
  tab = tab || 'pl';
  document.getElementById('page-title').textContent = 'Reports';
  document.getElementById('topbar-actions').innerHTML = '';

  const tabs = [
    { id: 'pl',      label: 'P&L' },
    { id: 'capital', label: 'Capital Tracker' },
    { id: 'ap',      label: 'Accounts Payable' },
    { id: 'ar',      label: 'Accounts Receivable' },
  ];

  setContent(`
    <div class="tab-bar" style="margin-bottom:20px">
      ${tabs.map(t => `
        <button class="tab-btn ${tab === t.id ? 'active' : ''}" onclick="reports('${t.id}')">${t.label}</button>
      `).join('')}
    </div>
    <div id="report-body"></div>`);

  if (tab === 'pl')      reportPL();
  else if (tab === 'capital') reportCapital();
  else if (tab === 'ap') reportAP();
  else if (tab === 'ar') reportAR();
}

/* ── P&L Report ── */
function reportPL() {
  const cs = S.contracts || [];
  const closed   = cs.filter(c => c.status === 'closed');
  const all      = cs.filter(c => c.status !== 'cancelled');
  const open     = cs.filter(c => ['open','shipped','arrived'].includes(c.status));

  // Totals
  const totalPurchase = all.reduce((s,c) => s + (+c.purchase_value||0), 0);
  const totalSales    = all.reduce((s,c) => s + (+c.sales_value||0), 0);
  const totalFreight  = all.reduce((s,c) => s + (+c.freight||0), 0);
  const totalInsurance= all.reduce((s,c) => s + (+c.insurance||0), 0);
  const totalDocs     = all.reduce((s,c) => s + (+c.documentation_charges||0), 0);
  const totalPayCh    = all.reduce((s,c) => s + (+c.payment_charges||0), 0);
  const totalComm     = all.reduce((s,c) => s + (+c.commission_value||0), 0);
  const totalDemurr   = all.reduce((s,c) => s + (+c.demurrage||0), 0);
  const totalOther    = all.reduce((s,c) => s + (+c.other_costs||0), 0);
  const totalCosts    = totalPurchase + totalFreight + totalInsurance + totalDocs + totalPayCh + totalComm + totalDemurr + totalOther;
  const totalGrossMargin = totalSales - totalPurchase;
  const totalNetMargin   = totalSales - totalCosts;

  const el = document.getElementById('report-body');
  el.innerHTML = `
    <!-- Summary Cards -->
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="kpi navy">
        <div class="kpi-label">Total Purchase</div>
        <div class="kpi-value">${fmt.usd(totalPurchase)}</div>
        <div class="kpi-sub">${all.length} contracts</div>
      </div>
      <div class="kpi teal">
        <div class="kpi-label">Total Sales</div>
        <div class="kpi-value">${totalSales ? fmt.usd(totalSales) : '<span style="font-size:14px;opacity:.7">Partial</span>'}</div>
        <div class="kpi-sub">${all.filter(c=>c.sales_value).length} contracts sold</div>
      </div>
      <div class="kpi ${totalGrossMargin >= 0 ? 'green' : 'red'}">
        <div class="kpi-label">Gross Margin</div>
        <div class="kpi-value">${fmt.usd(totalGrossMargin)}</div>
        <div class="kpi-sub">${totalSales ? (totalGrossMargin/totalSales*100).toFixed(1) + '%' : '—'}</div>
      </div>
      <div class="kpi ${totalNetMargin >= 0 ? 'green' : 'red'}">
        <div class="kpi-label">Net Margin</div>
        <div class="kpi-value">${fmt.usd(totalNetMargin)}</div>
        <div class="kpi-sub">${totalSales ? (totalNetMargin/totalSales*100).toFixed(1) + '%' : '—'}</div>
      </div>
    </div>

    <!-- Waterfall / Cost Breakdown -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">

      <div class="card" style="padding:16px">
        <div class="card-title">Cost Waterfall (All Contracts)</div>
        ${[
          ['Sales Revenue', totalSales, 'var(--green)'],
          ['Purchase Cost', totalPurchase, 'var(--red)'],
          ['Gross Margin', totalGrossMargin, totalGrossMargin >= 0 ? 'var(--teal-dark)' : 'var(--red)'],
          ['Freight', totalFreight, 'var(--text2)'],
          ['Insurance', totalInsurance, 'var(--text2)'],
          ['Documentation', totalDocs, 'var(--text2)'],
          ['Payment Charges', totalPayCh, 'var(--text2)'],
          ['Commission', totalComm, 'var(--text2)'],
          ['Demurrage', totalDemurr, 'var(--text2)'],
          ['Other Costs', totalOther, 'var(--text2)'],
        ].filter(([,v]) => +v !== 0).map(([l,v,clr]) => {
          const pct = totalSales > 0 ? Math.abs(v / totalSales * 100) : 0;
          return `<div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="color:var(--text2)">${l}</span>
              <span style="font-weight:600;color:${clr}">${fmt.usd(v)}</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px">
              <div style="height:6px;width:${Math.min(100,pct).toFixed(1)}%;background:${clr};border-radius:3px"></div>
            </div>
          </div>`;
        }).join('')}
        <div style="border-top:2px solid var(--navy);padding-top:10px;margin-top:10px;display:flex;justify-content:space-between;font-size:14px;font-weight:700">
          <span>Net Margin</span>
          <span style="color:${totalNetMargin>=0?'var(--green)':'var(--red)'}">${fmt.usd(totalNetMargin)}</span>
        </div>
      </div>

      <div class="card" style="padding:16px">
        <div class="card-title">By Supplier</div>
        ${(() => {
          const bySupplier = {};
          all.forEach(c => {
            const k = c.supplier_name || 'Unknown';
            if (!bySupplier[k]) bySupplier[k] = { purchase: 0, sales: 0, count: 0 };
            bySupplier[k].purchase += +c.purchase_value || 0;
            bySupplier[k].sales    += +c.sales_value    || 0;
            bySupplier[k].count++;
          });
          return Object.entries(bySupplier).sort((a,b) => b[1].purchase - a[1].purchase).slice(0, 8).map(([k,v]) => {
            const margin = v.sales - v.purchase;
            return `<div class="detail-row">
              <span class="detail-label">${k} <span class="text-muted">(${v.count})</span></span>
              <span class="detail-val" style="color:${margin>=0?'var(--green)':'var(--red)'}">${fmt.usd(margin)}</span>
            </div>`;
          }).join('');
        })()}
      </div>
    </div>

    <!-- Contract P&L Table -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">Contract-wise P&L</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Product</th>
              <th>Supplier</th>
              <th>Buyer</th>
              <th>Status</th>
              <th class="num">Purchase</th>
              <th class="num">Total Costs</th>
              <th class="num">Sales</th>
              <th class="num">Net Margin</th>
              <th class="num">Margin %</th>
            </tr>
          </thead>
          <tbody>
            ${all.map(c => {
              const costs = (+c.purchase_value||0)+(+c.freight||0)+(+c.insurance||0)+(+c.documentation_charges||0)+(+c.payment_charges||0)+(+c.commission_value||0)+(+c.demurrage||0)+(+c.other_costs||0);
              const margin = (+c.sales_value||0) - costs;
              const marginPct = costs > 0 ? margin / costs * 100 : 0;
              return `<tr class="clickable" onclick="contractDetail('${c.id}')">
                <td><strong>${c.contract_number||'—'}</strong></td>
                <td>${c.product||'—'}</td>
                <td>${c.supplier_name||'—'}</td>
                <td>${c.customer_name||'<span class="text-muted">—</span>'}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
                <td class="amt">${fmt.usd(c.purchase_value)}</td>
                <td class="amt">${fmt.usd(costs)}</td>
                <td class="amt">${c.sales_value ? fmt.usd(c.sales_value) : '<span class="text-muted">—</span>'}</td>
                <td class="amt ${margin>=0?'text-green':'text-red'}">${c.sales_value ? fmt.usd(margin) : '—'}</td>
                <td class="amt ${margin>=0?'text-green':'text-red'}">${c.sales_value ? marginPct.toFixed(1)+'%' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ── Capital Tracker ── */
function reportCapital() {
  const cs = S.contracts || [];
  const active = cs.filter(c => ['open','shipped','arrived'].includes(c.status));
  const payments = S.payments || [];

  const totalCapital = active.reduce((s,c) => s + (+c.capital_employed||0), 0);
  const totalPayable = active.reduce((s,c) => s + (+c.purchase_balance_payable||0), 0);
  const totalReceivable = active.reduce((s,c) => s + (+c.sales_balance_receivable||0), 0);

  const el = document.getElementById('report-body');
  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="kpi navy">
        <div class="kpi-label">Total Capital Deployed</div>
        <div class="kpi-value">${fmt.usd(totalCapital)}</div>
        <div class="kpi-sub">Across ${active.length} active contracts</div>
      </div>
      <div class="kpi amber">
        <div class="kpi-label">Outstanding Payables</div>
        <div class="kpi-value">${fmt.usd(totalPayable)}</div>
        <div class="kpi-sub">Still to pay suppliers</div>
      </div>
      <div class="kpi green">
        <div class="kpi-label">Outstanding Receivables</div>
        <div class="kpi-value">${fmt.usd(totalReceivable)}</div>
        <div class="kpi-sub">Still to collect from buyers</div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">Capital by Contract</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Supplier</th>
              <th>Status</th>
              <th class="num">Purchase</th>
              <th class="num">Advance Paid</th>
              <th class="num">Capital Employed</th>
              <th class="num">Balance Payable</th>
              <th>Payable Due</th>
              <th class="num">Expected Return</th>
            </tr>
          </thead>
          <tbody>
            ${active.sort((a,b) => (+b.capital_employed||0) - (+a.capital_employed||0)).map(c => `
              <tr class="clickable" onclick="contractDetail('${c.id}')">
                <td><strong>${c.contract_number||'—'}</strong><br><span class="text-muted" style="font-size:11px">${c.product||''}</span></td>
                <td>${c.supplier_name||'—'}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
                <td class="amt">${fmt.usd(c.purchase_value)}</td>
                <td class="amt">${fmt.usd(c.advance_paid)}</td>
                <td class="amt"><strong>${fmt.usd(c.capital_employed)}</strong></td>
                <td class="amt text-amber">${fmt.usd(c.purchase_balance_payable)}</td>
                <td>${c.payable_due_date ? fmt.date(c.payable_due_date) : '—'}</td>
                <td class="amt text-green">${c.sales_value ? fmt.usd(c.sales_balance_receivable||c.sales_value) : '<span class="text-muted">—</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ── Accounts Payable ── */
function reportAP() {
  const cs = S.contracts || [];
  const withBalance = cs.filter(c => (+c.purchase_balance_payable||0) > 0 && c.status !== 'cancelled');

  const today = new Date(); today.setHours(0,0,0,0);

  // Ageing buckets
  const buckets = { current: [], days30: [], days60: [], days90plus: [] };
  withBalance.forEach(c => {
    if (!c.payable_due_date) { buckets.current.push(c); return; }
    const due = new Date(c.payable_due_date); due.setHours(0,0,0,0);
    const diff = Math.round((today - due) / 86400000);
    if (diff <= 0)       buckets.current.push(c);
    else if (diff <= 30) buckets.days30.push(c);
    else if (diff <= 60) buckets.days60.push(c);
    else                 buckets.days90plus.push(c);
  });

  const totals = Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, v.reduce((s,c) => s + (+c.purchase_balance_payable||0), 0)]));
  const grand = Object.values(totals).reduce((s,v) => s + v, 0);

  const el = document.getElementById('report-body');
  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="kpi green"><div class="kpi-label">Current</div><div class="kpi-value">${fmt.usd(totals.current)}</div><div class="kpi-sub">${buckets.current.length} contracts</div></div>
      <div class="kpi amber"><div class="kpi-label">1–30 days overdue</div><div class="kpi-value">${fmt.usd(totals.days30)}</div><div class="kpi-sub">${buckets.days30.length} contracts</div></div>
      <div class="kpi red"><div class="kpi-label">31–60 days overdue</div><div class="kpi-value">${fmt.usd(totals.days60)}</div><div class="kpi-sub">${buckets.days60.length} contracts</div></div>
      <div class="kpi" style="background:var(--red);color:#fff"><div class="kpi-label">60+ days overdue</div><div class="kpi-value">${fmt.usd(totals.days90plus)}</div><div class="kpi-sub">${buckets.days90plus.length} contracts</div></div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">Outstanding Payables — ${fmt.usd(grand)}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Contract</th><th>Supplier</th><th>Status</th><th class="num">Purchase</th><th class="num">Advance Paid</th><th class="num">Balance Due</th><th>Due Date</th><th>Overdue</th></tr>
          </thead>
          <tbody>
            ${withBalance.sort((a,b) => {
              const da = a.payable_due_date ? new Date(a.payable_due_date) : new Date(0);
              const db = b.payable_due_date ? new Date(b.payable_due_date) : new Date(0);
              return da - db;
            }).map(c => {
              const due = c.payable_due_date ? new Date(c.payable_due_date) : null;
              const diff = due ? Math.round((today - due) / 86400000) : null;
              const overdueBadge = diff === null ? '' : diff <= 0
                ? `<span class="badge badge-shipped">Due in ${Math.abs(diff)}d</span>`
                : diff <= 30 ? `<span class="badge badge-no-buyer">${diff}d overdue</span>`
                : `<span class="badge badge-red">${diff}d overdue</span>`;
              return `<tr class="clickable" onclick="contractDetail('${c.id}')">
                <td><strong>${c.contract_number||'—'}</strong></td>
                <td>${c.supplier_name||'—'}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
                <td class="amt">${fmt.usd(c.purchase_value)}</td>
                <td class="amt">${fmt.usd(c.advance_paid)}</td>
                <td class="amt text-amber"><strong>${fmt.usd(c.purchase_balance_payable)}</strong></td>
                <td>${c.payable_due_date ? fmt.date(c.payable_due_date) : '—'}</td>
                <td>${overdueBadge}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ── Accounts Receivable ── */
function reportAR() {
  const cs = S.contracts || [];
  const withBalance = cs.filter(c => (+c.sales_balance_receivable||0) > 0 && c.status !== 'cancelled');

  const today = new Date(); today.setHours(0,0,0,0);

  const buckets = { current: [], days30: [], days60: [], days90plus: [] };
  withBalance.forEach(c => {
    if (!c.receivable_due_date) { buckets.current.push(c); return; }
    const due = new Date(c.receivable_due_date); due.setHours(0,0,0,0);
    const diff = Math.round((today - due) / 86400000);
    if (diff <= 0)       buckets.current.push(c);
    else if (diff <= 30) buckets.days30.push(c);
    else if (diff <= 60) buckets.days60.push(c);
    else                 buckets.days90plus.push(c);
  });

  const totals = Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, v.reduce((s,c) => s + (+c.sales_balance_receivable||0), 0)]));
  const grand = Object.values(totals).reduce((s,v) => s + v, 0);

  const el = document.getElementById('report-body');
  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="kpi green"><div class="kpi-label">Current</div><div class="kpi-value">${fmt.usd(totals.current)}</div><div class="kpi-sub">${buckets.current.length} contracts</div></div>
      <div class="kpi amber"><div class="kpi-label">1–30 days overdue</div><div class="kpi-value">${fmt.usd(totals.days30)}</div><div class="kpi-sub">${buckets.days30.length} contracts</div></div>
      <div class="kpi red"><div class="kpi-label">31–60 days overdue</div><div class="kpi-value">${fmt.usd(totals.days60)}</div><div class="kpi-sub">${buckets.days60.length} contracts</div></div>
      <div class="kpi" style="background:var(--red);color:#fff"><div class="kpi-label">60+ days overdue</div><div class="kpi-value">${fmt.usd(totals.days90plus)}</div><div class="kpi-sub">${buckets.days90plus.length} contracts</div></div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">Outstanding Receivables — ${fmt.usd(grand)}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Contract</th><th>Buyer</th><th>Status</th><th class="num">Sales Value</th><th class="num">Advance Received</th><th class="num">Balance Due</th><th>Due Date</th><th>Overdue</th></tr>
          </thead>
          <tbody>
            ${withBalance.sort((a,b) => {
              const da = a.receivable_due_date ? new Date(a.receivable_due_date) : new Date(0);
              const db = b.receivable_due_date ? new Date(b.receivable_due_date) : new Date(0);
              return da - db;
            }).map(c => {
              const due = c.receivable_due_date ? new Date(c.receivable_due_date) : null;
              const diff = due ? Math.round((today - due) / 86400000) : null;
              const overdueBadge = diff === null ? '' : diff <= 0
                ? `<span class="badge badge-shipped">Due in ${Math.abs(diff)}d</span>`
                : diff <= 30 ? `<span class="badge badge-no-buyer">${diff}d overdue</span>`
                : `<span class="badge badge-red">${diff}d overdue</span>`;
              return `<tr class="clickable" onclick="contractDetail('${c.id}')">
                <td><strong>${c.contract_number||'—'}</strong></td>
                <td>${c.customer_name||'—'}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
                <td class="amt">${fmt.usd(c.sales_value)}</td>
                <td class="amt">${fmt.usd(c.advance_received||0)}</td>
                <td class="amt text-green"><strong>${fmt.usd(c.sales_balance_receivable)}</strong></td>
                <td>${c.receivable_due_date ? fmt.date(c.receivable_due_date) : '—'}</td>
                <td>${overdueBadge}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}
