/* ═══════════════════════════════════════════════════════
   CARGARIA — Ledger: Party Ledger with Ageing
   ═══════════════════════════════════════════════════════ */

function ledger() {
  document.getElementById('page-title').textContent = 'Ledger';
  document.getElementById('topbar-actions').innerHTML = '';

  const suppliers  = S.suppliers  || [];
  const customers  = S.customers  || [];

  setContent(`
    <div class="card" style="max-width:520px;margin:0 auto;padding:24px">
      <div class="card-title">Select Party</div>
      <p class="text-muted text-sm" style="margin-bottom:20px">View a detailed account ledger for any supplier or customer — all contracts, payments, and outstanding balance.</p>
      <div class="form-group" style="margin-bottom:16px">
        <label>Party Type</label>
        <select id="ledger-type" onchange="ledgerUpdateParties()">
          <option value="supplier">Supplier</option>
          <option value="customer">Customer</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:20px">
        <label>Party Name</label>
        <select id="ledger-party">
          ${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-cta" style="width:100%" onclick="openLedger()">View Ledger →</button>
    </div>`);
}

function ledgerUpdateParties() {
  const type = document.getElementById('ledger-type').value;
  const list = type === 'supplier' ? S.suppliers : S.customers;
  const sel  = document.getElementById('ledger-party');
  if (sel) sel.innerHTML = list.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function openLedger() {
  const type    = document.getElementById('ledger-type').value;
  const partyId = document.getElementById('ledger-party').value;
  const list    = type === 'supplier' ? S.suppliers : S.customers;
  const party   = list.find(p => p.id === partyId);
  if (!party) return;

  const isSupplier = type === 'supplier';

  // Contracts for this party
  const partyContracts = S.contracts.filter(c =>
    isSupplier ? c.supplier_id === partyId : c.customer_id === partyId
  );

  // Payments for this party's contracts
  const payments = S.payments.filter(p =>
    partyContracts.some(c => c.id === p.contract_id) &&
    (isSupplier ? p.direction === 'paid_to_supplier' : p.direction === 'received_from_customer')
  );

  // Totals
  const totalValue    = partyContracts.reduce((s,c) => s + (isSupplier ? (+c.purchase_value||0) : (+c.sales_value||0)), 0);
  const totalPaid     = payments.reduce((s,p) => s + (+p.amount||0), 0);
  const totalBalance  = totalValue - totalPaid;

  // Ageing buckets on outstanding contracts
  const today = new Date(); today.setHours(0,0,0,0);
  const ageing = { current: 0, days30: 0, days60: 0, days90plus: 0 };
  partyContracts.forEach(c => {
    const bal = isSupplier ? (+c.purchase_balance_payable||0) : (+c.sales_balance_receivable||0);
    if (bal <= 0) return;
    const dueDate = isSupplier ? c.payable_due_date : c.receivable_due_date;
    if (!dueDate) { ageing.current += bal; return; }
    const due = new Date(dueDate); due.setHours(0,0,0,0);
    const diff = Math.round((today - due) / 86400000);
    if (diff <= 0)       ageing.current   += bal;
    else if (diff <= 30) ageing.days30    += bal;
    else if (diff <= 60) ageing.days60    += bal;
    else                 ageing.days90plus+= bal;
  });

  // Build combined transactions list (sorted by date)
  const txns = [];
  partyContracts.forEach(c => {
    txns.push({
      date:  c.deal_date || c.created_at,
      type:  'contract',
      ref:   c.contract_number,
      desc:  c.product || '—',
      debit: isSupplier ? (+c.purchase_value||0) : 0,
      credit:isSupplier ? 0 : (+c.sales_value||0),
      contractId: c.id,
    });
  });
  payments.forEach(p => {
    const c = S.contracts.find(x => x.id === p.contract_id);
    txns.push({
      date:  p.payment_date,
      type:  'payment',
      ref:   p.mode_reference || p.payment_mode || '—',
      desc:  `Payment — ${c?.contract_number || ''}`,
      debit: isSupplier ? 0 : (+p.amount||0),
      credit:isSupplier ? (+p.amount||0) : 0,
      contractId: p.contract_id,
    });
  });
  txns.sort((a,b) => new Date(a.date||0) - new Date(b.date||0));

  // Running balance
  let runBal = 0;
  const rows = txns.map(t => {
    runBal += t.debit - t.credit;
    return { ...t, balance: runBal };
  });

  openModal(`
  <div class="modal modal-lg" onclick="event.stopPropagation()">
    <div id="ledger-print-header"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">Ledger — ${party.name}</div>
        <div class="text-muted text-sm">${isSupplier ? 'Supplier' : 'Customer'} &nbsp;•&nbsp; ${partyContracts.length} contract${partyContracts.length !== 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-sm no-print" onclick="printLedger('${party.name}','${isSupplier?'Supplier':'Customer'}')">🖨 Print</button>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>
    </div>
    <div class="modal-body">

      <!-- Summary KPIs -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="kpi navy">
          <div class="kpi-label">Total ${isSupplier ? 'Purchases' : 'Sales'}</div>
          <div class="kpi-value">${fmt.usd(totalValue)}</div>
          <div class="kpi-sub">${partyContracts.length} contracts</div>
        </div>
        <div class="kpi teal">
          <div class="kpi-label">Total ${isSupplier ? 'Paid' : 'Received'}</div>
          <div class="kpi-value">${fmt.usd(totalPaid)}</div>
          <div class="kpi-sub">${payments.length} payments</div>
        </div>
        <div class="kpi ${totalBalance > 0 ? 'amber' : 'green'}">
          <div class="kpi-label">Outstanding Balance</div>
          <div class="kpi-value">${fmt.usd(totalBalance)}</div>
          <div class="kpi-sub">${totalBalance > 0 ? 'Still owed' : 'Fully settled'}</div>
        </div>
        <div class="kpi ${ageing.days60 + ageing.days90plus > 0 ? 'red' : 'green'}">
          <div class="kpi-label">Overdue (60d+)</div>
          <div class="kpi-value">${fmt.usd(ageing.days60 + ageing.days90plus)}</div>
          <div class="kpi-sub">${ageing.days30 ? fmt.usd(ageing.days30) + ' in 1-30d' : 'None overdue'}</div>
        </div>
      </div>

      <!-- Ageing Summary -->
      <div class="card" style="padding:14px 16px;margin-bottom:20px;background:var(--bg)">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);margin-bottom:10px">Ageing Summary</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
          ${[
            ['Current', ageing.current, 'var(--green)'],
            ['1–30 days', ageing.days30, 'var(--orange)'],
            ['31–60 days', ageing.days60, 'var(--red)'],
            ['60+ days', ageing.days90plus, 'var(--red)'],
          ].map(([l,v,clr]) => `
            <div>
              <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${l}</div>
              <div style="font-size:16px;font-weight:700;color:${v>0?clr:'var(--text3)'}">${fmt.usd(v)}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Party Details -->
      <div class="card" style="padding:14px 16px;margin-bottom:20px">
        <div class="card-title" style="margin-bottom:10px">${isSupplier ? 'Supplier' : 'Customer'} Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          ${[
            ['Country', party.country],
            ['Contact', party.contact_person],
            ['Email', party.email],
            ['Phone', party.phone],
          ].map(([l,v]) => v ? `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>` : '').join('')}
        </div>
      </div>

      <!-- Transaction Table -->
      <div class="section-divider">Transaction History</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Description</th>
              <th class="num">${isSupplier ? 'Invoice (Dr)' : 'Invoice (Cr)'}</th>
              <th class="num">${isSupplier ? 'Payment (Cr)' : 'Receipt (Dr)'}</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="${r.type === 'contract' ? 'clickable' : ''}" ${r.type === 'contract' ? `onclick="closeModal();contractDetail('${r.contractId}')"` : ''}>
                <td>${fmt.date(r.date)}</td>
                <td><span class="badge ${r.type === 'contract' ? 'badge-open' : 'badge-shipped'}">${r.type === 'contract' ? 'Contract' : 'Payment'}</span></td>
                <td><strong>${r.ref}</strong></td>
                <td>${r.desc}</td>
                <td class="amt">${r.debit > 0 ? fmt.usd(r.debit) : '—'}</td>
                <td class="amt">${r.credit > 0 ? fmt.usd(r.credit) : '—'}</td>
                <td class="amt ${r.balance > 0 ? 'text-amber' : 'text-green'}"><strong>${fmt.usd(r.balance)}</strong></td>
              </tr>`).join('')}
            <tr style="border-top:2px solid var(--navy);font-weight:700;background:var(--bg)">
              <td colspan="4" style="padding:10px 12px">Closing Balance</td>
              <td class="amt">${fmt.usd(totalValue)}</td>
              <td class="amt">${fmt.usd(totalPaid)}</td>
              <td class="amt ${totalBalance > 0 ? 'text-amber' : 'text-green'}">${fmt.usd(totalBalance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`);

  // Store for print
  window._ledgerPrintData = { party, isSupplier, rows, totalValue, totalPaid, totalBalance, ageing };
}

function printLedger(partyName, partyType) {
  const d = window._ledgerPrintData;
  if (!d) return;
  const { party, isSupplier, rows, totalValue, totalPaid, totalBalance, ageing } = d;
  const co = S.company || {};
  const logoHtml = co.logo_url
    ? `<img src="${co.logo_url}" style="height:40px;object-fit:contain">`
    : `<div style="width:40px;height:40px;border-radius:8px;background:#0B4F6C;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(co.name||'C').substring(0,1)}</div>`;
  const usd = v => v == null || v === '' ? '—' : '$' + Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const dt  = v => { if (!v) return '—'; const d2 = new Date(v); return d2.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); };

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
  <title>Ledger — ${partyName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:20px}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid #0B4F6C;margin-bottom:16px}
    .co-name{font-size:16px;font-weight:700;color:#0B4F6C}
    .co-addr{font-size:11px;color:#64748b}
    .doc-title{font-size:15px;font-weight:700;text-align:right}
    .doc-sub{font-size:11px;color:#64748b;text-align:right}
    .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
    .kpi.navy{border-left:3px solid #0B4F6C}
    .kpi.teal{border-left:3px solid #0E6D94}
    .kpi.amber{border-left:3px solid #d97706}
    .kpi.green{border-left:3px solid #059669}
    .kpi.red{border-left:3px solid #dc2626}
    .kpi-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
    .kpi-value{font-size:16px;font-weight:700;margin:2px 0}
    .kpi-sub{font-size:10px;color:#94a3b8}
    .ageing{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:14px}
    .ageing-label{font-size:10px;color:#64748b;margin-bottom:3px}
    .ageing-val{font-size:15px;font-weight:700}
    .section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#0B4F6C;padding:6px 0 4px;border-bottom:1px solid #0B4F6C;margin-bottom:8px}
    table{width:100%;border-collapse:collapse}
    th{background:#f1f5f9;font-size:11px;font-weight:600;color:#475569;padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0}
    td{padding:5px 8px;font-size:11px;border-bottom:1px solid #f1f5f9}
    td.num{text-align:right}
    .badge{font-size:10px;padding:2px 6px;border-radius:3px;font-weight:600}
    .badge-contract{background:#dbeafe;color:#1d4ed8}
    .badge-payment{background:#d1fae5;color:#065f46}
    .closing{border-top:2px solid #0B4F6C;font-weight:700;background:#f8fafc}
    .footer{margin-top:14px;font-size:10px;color:#94a3b8;text-align:right}
    @page{size:A4 portrait;margin:12mm 14mm}
    @media print{html,body{height:auto!important;overflow:visible!important}table{page-break-inside:auto}tr{page-break-inside:avoid}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:10px">
      ${logoHtml}
      <div>
        <div class="co-name">${co.name||'Cargaria'}</div>
        <div class="co-addr">${co.address||''}</div>
      </div>
    </div>
    <div>
      <div class="doc-title">${partyType} Ledger — ${partyName}</div>
      <div class="doc-sub">Printed: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi navy"><div class="kpi-label">Total ${isSupplier?'Purchases':'Sales'}</div><div class="kpi-value">${usd(totalValue)}</div></div>
    <div class="kpi teal"><div class="kpi-label">Total ${isSupplier?'Paid':'Received'}</div><div class="kpi-value">${usd(totalPaid)}</div></div>
    <div class="kpi ${totalBalance>0?'amber':'green'}"><div class="kpi-label">Outstanding</div><div class="kpi-value">${usd(totalBalance)}</div><div class="kpi-sub">${totalBalance>0?'Still owed':'Fully settled'}</div></div>
    <div class="kpi ${ageing.days60+ageing.days90plus>0?'red':'green'}"><div class="kpi-label">Overdue 60d+</div><div class="kpi-value">${usd(ageing.days60+ageing.days90plus)}</div></div>
  </div>

  <div class="ageing">
    <div><div class="ageing-label">Current</div><div class="ageing-val" style="color:${ageing.current>0?'#059669':'#94a3b8'}">${usd(ageing.current)}</div></div>
    <div><div class="ageing-label">1–30 days</div><div class="ageing-val" style="color:${ageing.days30>0?'#d97706':'#94a3b8'}">${usd(ageing.days30)}</div></div>
    <div><div class="ageing-label">31–60 days</div><div class="ageing-val" style="color:${ageing.days60>0?'#dc2626':'#94a3b8'}">${usd(ageing.days60)}</div></div>
    <div><div class="ageing-label">60+ days</div><div class="ageing-val" style="color:${ageing.days90plus>0?'#dc2626':'#94a3b8'}">${usd(ageing.days90plus)}</div></div>
  </div>

  <div class="section">Transaction History</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Reference</th>
        <th>Description</th>
        <th style="text-align:right">${isSupplier?'Invoice (Dr)':'Invoice (Cr)'}</th>
        <th style="text-align:right">${isSupplier?'Payment (Cr)':'Receipt (Dr)'}</th>
        <th style="text-align:right">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td>${dt(r.date)}</td>
        <td><span class="badge ${r.type==='contract'?'badge-contract':'badge-payment'}">${r.type==='contract'?'Contract':'Payment'}</span></td>
        <td><strong>${r.ref}</strong></td>
        <td>${r.desc}</td>
        <td class="num">${r.debit>0?usd(r.debit):'—'}</td>
        <td class="num">${r.credit>0?usd(r.credit):'—'}</td>
        <td class="num" style="font-weight:700;color:${r.balance>0?'#d97706':'#059669'}">${usd(r.balance)}</td>
      </tr>`).join('')}
      <tr class="closing">
        <td colspan="4" style="padding:7px 8px">Closing Balance</td>
        <td class="num">${usd(totalValue)}</td>
        <td class="num">${usd(totalPaid)}</td>
        <td class="num" style="color:${totalBalance>0?'#d97706':'#059669'}">${usd(totalBalance)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">Generated by Cargaria &nbsp;·&nbsp; ${new Date().toLocaleString()}</div>
  <script>window.onload=()=>{ document.documentElement.scrollTop=0; document.body.scrollTop=0; setTimeout(()=>window.print(),200); };</scr`+`ipt></body></html>`);
  win.document.close();
}
