/* ═══════════════════════════════════════════════════════
   CARGARIA — Payments Screen
   ═══════════════════════════════════════════════════════ */

function payments(filter) {
  filter = filter || 'all';
  document.getElementById('page-title').textContent = 'Payments';
  document.getElementById('topbar-actions').innerHTML = '';

  const allPay = S.payments || [];

  const filtered = filter === 'all' ? allPay
    : filter === 'out' ? allPay.filter(p => p.direction === 'paid_to_supplier')
    : allPay.filter(p => p.direction === 'received_from_customer');

  const totalOut = allPay.filter(p => p.direction === 'paid_to_supplier').reduce((s,p) => s + (+p.amount||0), 0);
  const totalIn  = allPay.filter(p => p.direction === 'received_from_customer').reduce((s,p) => s + (+p.amount||0), 0);
  const net      = totalIn - totalOut;

  setContent(`
    <!-- Summary KPIs -->
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="kpi red">
        <div class="kpi-label">Total Paid Out</div>
        <div class="kpi-value">${fmt.usd(totalOut)}</div>
        <div class="kpi-sub">To suppliers</div>
      </div>
      <div class="kpi green">
        <div class="kpi-label">Total Received</div>
        <div class="kpi-value">${fmt.usd(totalIn)}</div>
        <div class="kpi-sub">From buyers</div>
      </div>
      <div class="kpi ${net >= 0 ? 'teal' : 'amber'}">
        <div class="kpi-label">Net Cash Flow</div>
        <div class="kpi-value">${fmt.usd(net)}</div>
        <div class="kpi-sub">${net >= 0 ? 'Net positive' : 'Net negative'}</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      ${[
        ['all',  'All (' + allPay.length + ')'],
        ['out',  'Paid Out (' + allPay.filter(p => p.direction==='paid_to_supplier').length + ')'],
        ['in',   'Received (' + allPay.filter(p => p.direction==='received_from_customer').length + ')'],
      ].map(([k,l]) => `<button class="filter-chip ${filter===k?'active':''}" onclick="payments('${k}')">${l}</button>`).join('')}
    </div>

    <!-- Table -->
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Contract</th>
              <th>Direction</th>
              <th>Party</th>
              <th>Mode</th>
              <th>Reference</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? '<tr><td colspan="7" class="text-muted text-center" style="padding:32px">No payments found</td></tr>'
              : filtered.map(p => {
                  const c = S.contracts.find(x => x.id === p.contract_id);
                  const isOut = p.direction === 'paid_to_supplier';
                  return `<tr class="clickable" onclick="contractDetail('${p.contract_id}')">
                    <td>${fmt.date(p.payment_date)}</td>
                    <td>
                      <strong>${c?.contract_number || '—'}</strong>
                      ${c?.product ? `<div class="text-muted" style="font-size:11px">${c.product}</div>` : ''}
                    </td>
                    <td>
                      <span class="badge ${isOut ? 'badge-no-buyer' : 'badge-shipped'}">
                        ${isOut ? '📤 To Supplier' : '📥 From Buyer'}
                      </span>
                    </td>
                    <td>${isOut ? (c?.supplier_name || '—') : (c?.customer_name || '—')}</td>
                    <td>${p.payment_mode || '—'}</td>
                    <td>${p.mode_reference || '—'}</td>
                    <td class="amt"><strong style="color:${isOut ? 'var(--red)' : 'var(--green)'}">
                      ${isOut ? '-' : '+'}${fmt.usd(p.amount)}
                    </strong></td>
                  </tr>`;
                }).join('')}
          </tbody>
        </table>
      </div>
    </div>`);
}
