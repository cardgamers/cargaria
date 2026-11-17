/* ═══════════════════════════════════════════════════════
   CARGARIA — Contracts: List, Detail, All Modals
   ═══════════════════════════════════════════════════════ */

/* ── Contracts List ── */
function contracts(filter) {
  filter = filter || 'all';
  document.getElementById('page-title').textContent = 'Contracts';
  const canAdd = canWrite('contracts');
  document.getElementById('topbar-actions').innerHTML = canAdd
    ? '<button class="btn btn-cta" onclick="newContractModal()">+ New Contract</button>'
    : '';

  const statusFilters = ['all','open','shipped','arrived','closed'];
  const filtered = filter === 'all'
    ? S.contracts
    : S.contracts.filter(c => c.status === filter);

  // Free days badge logic
  function freeDaysBadge(c) {
    if (!c.arrival_date || !c.free_days || c.containers_returned_date) return '';
    const arr = new Date(c.arrival_date); arr.setHours(0,0,0,0);
    const lastFree = new Date(arr); lastFree.setDate(lastFree.getDate() + parseInt(c.free_days));
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((lastFree - today) / 86400000);
    if (diff > 3) return '';
    if (diff < 0) return `<span class="badge badge-red" style="margin-left:4px">🚨 ${Math.abs(diff)}d det.</span>`;
    return `<span class="badge badge-no-buyer" style="margin-left:4px">⚠️ ${diff}d left</span>`;
  }

  setContent(`
    <div class="filter-bar">
      ${statusFilters.map(s => `
        <button class="filter-chip ${filter === s ? 'active' : ''}" onclick="contracts('${s}')">
          ${s === 'all' ? 'All (' + S.contracts.length + ')' : s.charAt(0).toUpperCase() + s.slice(1) + ' (' + S.contracts.filter(c => c.status === s).length + ')'}
        </button>`).join('')}
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Product</th>
              <th>Supplier</th>
              <th>Buyer</th>
              <th>Status</th>
              <th>ETA</th>
              <th>Ctrs</th>
              <th class="num">Purchase</th>
              <th class="num">Sales</th>
              <th class="num">Net Margin</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? '<tr><td colspan="10" class="text-muted text-center" style="padding:32px">No contracts found</td></tr>'
              : filtered.map(c => `
              <tr class="clickable" onclick="contractDetail('${c.id}')">
                <td>
                  <strong>${c.contract_number || '—'}</strong>
                  ${freeDaysBadge(c)}
                  ${c.legacy_reference ? `<div class="text-muted" style="font-size:11px">${c.legacy_reference}</div>` : ''}
                </td>
                <td>${c.product || '—'}<div class="text-muted" style="font-size:11px">${c.origin_country || ''}</div></td>
                <td>${c.supplier_name || '—'}</td>
                <td>${c.customer_name || '<span class="text-muted">No buyer</span>'}</td>
                <td><span class="badge badge-${c.status}">${c.status || '—'}</span></td>
                <td>${fmt.date(c.arrival_date)}</td>
                <td class="text-center">${c.container_count || '—'}</td>
                <td class="amt">${fmt.usd(c.purchase_value)}</td>
                <td class="amt">${c.sales_value ? fmt.usd(c.sales_value) : '<span class="text-muted">—</span>'}</td>
                <td class="amt ${(+c.net_margin_pct||0) >= 0 ? 'text-green' : 'text-red'}">${fmt.pct(c.net_margin_pct)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`);
}

/* ── Contract Detail Modal ── */
async function contractDetail(id) {
  const c = S.contracts.find(x => x.id === id);
  if (!c) return;

  // Parallel data fetch
  const [
    { data: shipmentLines },
    { data: rawPayments },
    { data: qualityClaims },
    { data: contractFull },
  ] = await Promise.all([
    sb.from('shipment_lines').select('*').eq('contract_id', id).order('created_at'),
    sb.from('payments').select('*').eq('contract_id', id).eq('company_id', S.companyId).order('payment_date'),
    sb.from('quality_claims').select('*').eq('contract_id', id).order('created_at'),
    sb.from('contracts').select('*').eq('id', id).eq('company_id', S.companyId).single(),
  ]);

  // Cache for invoice print
  if (!S._shipmentLinesCache) S._shipmentLinesCache = {};
  S._shipmentLinesCache[id] = shipmentLines || [];

  const payments = rawPayments || [];
  const lines    = shipmentLines || [];
  const claims   = qualityClaims || [];

  // Merge contract full fields
  const cf = contractFull || {};

  const advancePaid     = payments.filter(p => p.direction === 'paid_to_supplier').reduce((s,p) => s + (+p.amount||0), 0);
  const advanceReceived = payments.filter(p => p.direction === 'received_from_customer').reduce((s,p) => s + (+p.amount||0), 0);
  const purchaseBalance = (+c.purchase_value||0) - advancePaid;
  const salesBalance    = (+c.sales_value||0) - advanceReceived;

  // Detention calc
  let detentionDays = 0, detentionCost = 0;
  if (c.arrival_date && c.free_days && !c.containers_returned_date) {
    const arr = new Date(c.arrival_date); arr.setHours(0,0,0,0);
    const lastFree = new Date(arr); lastFree.setDate(lastFree.getDate() + parseInt(c.free_days));
    const today = new Date(); today.setHours(0,0,0,0);
    detentionDays = Math.max(0, Math.round((today - lastFree) / 86400000));
    detentionCost = detentionDays * (+c.daily_detention_rate || 0) * (+c.container_count || 1);
  }

  // Cost sheet
  const totalCosts = (+c.purchase_value||0)+(+cf.freight||0)+(+cf.insurance||0)+(+cf.documentation_charges||0)+(+cf.payment_charges||0)+(+cf.demurrage||0)+(+cf.commission_value||0)+(+cf.other_costs||0);
  const netMargin  = (+c.sales_value||0) - totalCosts;
  const netMarginPct = totalCosts > 0 ? (netMargin / totalCosts * 100) : 0;

  // Documents
  await loadDocsForContract(id);

  const canEdit = canWrite('contracts');

  openModal(`
  <div class="modal modal-lg" onclick="event.stopPropagation()">
    <div id="contract-print-header"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">${c.contract_number || '—'} — ${c.product || ''}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px">
          <span class="badge badge-${c.status}">${c.status}</span>
          &nbsp;${c.supplier_name || '—'} → ${c.customer_name || 'No buyer'}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${canEdit ? `<button class="btn btn-sm" onclick="editContractModal('${id}')">✏️ Edit</button>` : ''}
        <button class="btn btn-sm no-print" onclick="printContract('${c.id}')">🖨 Print</button>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>
    </div>
    <div class="modal-body">

      <!-- KPI Strip -->
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="kpi navy">
          <div class="kpi-label">Purchase Value</div>
          <div class="kpi-value">${fmt.usd(c.purchase_value)}</div>
          <div class="kpi-sub">Terms: ${c.purchase_payment_terms || '—'}</div>
        </div>
        <div class="kpi teal">
          <div class="kpi-label">Sales Value</div>
          <div class="kpi-value">${c.sales_value ? fmt.usd(c.sales_value) : '<span style="color:var(--text3)">No buyer</span>'}</div>
          <div class="kpi-sub">Terms: ${c.sales_payment_terms || '—'}</div>
        </div>
        <div class="kpi ${netMargin >= 0 ? 'green' : 'red'}">
          <div class="kpi-label">Net Margin</div>
          <div class="kpi-value">${fmt.usd(netMargin)}</div>
          <div class="kpi-sub">${netMarginPct.toFixed(1)}%</div>
        </div>
        <div class="kpi amber">
          <div class="kpi-label">Capital at Risk</div>
          <div class="kpi-value">${fmt.usd(advancePaid > advanceReceived ? advancePaid - advanceReceived : 0)}</div>
          <div class="kpi-sub">Out − received back</div>
        </div>
      </div>

      <!-- 2×2 Detail Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

        <!-- Purchase Details -->
        <div class="card" style="padding:16px">
          <div class="card-title">Purchase</div>
          ${[
            ['Supplier', c.supplier_name || '—'],
            ['Country of Origin', c.origin_country || '—'],
            ['Incoterm', c.purchase_incoterm || '—'],
            ['Payment Terms', c.purchase_payment_terms || '—'],
            ['Purchase Value', fmt.usd(c.purchase_value)],
            ['Advance Paid', fmt.usd(advancePaid)],
            ['Balance Payable', `<strong style="color:${purchaseBalance > 0 ? 'var(--amber)' : 'var(--green)'}">${fmt.usd(purchaseBalance)}</strong>`],
            ['Payable Due', c.payable_due_date ? fmt.date(c.payable_due_date) : '—'],
            ['BL Number', cf.bl_number || '—'],
          ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>

        <!-- Sales Details -->
        <div class="card" style="padding:16px">
          <div class="card-title">Sales</div>
          ${[
            ['Buyer', c.customer_name || '—'],
            ['Sales Incoterm', c.incoterm || '—'],
            ['Payment Terms', c.sales_payment_terms || '—'],
            ['Sales Value', fmt.usd(c.sales_value)],
            ['Advance Received', fmt.usd(advanceReceived)],
            ['Balance Receivable', `<strong style="color:${salesBalance > 0 ? 'var(--green)' : 'var(--text3)'}">${fmt.usd(salesBalance)}</strong>`],
            ['Receivable Due', c.receivable_due_date ? fmt.date(c.receivable_due_date) : '—'],
            ['Invoice Number', cf.sales_invoice_number || '—'],
            ['Invoice Date', cf.sales_invoice_date ? fmt.date(cf.sales_invoice_date) : '—'],
          ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>

        <!-- Shipping Details -->
        <div class="card" style="padding:16px">
          <div class="card-title">Shipping</div>
          ${[
            ['Shipping Line', cf.shipping_line || '—'],
            ['Vessel', cf.vessel_name || '—'],
            ['Load Port', c.load_port_name || '—'],
            ['Discharge Port', c.discharge_port_name || '—'],
            ['Sailing Date', fmt.date(c.sailing_date)],
            ['Arrival Date (ETA)', fmt.date(c.arrival_date)],
            ['Containers', c.container_count ? c.container_count + ' × 40HC' : '—'],
            ['Free Days', c.free_days ? c.free_days + ' days' : '—'],
            ['Daily Detention Rate', c.daily_detention_rate ? fmt.usd(c.daily_detention_rate) + '/day/ctr' : '—'],
          ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>

        <!-- Costs Summary -->
        <div class="card" style="padding:16px">
          <div class="card-title">Costs</div>
          ${[
            ['Freight', fmt.usd(cf.freight)],
            ['Insurance', fmt.usd(cf.insurance)],
            ['Documentation', fmt.usd(cf.documentation_charges)],
            ['Payment Charges', fmt.usd(cf.payment_charges)],
            ['Commission', cf.commission_pct ? cf.commission_pct + '% = ' + fmt.usd(cf.commission_value) : fmt.usd(cf.commission_value)],
            ['Demurrage', fmt.usd(cf.demurrage)],
            ['Other Costs', fmt.usd(cf.other_costs)],
            ['Total Costs', `<strong>${fmt.usd(totalCosts)}</strong>`],
          ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>
      </div>


      <!-- Shipment Lines -->
      <div class="section-divider">Shipment Lines
        ${canEdit ? `<button class="btn btn-sm" style="float:right;margin-top:-4px" onclick="addShipmentLineModal('${id}')">+ Add Line</button>` : ''}
      </div>
      <div class="table-wrap mb-16">
        <table>
          <thead>
            <tr>
              <th>Container #</th>
              <th>Category</th>
              <th>Pieces</th>
              <th>Girth</th>
              <th class="num">CBM Vol.</th>
              <th class="num">Purch. Price</th>
              <th class="num">Sales Price</th>
              <th class="num">Purch. Value</th>
              <th class="num">Sales Value</th>
              ${canEdit ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${lines.length === 0
              ? `<tr><td colspan="${canEdit ? 10 : 9}" class="text-muted text-center" style="padding:16px">No shipment lines yet</td></tr>`
              : lines.map(l => `
                <tr>
                  <td><strong>${l.container_number || '—'}</strong></td>
                  <td>${l.timber_category || l.log_category || '—'}</td>
                  <td>${l.no_of_pieces ? fmt.num(l.no_of_pieces, 0) : '—'}</td>
                  <td>${l.avg_girth_cft ? fmt.num(l.avg_girth_cft) + ' cft' : '—'}</td>
                  <td class="amt">${l.purchase_volume_cbm ? fmt.num(l.purchase_volume_cbm) + ' CBM' : '—'}</td>
                  <td class="amt">${l.purchase_price_per_cbm ? '$' + fmt.num(l.purchase_price_per_cbm) : '—'}</td>
                  <td class="amt">${l.sales_price_per_cbm ? '$' + fmt.num(l.sales_price_per_cbm) : '—'}</td>
                  <td class="amt">${l.purchase_value_override ? fmt.usd(l.purchase_value_override) : (l.purchase_volume_cbm && l.purchase_price_per_cbm ? fmt.usd(l.purchase_volume_cbm * l.purchase_price_per_cbm) : '—')}</td>
                  <td class="amt">${l.sales_value_override ? fmt.usd(l.sales_value_override) : (l.selling_volume_cbm && l.sales_price_per_cbm ? fmt.usd(l.selling_volume_cbm * l.sales_price_per_cbm) : '—')}</td>
                  ${canEdit ? `<td><button class="btn btn-sm" onclick="editShipmentLineModal('${l.id}','${id}')">✏️</button></td>` : ''}
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Payments -->
      <div class="section-divider">Payments
        ${canWrite('payments') ? `<button class="btn btn-sm" style="float:right;margin-top:-4px" onclick="addPaymentModal('${id}')">+ Add Payment</button>` : ''}
      </div>
      <div class="table-wrap mb-16">
        <table>
          <thead>
            <tr><th>Date</th><th>Direction</th><th>Mode</th><th>Reference</th><th class="num">Amount</th></tr>
          </thead>
          <tbody>
            ${payments.length === 0
              ? '<tr><td colspan="5" class="text-muted text-center" style="padding:16px">No payments recorded</td></tr>'
              : payments.map(p => `
                <tr>
                  <td>${fmt.date(p.payment_date)}</td>
                  <td><span class="badge ${p.direction === 'paid_to_supplier' ? 'badge-no-buyer' : 'badge-shipped'}">${p.direction === 'paid_to_supplier' ? '📤 To Supplier' : '📥 From Buyer'}</span></td>
                  <td>${p.payment_mode || '—'}</td>
                  <td>${p.mode_reference || '—'}</td>
                  <td class="amt"><strong>${fmt.usd(p.amount)}</strong></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Quality Claims -->
      ${claims.length > 0 ? `
      <div class="section-divider">Quality Claims</div>
      <div class="table-wrap mb-16">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${claims.map(cl => `
              <tr>
                <td>${fmt.date(cl.created_at)}</td>
                <td>${cl.description || '—'}</td>
                <td class="amt">${fmt.usd(cl.amount)}</td>
                <td><span class="badge badge-${cl.status === 'settled' ? 'closed' : 'open'}">${cl.status || 'pending'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Documents -->
      <div class="section-divider">Documents
        ${canEdit ? `<button class="btn btn-sm" style="float:right;margin-top:-4px" onclick="uploadDocumentsModal('${id}')">📎 Upload</button>` : ''}
      </div>
      <div id="docs-list-${id}" style="margin-bottom:20px">
        <div class="text-muted text-center" style="padding:16px">Loading documents…</div>
      </div>

      <!-- Document Checklist -->
      <div class="section-divider">Document Checklist</div>
      <div id="doc-checklist-${id}" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:20px">
        ${['Commercial Invoice','Packing List','Bill of Lading','Certificate of Origin','Phytosanitary Certificate','Fumigation Certificate','Quality Inspection Report','Weight Certificate','Freight Invoice','Insurance Certificate','LC Document','Customs Clearance'].map(doc => {
          const key = `doc_check_${id}_${doc.replace(/\s+/g,'_')}`;
          let checked = false;
          try { checked = localStorage.getItem(key) === '1'; } catch(e) {}
          return `<label class="checklist-item" style="background:${checked ? 'var(--teal-light)' : ''}">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleDocCheck('${id}','${doc}',this.checked)">
            <span style="color:${checked ? 'var(--teal-dark)' : 'var(--text)'}">${doc}</span>
          </label>`;
        }).join('')}
      </div>

      <!-- Cost Sheet Analysis -->
      <div class="section-divider">Cost Sheet — Landed Cost Analysis</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div class="card" style="padding:16px">
          <div class="card-title">Cost Breakdown</div>
          ${[
            ['FOB / Purchase Value', cf.purchase_value],
            ['Freight', cf.freight],
            ['Insurance', cf.insurance],
            ['Documentation', cf.documentation_charges],
            ['Payment Charges', cf.payment_charges],
            ['Demurrage', cf.demurrage],
            ['Commission', cf.commission_value],
            ['Other Costs', cf.other_costs],
          ].filter(([,v]) => +v > 0).map(([l,v]) => `
            <div class="detail-row">
              <span class="detail-label">${l}</span>
              <span class="detail-val">${fmt.usd(v)}</span>
            </div>`).join('')}
          <div class="detail-row" style="border-top:2px solid var(--navy);margin-top:4px">
            <span class="detail-label" style="color:var(--text)"><strong>Total Landed Cost</strong></span>
            <span class="detail-val"><strong>${fmt.usd(totalCosts)}</strong></span>
          </div>
        </div>
        <div class="card" style="padding:16px">
          <div class="card-title">Margin Analysis</div>
          ${[
            ['Sales Value', fmt.usd(c.sales_value)],
            ['Total Landed Cost', fmt.usd(totalCosts)],
          ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
          <div class="detail-row" style="border-top:2px solid var(--navy);margin-top:4px">
            <span class="detail-label" style="color:${netMargin >= 0 ? 'var(--green)' : 'var(--red)'}"><strong>Net Margin</strong></span>
            <span class="detail-val" style="color:${netMargin >= 0 ? 'var(--green)' : 'var(--red)'}"><strong>${fmt.usd(netMargin)} (${netMarginPct.toFixed(1)}%)</strong></span>
          </div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="btn btn-sm no-print" onclick="printCostSheet('${id}')">🖨 Cost Sheet</button>
            ${c.sales_value ? `<button class="btn btn-sm no-print" onclick="printBuyerInvoice('${id}')">📄 Buyer Invoice</button>` : ''}
          </div>
        </div>
      </div>

      <!-- Detention Calculator -->
      ${(c.arrival_date || c.free_days || c.daily_detention_rate) ? (() => {
        const arrDate  = c.arrival_date ? new Date(c.arrival_date) : null;
        const sailDate = c.sailing_date ? new Date(c.sailing_date) : null;
        let freeDaysEnd = null;
        if (arrDate && c.free_days) {
          freeDaysEnd = new Date(arrDate);
          freeDaysEnd.setDate(freeDaysEnd.getDate() + parseInt(c.free_days));
        }
        const today = new Date(); today.setHours(0,0,0,0);
        const retDate = c.containers_returned_date ? new Date(c.containers_returned_date) : null;

        // Status logic
        let statusHtml = '';
        if (retDate) {
          const retWithinFree = freeDaysEnd && retDate <= freeDaysEnd;
          statusHtml = retWithinFree
            ? `<div class="alert alert-success">✓ Empty containers returned ${fmt.date(c.containers_returned_date)} — within free days period</div>`
            : `<div class="alert alert-danger">⚠️ Empty containers returned ${fmt.date(c.containers_returned_date)} — ${Math.round((retDate - freeDaysEnd) / 86400000)} days after free period</div>`;
        } else if (detentionDays > 0) {
          statusHtml = `<div class="alert alert-danger">
            <strong>🚨 ${detentionDays} detention day${detentionDays > 1 ? 's' : ''} running — Est. cost: ${fmt.usd(detentionCost)}</strong>
            <div style="margin-top:8px"><button class="btn btn-sm" onclick="confirmContainerReturn('${id}','${c.contract_number}')">✓ Mark Containers Returned</button></div>
          </div>`;
        } else if (freeDaysEnd && !retDate) {
          const daysLeft = Math.round((freeDaysEnd - today) / 86400000);
          statusHtml = daysLeft >= 0
            ? `<div class="alert alert-success">✓ Within free days period — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining</div>`
            : `<div class="alert alert-danger">🚨 Free days expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago — containers not yet returned</div>`;
        }

        return `
        <div class="section-divider">Detention Calculator</div>
        <div class="card" style="padding:16px;margin-bottom:20px">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px">
            <div><div class="kpi-label">Shipped Date</div><div style="font-size:15px;font-weight:600">${sailDate ? fmt.date(c.sailing_date) : '—'}</div></div>
            <div><div class="kpi-label">Arrival Date</div><div style="font-size:15px;font-weight:600">${arrDate ? fmt.date(c.arrival_date) : '—'}</div></div>
            <div><div class="kpi-label">Free Days</div><div style="font-size:15px;font-weight:600">${c.free_days ? c.free_days + ' days' : '—'}</div></div>
            <div><div class="kpi-label">Free Days End</div><div style="font-size:15px;font-weight:600;color:var(--amber)">${freeDaysEnd ? fmt.date(freeDaysEnd.toISOString()) : '—'}</div></div>
            <div><div class="kpi-label">Empty Return</div><div style="font-size:15px;font-weight:600;color:${retDate ? 'var(--green)' : 'var(--text3)'}">${retDate ? fmt.date(c.containers_returned_date) : 'Not yet returned'}</div></div>
            <div><div class="kpi-label">Daily Rate / Ctr</div><div style="font-size:15px;font-weight:600">${c.daily_detention_rate ? fmt.usd(c.daily_detention_rate) : '—'}</div></div>
          </div>
          ${statusHtml}
        </div>`;
      })() : ''}

      <!-- Buyer Invoice Preview -->
      ${c.sales_value && cf.sales_invoice_number ? `
      <div class="section-divider">Buyer Invoice Preview</div>
      <div class="card" style="padding:16px;margin-bottom:20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            ${[
              ['Invoice No', cf.sales_invoice_number],
              ['Invoice Date', fmt.date(cf.sales_invoice_date)],
              ['Buyer', c.customer_name || '—'],
              ['Payment Terms', c.sales_payment_terms || '—'],
            ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
          </div>
          <div>
            ${[
              ['BL Number', cf.bl_number || '—'],
              ['Vessel', cf.vessel_name || '—'],
              ['Sales Value', fmt.usd(c.sales_value)],
              ['Due Date', fmt.date(c.receivable_due_date)],
            ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
          </div>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-sm btn-cta no-print" onclick="printBuyerInvoice('${id}')">📄 Print Invoice</button>
        </div>
      </div>` : ''}

      ${c.notes ? `<div class="alert alert-info">📝 ${c.notes}</div>` : ''}

    </div>
  </div>`);

  // Render docs async
  renderDocsList(id);
}

/* ── Documents ── */
const _docsCache = {};

const DOC_TYPES = [
  'Bill of Lading',
  'Commercial Invoice',
  'Packing List',
  'Phytosanitary Certificate',
  'Fumigation Certificate',
  'Certificate of Origin',
  'Quality Inspection Report',
  'Insurance Certificate',
  'Freight Invoice',
  'Other',
];

async function loadDocsForContract(contractId) {
  try {
    const { data } = await sb.from('contract_documents')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at');
    _docsCache[contractId] = data || [];
  } catch(e) {
    _docsCache[contractId] = [];
  }
}

async function renderDocsList(contractId) {
  const el = document.getElementById('docs-list-' + contractId);
  if (!el) return;

  const docs = _docsCache[contractId] || [];

  if (!docs.length) {
    el.innerHTML = '<p class="text-muted text-center" style="padding:16px">No documents uploaded yet</p>';
    return;
  }

  // Get signed URLs for all docs
  const withUrls = await Promise.all(docs.map(async d => {
    const { data } = await sb.storage.from('contract-docs')
      .createSignedUrl(d.file_path, 3600);
    return { ...d, signedUrl: data?.signedUrl };
  }));

  el.innerHTML = `
    <div style="display:grid;gap:8px">
      ${withUrls.map(d => {
        const ext = d.file_name.split('.').pop().toLowerCase();
        const icon = ext === 'pdf' ? '📄' : ['jpg','jpeg','png','webp'].includes(ext) ? '🖼' : '📎';
        const label = d.doc_type === 'Other' && d.custom_name ? d.custom_name : d.doc_type;
        const size = d.file_size ? (d.file_size > 1048576 ? (d.file_size/1048576).toFixed(1)+' MB' : (d.file_size/1024).toFixed(0)+' KB') : '';
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">${icon}</span>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text)">${label}</div>
                <div style="font-size:11px;color:var(--text3)">${d.file_name}${size ? ' · ' + size : ''}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              ${d.signedUrl ? `<a href="${d.signedUrl}" target="_blank" class="btn btn-sm">View</a>` : ''}
              ${canWrite('contracts') ? `<button class="btn btn-sm" style="color:var(--red)" onclick="deleteDocument('${contractId}','${d.id}','${d.file_path}')">🗑</button>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function uploadDocumentsModal(contractId) {
  openModal(`
  <div class="modal modal-sm" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">📎 Upload Document</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Document Type</label>
        <select id="doc-type-select" onchange="toggleDocCustomName()">
          ${DOC_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="doc-custom-name-wrap" style="display:none">
        <label>Document Name</label>
        <input type="text" id="doc-custom-name" placeholder="e.g. Weight Certificate">
      </div>
      <div class="form-group">
        <label>File <span class="text-muted" style="font-weight:400">(PDF or image, max 10MB)</span></label>
        <div class="upload-area" id="upload-area-${contractId}"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="handleDocDrop(event,'${contractId}')"
          onclick="document.getElementById('doc-file-input-${contractId}').click()"
          style="cursor:pointer;border:2px dashed var(--border);border-radius:8px;padding:24px;text-align:center">
          <div style="font-size:28px;margin-bottom:8px">📄</div>
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">Click or drag file here</div>
          <div class="text-muted" style="font-size:12px">PDF, JPG, PNG — up to 10MB</div>
          <input type="file" id="doc-file-input-${contractId}" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none"
            onchange="handleDocSelect(this,'${contractId}')">
        </div>
        <div id="upload-preview-${contractId}" style="margin-top:8px"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" id="upload-confirm-btn-${contractId}" onclick="confirmUpload('${contractId}')" disabled>Upload</button>
    </div>
  </div>`);
}

function toggleDocCustomName() {
  const sel = document.getElementById('doc-type-select');
  const wrap = document.getElementById('doc-custom-name-wrap');
  if (wrap) wrap.style.display = sel?.value === 'Other' ? 'block' : 'none';
}

window._pendingDocFiles = {};

function handleDocSelect(input, contractId) {
  window._pendingDocFiles[contractId] = input.files[0] || null;
  showDocPreview(contractId);
}

function handleDocDrop(event, contractId) {
  event.preventDefault();
  document.getElementById('upload-area-' + contractId)?.classList.remove('drag-over');
  window._pendingDocFiles[contractId] = event.dataTransfer.files[0] || null;
  showDocPreview(contractId);
}

function showDocPreview(contractId) {
  const file   = window._pendingDocFiles[contractId];
  const preview = document.getElementById('upload-preview-' + contractId);
  const btn     = document.getElementById('upload-confirm-btn-' + contractId);
  if (preview) {
    preview.innerHTML = file
      ? `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--teal-light);border-radius:6px;font-size:13px">
           <span>📎</span><span style="font-weight:600">${file.name}</span>
           <span style="color:var(--text3)">(${(file.size/1024).toFixed(0)} KB)</span>
         </div>`
      : '';
  }
  if (btn) btn.disabled = !file;
}

async function confirmUpload(contractId) {
  const file = window._pendingDocFiles[contractId];
  if (!file) return;

  const btn = document.getElementById('upload-confirm-btn-' + contractId);
  if (btn) { btn.textContent = 'Uploading…'; btn.disabled = true; }

  const docType    = document.getElementById('doc-type-select')?.value || 'Other';
  const customName = document.getElementById('doc-custom-name')?.value.trim() || null;

  // Validate Other has a name
  if (docType === 'Other' && !customName) {
    alert('Please enter a name for this document.');
    if (btn) { btn.textContent = 'Upload'; btn.disabled = false; }
    return;
  }

  // Validate file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('File is too large. Maximum size is 10MB.');
    if (btn) { btn.textContent = 'Upload'; btn.disabled = false; }
    return;
  }

  // Build storage path: {company_id}/{contract_id}/{uuid}.{ext}
  const ext  = file.name.split('.').pop().toLowerCase();
  const uid  = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
  const path = `${S.companyId}/${contractId}/${uid}.${ext}`;

  const { error: storageErr } = await sb.storage.from('contract-docs')
    .upload(path, file, { contentType: file.type });

  if (storageErr) {
    alert('Upload failed: ' + storageErr.message);
    if (btn) { btn.textContent = 'Upload'; btn.disabled = false; }
    return;
  }

  // Save record in contract_documents
  const { error: dbErr } = await sb.from('contract_documents').insert({
    contract_id:  contractId,
    company_id:   S.companyId,
    uploaded_by:  S.user.id,
    doc_type:     docType,
    custom_name:  docType === 'Other' ? customName : null,
    file_name:    file.name,
    file_path:    path,
    file_size:    file.size,
    mime_type:    file.type,
  });

  if (dbErr) {
    // Rollback storage upload
    await sb.storage.from('contract-docs').remove([path]);
    alert('Error saving document record: ' + dbErr.message);
    if (btn) { btn.textContent = 'Upload'; btn.disabled = false; }
    return;
  }

  // Auto-tick the matching checklist item
  const checkKey = `doc_check_${contractId}_${(docType === 'Other' ? customName : docType).replace(/\s+/g,'_')}`;
  try { localStorage.setItem(checkKey, '1'); } catch(e) {}
  // Update checklist UI if visible
  const checkboxes = document.querySelectorAll(`#doc-checklist-${contractId} input[type=checkbox]`);
  checkboxes.forEach(cb => {
    const lbl = cb.nextElementSibling?.textContent?.trim();
    const match = docType === 'Other' ? lbl === customName : lbl === docType;
    if (match) {
      cb.checked = true;
      cb.closest('label')?.style && (cb.closest('label').style.background = 'var(--teal-light)');
      if (cb.nextElementSibling) cb.nextElementSibling.style.color = 'var(--teal-dark)';
    }
  });

  delete window._pendingDocFiles[contractId];
  await loadDocsForContract(contractId);
  closeModal();
  renderDocsList(contractId);
}

async function deleteDocument(contractId, docId, filePath) {
  if (!confirm('Delete this document?')) return;
  await sb.storage.from('contract-docs').remove([filePath]);
  await sb.from('contract_documents').delete().eq('id', docId);
  await loadDocsForContract(contractId);
  renderDocsList(contractId);
}

/* ── Document Checklist ── */
function toggleDocCheck(contractId, docName, checked) {
  const key = `doc_check_${contractId}_${docName.replace(/\s+/g,'_')}`;
  try { localStorage.setItem(key, checked ? '1' : '0'); } catch(e) {}
  const el = document.getElementById('doc-checklist-' + contractId);
  if (el) {
    el.querySelectorAll('label').forEach(lbl => {
      const cb = lbl.querySelector('input[type=checkbox]');
      if (cb) {
        lbl.style.background = cb.checked ? 'var(--teal-light)' : '';
        const span = lbl.querySelector('span');
        if (span) span.style.color = cb.checked ? 'var(--teal-dark)' : 'var(--text)';
      }
    });
  }
}

/* ── Shipment Line Modals ── */
async function editShipmentLineModal(lineId, contractId) {
  const { data: line } = await sb.from('shipment_lines').select('*').eq('id', lineId).eq('contract_id', contractId).single();
  if (!line) return;

  openModal(`
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Edit Shipment Line — ${line.container_number || '—'}</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group"><label>Container Number</label><input type="text" id="sl-cnum" value="${line.container_number || ''}"></div>
        <div class="form-group"><label>Timber / Log Category</label>
          <select id="sl-category">
            ${['A Grade','B Grade','C Grade','Mixed','Logs','Sawn Timber','Hardwood','Softwood'].map(g =>
              `<option ${(line.timber_category||line.log_category)===g?'selected':''}>${g}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group"><label>No. of Pieces</label><input type="number" id="sl-pieces" value="${line.no_of_pieces || ''}"></div>
        <div class="form-group"><label>Avg Girth (cft)</label><input type="number" id="sl-girth" value="${line.avg_girth_cft || ''}" step="0.01"></div>
        <div class="form-group"><label>Purchase Volume (CBM)</label><input type="number" id="sl-cbm" value="${line.purchase_volume_cbm || ''}" step="0.001"></div>
        <div class="form-group"><label>Selling Volume (CBM)</label><input type="number" id="sl-mt" value="${line.selling_volume_cbm || ''}" step="0.001"></div>
        <div class="form-group"><label>Purchase Price / CBM ($)</label><input type="number" id="sl-ppu" value="${line.purchase_price_per_cbm || ''}" step="0.01"></div>
        <div class="form-group"><label>Sales Price / CBM ($)</label><input type="number" id="sl-spu" value="${line.sales_price_per_cbm || ''}" step="0.01"></div>
        <div class="form-group"><label>Purchase Value (override)</label><input type="number" id="sl-pv" value="${line.purchase_value_override || ''}" step="0.01" placeholder="Leave blank to auto-calc"></div>
        <div class="form-group"><label>Sales Value (override)</label><input type="number" id="sl-sv" value="${line.sales_value_override || ''}" step="0.01" placeholder="Leave blank to auto-calc"></div>
        <div class="form-group full"><label>Notes</label><textarea id="sl-notes" rows="2">${line.notes || ''}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveEditShipmentLine('${lineId}','${contractId}')">Save Line</button>
    </div>
  </div>`);
}

async function saveEditShipmentLine(lineId, contractId) {
  const ppu = parseFloat(document.getElementById('sl-ppu').value) || null;
  const spu = parseFloat(document.getElementById('sl-spu').value) || null;
  const cbm = parseFloat(document.getElementById('sl-cbm').value) || null;
  const pvOverride = parseFloat(document.getElementById('sl-pv').value) || null;
  const svOverride = parseFloat(document.getElementById('sl-sv').value) || null;

  const sellCbm = parseFloat(document.getElementById('sl-mt').value) || null;
  const { error } = await sb.from('shipment_lines').update({
    container_number:        document.getElementById('sl-cnum').value.trim() || null,
    timber_category:         document.getElementById('sl-category').value,
    no_of_pieces:            parseInt(document.getElementById('sl-pieces').value) || null,
    avg_girth_cft:           parseFloat(document.getElementById('sl-girth').value) || null,
    purchase_volume_cbm:     cbm,
    selling_volume_cbm:      sellCbm,
    purchase_price_per_cbm:  ppu,
    sales_price_per_cbm:     spu,
    purchase_value_override: pvOverride || (ppu && cbm ? Math.round(ppu * cbm * 100) / 100 : null),
    sales_value_override:    svOverride || (spu && (sellCbm||cbm) ? Math.round(spu * (sellCbm||cbm) * 100) / 100 : null),
    notes:                   document.getElementById('sl-notes').value.trim() || null,
    updated_at:              new Date().toISOString(),
  }).eq('id', lineId);

  if (error) { alert('Error: ' + error.message); return; }
  closeModal();
  await refreshContracts();
  contractDetail(contractId);
}

async function addShipmentLineModal(contractId) {
  openModal(`
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Add Shipment Line</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group"><label>Container Number</label><input type="text" id="asl-cnum" placeholder="HLCU1234567"></div>
        <div class="form-group"><label>Category</label>
          <select id="asl-category">
            ${['A Grade','B Grade','C Grade','Mixed','Logs','Sawn Timber','Hardwood','Softwood'].map(g => `<option>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>No. of Pieces</label><input type="number" id="asl-pieces" placeholder="250"></div>
        <div class="form-group"><label>Avg Girth (cft)</label><input type="number" id="asl-girth" step="0.01" placeholder="12.5"></div>
        <div class="form-group"><label>Purchase Volume (CBM)</label><input type="number" id="asl-cbm" step="0.001" placeholder="24.232"></div>
        <div class="form-group"><label>Selling Volume (CBM)</label><input type="number" id="asl-mt" step="0.001"></div>
        <div class="form-group"><label>Purchase Price / CBM ($)</label><input type="number" id="asl-ppu" step="0.01" placeholder="620.00"></div>
        <div class="form-group"><label>Sales Price / CBM ($)</label><input type="number" id="asl-spu" step="0.01"></div>
        <div class="form-group"><label>Purchase Value (override)</label><input type="number" id="asl-pv" step="0.01" placeholder="Leave blank to auto-calc"></div>
        <div class="form-group"><label>Sales Value (override)</label><input type="number" id="asl-sv" step="0.01" placeholder="Leave blank to auto-calc"></div>
        <div class="form-group full"><label>Notes</label><textarea id="asl-notes" rows="2"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveAddShipmentLine('${contractId}')">Add Line</button>
    </div>
  </div>`);
}

async function saveAddShipmentLine(contractId) {
  const ppu = parseFloat(document.getElementById('asl-ppu').value) || null;
  const spu = parseFloat(document.getElementById('asl-spu').value) || null;
  const cbm = parseFloat(document.getElementById('asl-cbm').value) || null;
  const pvOverride = parseFloat(document.getElementById('asl-pv').value) || null;
  const svOverride = parseFloat(document.getElementById('asl-sv').value) || null;

  const sellCbmAdd = parseFloat(document.getElementById('asl-mt').value) || null;
  const { error } = await sb.from('shipment_lines').insert({
    contract_id:             contractId,
    company_id:              S.companyId,
    container_number:        document.getElementById('asl-cnum').value.trim() || null,
    timber_category:         document.getElementById('asl-category').value,
    no_of_pieces:            parseInt(document.getElementById('asl-pieces').value) || null,
    avg_girth_cft:           parseFloat(document.getElementById('asl-girth').value) || null,
    purchase_volume_cbm:     cbm,
    selling_volume_cbm:      sellCbmAdd,
    purchase_price_per_cbm:  ppu,
    sales_price_per_cbm:     spu,
    purchase_value_override: pvOverride || (ppu && cbm ? Math.round(ppu * cbm * 100) / 100 : null),
    sales_value_override:    svOverride || (spu && (sellCbmAdd||cbm) ? Math.round(spu * (sellCbmAdd||cbm) * 100) / 100 : null),
    notes:                   document.getElementById('asl-notes').value.trim() || null,
  });

  if (error) { alert('Error: ' + error.message); return; }
  closeModal();
  await refreshContracts();
  contractDetail(contractId);
}

/* ── Payment Modal ── */
async function addPaymentModal(contractId) {
  const c = S.contracts.find(x => x.id === contractId);
  openModal(`
  <div class="modal modal-sm" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Add Payment — ${c?.contract_number || ''}</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Direction *</label>
          <select id="pay-dir">
            <option value="paid_to_supplier">📤 Paid to Supplier</option>
            <option value="received_from_customer">📥 Received from Customer</option>
          </select>
        </div>
        <div class="form-group"><label>Date *</label><input type="date" id="pay-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label>Amount (USD) *</label><input type="number" id="pay-amount" step="0.01" placeholder="50000"></div>
        <div class="form-group"><label>Mode</label>
          <select id="pay-mode">
            <option>Wire Transfer</option><option>LC</option><option>DP</option><option>TT</option><option>Cheque</option><option>Cash</option><option>Other</option>
          </select>
        </div>
        <div class="form-group"><label>Reference</label><input type="text" id="pay-ref" placeholder="UTR / SWIFT ref"></div>
        <div class="form-group full"><label>Notes</label><textarea id="pay-notes" rows="2"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="savePayment('${contractId}')">Save Payment</button>
    </div>
  </div>`);
}

async function savePayment(contractId) {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const date   = document.getElementById('pay-date').value;
  if (!amount || isNaN(amount)) { alert('Amount is required'); return; }
  if (!date) { alert('Date is required'); return; }

  const { error } = await sb.from('payments').insert({
    contract_id:    contractId,
    company_id:     S.companyId,
    direction:      document.getElementById('pay-dir').value,
    payment_date:   date,
    amount,
    payment_mode:   document.getElementById('pay-mode').value,
    mode_reference: document.getElementById('pay-ref').value.trim() || null,
    notes:          document.getElementById('pay-notes').value.trim() || null,
  });

  if (error) { alert('Error: ' + error.message); return; }

  // Reload payments into state
  const { data: allPayments } = await sb.from('payments').select('*').eq('company_id', S.companyId).order('payment_date', { ascending: false });
  S.payments = allPayments || [];

  closeModal();
  await refreshContracts();
  contractDetail(contractId);
}

/* ── New Contract Modal ── */
function newContractModal() {
  const supplierOptions = S.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  const customerOptions = S.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const countryOptions  = S.countries.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const loadPortOptions = S.ports.filter(p => p.is_load_port).map(p => `<option value="${p.id}">${p.display_name}</option>`).join('');
  const dischPortOptions= S.ports.filter(p => p.is_discharge_port).map(p => `<option value="${p.id}">${p.display_name}</option>`).join('');

  openModal(`
  <div class="modal modal-lg" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">New Contract</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">

      <div class="section-divider">Contract Info</div>
      <div class="form-grid">
        <div class="form-group"><label>Contract Number *</label><input type="text" id="nc-number" placeholder="2024-01-001"></div>
        <div class="form-group"><label>Deal Date</label><input type="date" id="nc-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label>Product / Commodity *</label><input type="text" id="nc-product" placeholder="Hardwood Logs / Sawn Timber"></div>
        <div class="form-group"><label>Grade / Spec</label><input type="text" id="nc-grade" placeholder="A Grade, 50-70cm girth"></div>
        <div class="form-group"><label>Legacy Reference</label><input type="text" id="nc-legacy" placeholder="Old PO / ref number"></div>
        <div class="form-group"><label>Status</label>
          <select id="nc-status">
            <option value="open">Open</option>
            <option value="shipped">Shipped</option>
            <option value="arrived">Arrived</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div class="section-divider">Purchase</div>
      <div class="form-grid">
        <div class="form-group"><label>Supplier</label>
          <select id="nc-supplier"><option value="">— Select —</option>${supplierOptions}</select>
        </div>
        <div class="form-group"><label>Country of Origin</label>
          <select id="nc-origin"><option value="">— Select —</option>${countryOptions}</select>
        </div>
        <div class="form-group"><label>Purchase Incoterm</label>
          <select id="nc-incoterm"><option>CNF</option><option>FOB</option><option>CFR</option><option>CIF</option></select>
        </div>
        <div class="form-group"><label>Payment Terms</label>
          <select id="nc-pterms">
            <option>LC at sight</option><option>DP 30 days</option><option>DP 60 days</option><option>TT Advance</option><option>TT before BL</option><option>Open Account</option>
          </select>
        </div>
        <div class="form-group"><label>Purchase Value (USD) *</label><input type="number" id="nc-pvalue" step="0.01" placeholder="500000"></div>
        <div class="form-group"><label>Container Count</label><input type="number" id="nc-ctrs" placeholder="20"></div>
        <div class="form-group"><label>Payable Due Date</label><input type="date" id="nc-paydue"></div>
      </div>

      <div class="section-divider">Shipping</div>
      <div class="form-grid">
        <div class="form-group"><label>BL Number</label><input type="text" id="nc-bl" placeholder="HLCU123456789"></div>
        <div class="form-group"><label>Shipping Line</label><input type="text" id="nc-shline" placeholder="Hapag-Lloyd"></div>
        <div class="form-group"><label>Vessel Name</label><input type="text" id="nc-vessel" placeholder="MV Ever Given"></div>
        <div class="form-group"><label>Load Port</label>
          <select id="nc-loadport"><option value="">— Select —</option>${loadPortOptions}</select>
        </div>
        <div class="form-group"><label>Discharge Port</label>
          <select id="nc-discport"><option value="">— Select —</option>${dischPortOptions}</select>
        </div>
        <div class="form-group"><label>Sailing Date</label><input type="date" id="nc-sail"></div>
        <div class="form-group"><label>Arrival Date (ETA)</label><input type="date" id="nc-eta"></div>
        <div class="form-group"><label>Free Days</label><input type="number" id="nc-freedays" placeholder="21"></div>
        <div class="form-group"><label>Daily Detention Rate ($/ctr)</label><input type="number" id="nc-detrate" placeholder="30" step="0.01"></div>
      </div>

      <div class="section-divider">Costs</div>
      <div class="form-grid">
        <div class="form-group"><label>Freight ($)</label><input type="number" id="nc-freight" step="0.01" placeholder="0"></div>
        <div class="form-group"><label>Insurance ($)</label><input type="number" id="nc-insurance" step="0.01" placeholder="0"></div>
        <div class="form-group"><label>Documentation ($)</label><input type="number" id="nc-docs" step="0.01" placeholder="0"></div>
        <div class="form-group"><label>Payment Charges ($)</label><input type="number" id="nc-paych" step="0.01" placeholder="0"></div>
        <div class="form-group"><label>Commission (%)</label><input type="number" id="nc-comm" step="0.01" placeholder="0" oninput="calcCommission()"></div>
        <div class="form-group"><label>Commission Value ($)</label><input type="number" id="nc-commval" step="0.01" placeholder="auto-calc"></div>
        <div class="form-group"><label>Demurrage ($)</label><input type="number" id="nc-demurrage" step="0.01" placeholder="0"></div>
        <div class="form-group"><label>Other Costs ($)</label><input type="number" id="nc-other" step="0.01" placeholder="0"></div>
      </div>

      <div class="section-divider">Sales</div>
      <div class="form-grid">
        <div class="form-group"><label>Customer / Buyer</label>
          <select id="nc-customer"><option value="">— No buyer yet —</option>${customerOptions}</select>
        </div>
        <div class="form-group"><label>Sales Value (USD)</label><input type="number" id="nc-svalue" step="0.01" placeholder="Leave blank until buyer confirmed"></div>
        <div class="form-group"><label>Sales Incoterm</label>
          <select id="nc-sincoterm"><option>CNF</option><option>FOB</option><option>CFR</option><option>CIF</option><option>DAP</option></select>
        </div>
        <div class="form-group"><label>Sales Payment Terms</label>
          <select id="nc-sterms">
            <option>LC at sight (15d before arrival)</option><option>DP</option><option>TT Advance</option><option>Open Account</option>
          </select>
        </div>
        <div class="form-group"><label>Sales Invoice Number</label><input type="text" id="nc-invno" placeholder="INV-2024-001"></div>
        <div class="form-group"><label>Sales Invoice Date</label><input type="date" id="nc-invdate"></div>
        <div class="form-group"><label>Receivable Due Date</label><input type="date" id="nc-recdue"></div>
        <div class="form-group full"><label>Notes</label><textarea id="nc-notes" rows="2"></textarea></div>
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveNewContract()">Save Contract</button>
    </div>
  </div>`);
}

function calcCommission() {
  const pv   = parseFloat(document.getElementById('nc-pvalue')?.value) || 0;
  const pct  = parseFloat(document.getElementById('nc-comm')?.value)   || 0;
  const valEl = document.getElementById('nc-commval');
  if (valEl && pct > 0 && pv > 0) {
    valEl.value = Math.round(pv * pct / 100 * 100) / 100;
  }
}

async function saveNewContract() {
  const number = document.getElementById('nc-number').value.trim();
  const pvalue = parseFloat(document.getElementById('nc-pvalue').value);

  if (!number) { alert('Contract number is required'); return; }
  if (!pvalue || isNaN(pvalue)) { alert('Purchase value is required'); return; }

  const commPct = parseFloat(document.getElementById('nc-comm').value) || null;
  const commVal = parseFloat(document.getElementById('nc-commval').value) || (commPct ? pvalue * commPct / 100 : null);
  const svalue  = parseFloat(document.getElementById('nc-svalue').value) || null;
  const custId  = document.getElementById('nc-customer').value || null;

  const { data, error } = await sb.from('contracts').insert({
    company_id:          S.companyId,
    contract_number:     number,
    deal_date:           document.getElementById('nc-date').value || null,
    product:             document.getElementById('nc-product').value.trim() || null,
    grade_spec:          document.getElementById('nc-grade').value.trim() || null,
    legacy_reference:    document.getElementById('nc-legacy').value.trim() || null,
    status:              document.getElementById('nc-status').value,
    supplier_id:         document.getElementById('nc-supplier').value || null,
    country_of_origin_id: document.getElementById('nc-origin').value || null,
    purchase_incoterm:   document.getElementById('nc-incoterm').value,
    purchase_payment_terms: document.getElementById('nc-pterms').value,
    payable_due_date:    document.getElementById('nc-paydue').value || null,
    bl_number:           document.getElementById('nc-bl').value.trim() || null,
    shipping_line:       document.getElementById('nc-shline').value.trim() || null,
    vessel_name:         document.getElementById('nc-vessel').value.trim() || null,
    load_port_id:        document.getElementById('nc-loadport').value || null,
    discharge_port_id:   document.getElementById('nc-discport').value || null,
    sailing_date:        document.getElementById('nc-sail').value || null,
    arrival_date:        document.getElementById('nc-eta').value || null,
    free_days:           parseInt(document.getElementById('nc-freedays').value) || null,
    freight:             parseFloat(document.getElementById('nc-freight').value) || null,
    insurance:           parseFloat(document.getElementById('nc-insurance').value) || null,
    documentation_charges: parseFloat(document.getElementById('nc-docs').value) || null,
    payment_charges:     parseFloat(document.getElementById('nc-paych').value) || null,
    commission_pct:      commPct,
    demurrage:           parseFloat(document.getElementById('nc-demurrage').value) || null,
    other_costs:         parseFloat(document.getElementById('nc-other').value) || null,
    customer_id:         custId,
    sales_incoterm:      document.getElementById('nc-sincoterm').value,
    sales_payment_terms: document.getElementById('nc-sterms').value,
    sales_invoice_number: document.getElementById('nc-invno').value.trim() || null,
    sales_invoice_date:  document.getElementById('nc-invdate').value || null,
    receivable_due_date: document.getElementById('nc-recdue').value || null,
    notes:               document.getElementById('nc-notes').value.trim() || null,
  }).select().single();

  if (error) { alert('Error saving contract: ' + error.message); return; }

  await refreshContracts();
  closeModal();
  contracts();
}

/* ── Edit Contract Modal ── */
async function editContractModal(id) {
  const { data: c } = await sb.from('contracts').select('*').eq('id', id).eq('company_id', S.companyId).single();
  if (!c) return;

  const supplierOptions = S.suppliers.map(s => `<option value="${s.id}" ${s.id===c.supplier_id?'selected':''}>${s.name}</option>`).join('');
  const customerOptions = S.customers.map(cu => `<option value="${cu.id}" ${cu.id===c.customer_id?'selected':''}>${cu.name}</option>`).join('');
  const countryOptions  = S.countries.map(co => `<option value="${co.id}" ${co.id===c.origin_country_id?'selected':''}>${co.name}</option>`).join('');
  const loadPortOptions = S.ports.filter(p => p.is_load_port).map(p => `<option value="${p.id}" ${p.id===c.load_port_id?'selected':''}>${p.display_name}</option>`).join('');
  const dischPortOptions= S.ports.filter(p => p.is_discharge_port).map(p => `<option value="${p.id}" ${p.id===c.discharge_port_id?'selected':''}>${p.display_name}</option>`).join('');

  function sel(id, val) { return id === val ? ' selected' : ''; }
  function v(val) { return val !== null && val !== undefined ? val : ''; }

  openModal(`
  <div class="modal modal-lg" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Edit Contract — ${c.contract_number}</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">

      <div class="section-divider">Contract Info</div>
      <div class="form-grid">
        <div class="form-group"><label>Contract Number *</label><input type="text" id="ec-number" value="${v(c.contract_number)}"></div>
        <div class="form-group"><label>Deal Date</label><input type="date" id="ec-date" value="${v(c.deal_date)}"></div>
        <div class="form-group"><label>Product *</label><input type="text" id="ec-product" value="${v(c.product)}"></div>
        <div class="form-group"><label>Grade / Spec</label><input type="text" id="ec-grade" value="${v(c.grade_spec)}"></div>
        <div class="form-group"><label>Legacy Reference</label><input type="text" id="ec-legacy" value="${v(c.legacy_reference)}"></div>
        <div class="form-group"><label>Status</label>
          <select id="ec-status">
            ${['open','shipped','arrived','closed','cancelled'].map(s => `<option value="${s}"${sel(s,c.status)}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="section-divider">Purchase</div>
      <div class="form-grid">
        <div class="form-group"><label>Supplier</label>
          <select id="ec-supplier"><option value="">— Select —</option>${supplierOptions}</select>
        </div>
        <div class="form-group"><label>Country of Origin</label>
          <select id="ec-origin"><option value="">— Select —</option>${countryOptions}</select>
        </div>
        <div class="form-group"><label>Purchase Incoterm</label>
          <select id="ec-incoterm">
            ${['CNF','FOB','CFR','CIF'].map(t => `<option${sel(t,c.purchase_incoterm)}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Payment Terms</label>
          <select id="ec-pterms">
            ${['LC at sight','DP 30 days','DP 60 days','TT Advance','TT before BL','Open Account'].map(t => `<option${sel(t,c.purchase_payment_terms)}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Purchase Value (USD) *</label><input type="number" id="ec-pvalue" value="${v(c.purchase_value)}" step="0.01"></div>
        <div class="form-group"><label>Container Count</label><input type="number" id="ec-ctrs" value="${v(c.container_count)}"></div>
        <div class="form-group"><label>Payable Due Date</label><input type="date" id="ec-paydue" value="${v(c.payable_due_date)}"></div>
      </div>

      <div class="section-divider">Shipping</div>
      <div class="form-grid">
        <div class="form-group"><label>BL Number</label><input type="text" id="ec-bl" value="${v(c.bl_number)}"></div>
        <div class="form-group"><label>Shipping Line</label><input type="text" id="ec-shline" value="${v(c.shipping_line)}"></div>
        <div class="form-group"><label>Vessel Name</label><input type="text" id="ec-vessel" value="${v(c.vessel_name)}"></div>
        <div class="form-group"><label>Load Port</label>
          <select id="ec-loadport"><option value="">— Select —</option>${loadPortOptions}</select>
        </div>
        <div class="form-group"><label>Discharge Port</label>
          <select id="ec-discport"><option value="">— Select —</option>${dischPortOptions}</select>
        </div>
        <div class="form-group"><label>Sailing Date</label><input type="date" id="ec-sail" value="${v(c.sailing_date)}"></div>
        <div class="form-group"><label>Arrival Date (ETA)</label><input type="date" id="ec-eta" value="${v(c.arrival_date)}"></div>
        <div class="form-group"><label>Free Days</label><input type="number" id="ec-freedays" value="${v(c.free_days)}"></div>
        <div class="form-group"><label>Daily Detention Rate ($/ctr)</label><input type="number" id="ec-detrate" value="${v(c.daily_detention_rate)}" step="0.01"></div>
        <div class="form-group"><label>Containers Returned Date</label><input type="date" id="ec-retdate" value="${v(c.containers_returned_date)}"></div>
      </div>

      <div class="section-divider">Costs</div>
      <div class="form-grid">
        <div class="form-group"><label>Freight ($)</label><input type="number" id="ec-freight" value="${v(c.freight)}" step="0.01"></div>
        <div class="form-group"><label>Insurance ($)</label><input type="number" id="ec-insurance" value="${v(c.insurance)}" step="0.01"></div>
        <div class="form-group"><label>Documentation ($)</label><input type="number" id="ec-docs" value="${v(c.documentation_charges)}" step="0.01"></div>
        <div class="form-group"><label>Payment Charges ($)</label><input type="number" id="ec-paych" value="${v(c.payment_charges)}" step="0.01"></div>
        <div class="form-group"><label>Commission (%)</label><input type="number" id="ec-comm" value="${v(c.commission_pct)}" step="0.01"></div>
        <div class="form-group"><label>Commission Value ($)</label><input type="number" id="ec-commval" value="${v(c.commission_value)}" step="0.01"></div>
        <div class="form-group"><label>Demurrage ($)</label><input type="number" id="ec-demurrage" value="${v(c.demurrage)}" step="0.01"></div>
        <div class="form-group"><label>Other Costs ($)</label><input type="number" id="ec-other" value="${v(c.other_costs)}" step="0.01"></div>
      </div>

      <div class="section-divider">Sales</div>
      <div class="form-grid">
        <div class="form-group"><label>Customer / Buyer</label>
          <select id="ec-customer"><option value="">— No buyer yet —</option>${customerOptions}</select>
        </div>
        <div class="form-group"><label>Sales Value (USD)</label><input type="number" id="ec-svalue" value="${v(c.sales_value)}" step="0.01"></div>
        <div class="form-group"><label>Sales Incoterm</label>
          <select id="ec-sincoterm">
            ${['CNF','FOB','CFR','CIF','DAP'].map(t => `<option${sel(t,c.incoterm)}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Sales Payment Terms</label>
          <select id="ec-sterms">
            ${['LC at sight (15d before arrival)','DP','TT Advance','Open Account'].map(t => `<option${sel(t,c.sales_payment_terms)}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Sales Invoice Number</label><input type="text" id="ec-invno" value="${v(c.sales_invoice_number)}"></div>
        <div class="form-group"><label>Sales Invoice Date</label><input type="date" id="ec-invdate" value="${v(c.sales_invoice_date)}"></div>
        <div class="form-group"><label>Receivable Due Date</label><input type="date" id="ec-recdue" value="${v(c.receivable_due_date)}"></div>
        <div class="form-group full"><label>Notes</label><textarea id="ec-notes" rows="2">${v(c.notes)}</textarea></div>
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveEditContract('${id}')">Save Changes</button>
    </div>
  </div>`);
}

async function saveEditContract(id) {
  const number = document.getElementById('ec-number').value.trim();
  const pvalue = parseFloat(document.getElementById('ec-pvalue').value);
  if (!number) { alert('Contract number is required'); return; }
  if (!pvalue || isNaN(pvalue)) { alert('Purchase value is required'); return; }

  const commPct = parseFloat(document.getElementById('ec-comm').value) || null;
  const commVal = parseFloat(document.getElementById('ec-commval').value) || (commPct ? pvalue * commPct / 100 : null);

  const { error } = await sb.from('contracts').update({
    contract_number:     number,
    deal_date:           document.getElementById('ec-date').value || null,
    product:             document.getElementById('ec-product').value.trim() || null,
    grade_spec:          document.getElementById('ec-grade').value.trim() || null,
    legacy_reference:    document.getElementById('ec-legacy').value.trim() || null,
    status:              document.getElementById('ec-status').value,
    supplier_id:         document.getElementById('ec-supplier').value || null,
    country_of_origin_id: document.getElementById('ec-origin').value || null,
    purchase_incoterm:   document.getElementById('ec-incoterm').value,
    purchase_payment_terms: document.getElementById('ec-pterms').value,
    payable_due_date:    document.getElementById('ec-paydue').value || null,
    bl_number:           document.getElementById('ec-bl').value.trim() || null,
    shipping_line:       document.getElementById('ec-shline').value.trim() || null,
    vessel_name:         document.getElementById('ec-vessel').value.trim() || null,
    load_port_id:        document.getElementById('ec-loadport').value || null,
    discharge_port_id:   document.getElementById('ec-discport').value || null,
    sailing_date:        document.getElementById('ec-sail').value || null,
    arrival_date:        document.getElementById('ec-eta').value || null,
    free_days:           parseInt(document.getElementById('ec-freedays').value) || null,
    containers_returned_date: document.getElementById('ec-retdate').value || null,
    freight:             parseFloat(document.getElementById('ec-freight').value) || null,
    insurance:           parseFloat(document.getElementById('ec-insurance').value) || null,
    documentation_charges: parseFloat(document.getElementById('ec-docs').value) || null,
    payment_charges:     parseFloat(document.getElementById('ec-paych').value) || null,
    commission_pct:      commPct,
    demurrage:           parseFloat(document.getElementById('ec-demurrage').value) || null,
    other_costs:         parseFloat(document.getElementById('ec-other').value) || null,
    customer_id:         document.getElementById('ec-customer').value || null,
    sales_incoterm:      document.getElementById('ec-sincoterm').value,
    sales_payment_terms: document.getElementById('ec-sterms').value,
    sales_invoice_number: document.getElementById('ec-invno').value.trim() || null,
    sales_invoice_date:  document.getElementById('ec-invdate').value || null,
    receivable_due_date: document.getElementById('ec-recdue').value || null,
    notes:               document.getElementById('ec-notes').value.trim() || null,
    updated_at:          new Date().toISOString(),
  }).eq('id', id);

  if (error) { alert('Error: ' + error.message); return; }
  await refreshContracts();
  closeModal();
  contractDetail(id);
}

/* ── Print Functions ── */
function printContract(contractId) {
  // Find the contract from either the passed id or contract number
  const c = S.contracts.find(x => x.id === contractId) || S.contracts.find(x => x.contract_number === contractId);
  if (!c) return;

  const co = S.company || {};
  const logoHtml = co.logo_url
    ? `<img src="${co.logo_url}" style="height:40px;object-fit:contain">`
    : `<div style="width:40px;height:40px;border-radius:8px;background:#0B4F6C;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff">${(co.name||'C').substring(0,1)}</div>`;

  const advancePaid     = (+c.advance_paid||0);
  const advanceReceived = (+c.advance_received||0);
  const purchaseBalance = (+c.purchase_value||0) - advancePaid;
  const salesBalance    = (+c.sales_value||0) - advanceReceived;
  const totalCosts      = (+c.purchase_value||0)+(+c.freight||0)+(+c.insurance||0)+(+c.documentation_charges||0)+(+c.payment_charges||0)+(+c.demurrage||0)+(+c.commission_value||0)+(+c.other_costs||0);
  const netMargin       = (+c.sales_value||0) - totalCosts;
  const netMarginPct    = (+c.sales_value||0) > 0 ? (netMargin / (+c.sales_value||1) * 100) : 0;

  const usd = v => v == null || v === '' ? '—' : '$' + Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const dt  = v => { if (!v) return '—'; const d = new Date(v); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); };
  const row = (l,v) => `<tr><td style="color:#64748b;padding:5px 0;font-size:12px;width:48%">${l}</td><td style="font-size:12px;font-weight:500;text-align:right">${v}</td></tr>`;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
  <title>${c.contract_number} — ${c.product||''}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:20px}
    .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid #0B4F6C;margin-bottom:16px}
    .co-name{font-size:16px;font-weight:700;color:#0B4F6C}
    .co-addr{font-size:11px;color:#64748b}
    .doc-title{font-size:15px;font-weight:700;text-align:right}
    .doc-sub{font-size:11px;color:#64748b;text-align:right}
    .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
    .kpi.navy{border-left:3px solid #0B4F6C}
    .kpi.teal{border-left:3px solid #0E6D94}
    .kpi.green{border-left:3px solid #059669}
    .kpi.amber{border-left:3px solid #d97706}
    .kpi-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
    .kpi-value{font-size:16px;font-weight:700;margin:2px 0}
    .kpi-sub{font-size:10px;color:#94a3b8}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
    .card{border:1px solid #e2e8f0;border-radius:6px;padding:12px}
    .card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#0B4F6C;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
    table{width:100%;border-collapse:collapse}
    .section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#0B4F6C;padding:8px 0 4px;border-bottom:1px solid #0B4F6C;margin-bottom:8px}
    .data-table td,.data-table th{padding:5px 8px;font-size:11px;border-bottom:1px solid #f1f5f9}
    .data-table th{background:#f8fafc;font-weight:600;color:#475569}
    .data-table td.num{text-align:right}
    .footer{margin-top:16px;font-size:10px;color:#94a3b8;text-align:right}
    @page{size:A4 portrait;margin:12mm 14mm}
    @media print{
      html,body{height:auto!important;overflow:visible!important;scroll-behavior:auto}
      .grid2{display:block}
      .card{page-break-inside:avoid;margin-bottom:12px}
      .kpi-row{display:grid;grid-template-columns:repeat(4,1fr)}
    }
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
      <div class="doc-title">Contract ${c.contract_number||''} — ${c.product||''}</div>
      <div class="doc-sub">Status: ${(c.status||'').toUpperCase()} &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi navy"><div class="kpi-label">Purchase Value</div><div class="kpi-value">${usd(c.purchase_value)}</div><div class="kpi-sub">${c.purchase_payment_terms||'—'}</div></div>
    <div class="kpi teal"><div class="kpi-label">Sales Value</div><div class="kpi-value">${usd(c.sales_value)}</div><div class="kpi-sub">${c.sales_payment_terms||'—'}</div></div>
    <div class="kpi ${netMargin>=0?'green':'amber'}"><div class="kpi-label">Net Margin</div><div class="kpi-value">${usd(netMargin)}</div><div class="kpi-sub">${netMarginPct.toFixed(1)}%</div></div>
    <div class="kpi amber"><div class="kpi-label">Capital at Risk</div><div class="kpi-value">${usd(advancePaid>advanceReceived?advancePaid-advanceReceived:0)}</div><div class="kpi-sub">Out − received back</div></div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">Purchase</div>
      <table><tbody>
        ${row('Supplier', c.supplier_name||'—')}
        ${row('Country of Origin', c.country_of_origin||'—')}
        ${row('Incoterm', c.purchase_incoterm||'—')}
        ${row('Payment Terms', c.purchase_payment_terms||'—')}
        ${row('Purchase Value', usd(c.purchase_value))}
        ${row('Advance Paid', usd(c.advance_paid))}
        ${row('Balance Payable', usd(purchaseBalance))}
        ${row('Payable Due', dt(c.payable_due_date))}
        ${row('BL Number', c.bl_number||'—')}
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-title">Sales</div>
      <table><tbody>
        ${row('Buyer', c.customer_name||'—')}
        ${row('Payment Terms', c.sales_payment_terms||'—')}
        ${row('Sales Value', usd(c.sales_value))}
        ${row('Advance Received', usd(c.advance_received))}
        ${row('Balance Receivable', usd(salesBalance))}
        ${row('Receivable Due', dt(c.receivable_due_date))}
        ${row('Invoice Number', c.sales_invoice_number||'—')}
        ${row('Invoice Date', dt(c.sales_invoice_date))}
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-title">Shipping</div>
      <table><tbody>
        ${row('Vessel', c.vessel_name||'—')}
        ${row('Shipping Line', c.shipping_line||'—')}
        ${row('Load Port', c.load_port_display||'—')}
        ${row('Discharge Port', c.discharge_port_display||'—')}
        ${row('Sailing Date', dt(c.sailing_date))}
        ${row('Arrival (ETA)', dt(c.arrival_date))}
        ${row('Containers', c.container_count ? c.container_count + ' × 40HC' : '—')}
        ${row('Free Days', c.free_days ? c.free_days + ' days' : '—')}
        ${row('Container Return', dt(c.containers_returned_date))}
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-title">Costs</div>
      <table><tbody>
        ${row('Freight', usd(c.freight))}
        ${row('Insurance', usd(c.insurance))}
        ${row('Documentation', usd(c.documentation_charges))}
        ${row('Payment Charges', usd(c.payment_charges))}
        ${row('Commission', c.commission_pct ? c.commission_pct+'% = '+usd(c.commission_value) : usd(c.commission_value))}
        ${row('Demurrage', usd(c.demurrage))}
        ${row('Other Costs', usd(c.other_costs))}
        <tr style="border-top:2px solid #0B4F6C"><td style="font-size:12px;font-weight:700;padding-top:6px">Total Costs</td><td style="font-size:12px;font-weight:700;text-align:right;padding-top:6px">${usd(totalCosts)}</td></tr>
      </tbody></table>
    </div>
  </div>

  <div class="footer">Generated by Cargaria &nbsp;·&nbsp; ${new Date().toLocaleString()}</div>
  <script>window.onload=()=>{ document.documentElement.scrollTop=0; document.body.scrollTop=0; setTimeout(()=>window.print(),200); };</scr`+`ipt></body></html>`);
  win.document.close();
}

function printCostSheet(contractId) {
  const c = S.contracts.find(x => x.id === contractId);
  if (!c) return;
  const totalCost = (+c.purchase_value||0)+(+c.freight||0)+(+c.insurance||0)+(+c.documentation_charges||0)+(+c.payment_charges||0)+(+c.demurrage||0)+(+c.commission_value||0)+(+c.other_costs||0);
  const rows = [
    ['FOB / Purchase Value', c.purchase_value],
    ['Freight', c.freight],
    ['Insurance', c.insurance],
    ['Documentation charges', c.documentation_charges],
    ['Payment charges', c.payment_charges],
    ['Demurrage / Detention', c.demurrage],
    ['Commission', c.commission_value],
    ['Other costs', c.other_costs],
  ];
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Cost Sheet – ${c.product||''} ${c.contract_number||''}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:40px;color:#1e293b}
    h2{color:#0B4F6C;margin-bottom:4px}
    .sub{color:#64748b;font-size:13px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#0B4F6C;color:#fff;padding:8px 12px;text-align:left;font-size:12px}
    td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}
    .total{font-weight:700;background:#f8fafc}
    @media print{body{margin:20px}}
  </style></head><body>
  <h2>Cost Sheet — ${c.product||'Commodity'}</h2>
  <div class="sub">Contract ${c.contract_number||''} &nbsp;|&nbsp; Supplier: ${c.supplier_name||'—'} &nbsp;|&nbsp; Customer: ${c.customer_name||'—'}</div>
  <table>
    <tr><th>Cost Component</th><th style="text-align:right">Amount (USD)</th></tr>
    ${rows.filter(([,v]) => +v > 0).map(([l,v]) => `<tr><td>${l}</td><td style="text-align:right">${Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`).join('')}
    <tr class="total"><td>Total Landed Cost</td><td style="text-align:right">${totalCost.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
  </table>
  <table>
    <tr><th>Revenue & Margin</th><th style="text-align:right">Amount (USD)</th></tr>
    <tr><td>Sales Value</td><td style="text-align:right">${Number(c.sales_value||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
    <tr><td>Total Landed Cost</td><td style="text-align:right">${totalCost.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
    <tr class="total" style="color:${(+c.sales_value||0)-totalCost>=0?'#059669':'#dc2626'}"><td>Net Margin</td><td style="text-align:right">${((+c.sales_value||0)-totalCost).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
  </table>
  <div style="color:#64748b;font-size:11px;margin-top:24px">Printed: ${new Date().toLocaleString()}</div>
  <script>window.onload=()=>window.print();</scr`+`ipt></body></html>`);
  win.document.close();
}

function printBuyerInvoice(contractId) {
  const c = S.contracts.find(x => x.id === contractId);
  if (!c) return;
  const co = S.company || {};
  const lines = (S._shipmentLinesCache && S._shipmentLinesCache[contractId]) || [];
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${c.sales_invoice_number||''}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:40px;color:#1e293b;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .logo{font-size:22px;font-weight:800;color:#0B4F6C}
    .inv-no{font-size:28px;font-weight:800;color:#0B4F6C;margin-bottom:8px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
    .party-box{border:1px solid #e2e8f0;border-radius:8px;padding:16px}
    .party-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:6px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#0B4F6C;color:#fff;padding:8px 12px;text-align:left;font-size:11px}
    td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
    .total-row{font-weight:700;border-top:2px solid #0B4F6C}
    .terms{background:#f8fafc;border-radius:8px;padding:16px;font-size:12px;color:#64748b;margin-top:16px}
    @media print{body{margin:20px}}
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo">${co.name||'Your Company'}</div>
      <div style="color:#64748b;font-size:12px">${co.address||''}</div>
      ${co.tax_number?`<div style="color:#64748b;font-size:12px">Tax/GST: ${co.tax_number}</div>`:''}
    </div>
    <div style="text-align:right">
      <div class="inv-no">INVOICE</div>
      <div style="color:#64748b"># ${c.sales_invoice_number||'—'}</div>
      <div style="color:#64748b">Date: ${c.sales_invoice_date||'—'}</div>
      <div style="margin-top:8px;padding:8px 16px;background:#0B4F6C;color:#fff;border-radius:6px;display:inline-block">Due: ${c.receivable_due_date||'As per terms'}</div>
    </div>
  </div>
  <div class="parties">
    <div class="party-box"><div class="party-label">From (Seller)</div><strong>${co.name||'—'}</strong><br><span style="color:#64748b">${co.address||''}</span></div>
    <div class="party-box"><div class="party-label">To (Buyer)</div><strong>${c.customer_name||'—'}</strong></div>
  </div>
  <table>
    <tr><th>Description</th><th>Quantity</th><th>Unit Price</th><th style="text-align:right">Amount (USD)</th></tr>
    ${lines.length > 0
      ? lines.map(l => {
          const sVal = l.sales_value_override || (l.selling_volume_cbm && l.sales_price_per_cbm ? l.selling_volume_cbm * l.sales_price_per_cbm : null);
          return `<tr><td>${l.container_number||'Container'}</td><td>${l.no_of_pieces?l.no_of_pieces+' pcs':''} ${l.purchase_volume_cbm?'/ '+l.purchase_volume_cbm+' CBM':''}</td><td>${l.sales_price_per_cbm?'$'+Number(l.sales_price_per_cbm).toFixed(2)+'/CBM':'—'}</td><td style="text-align:right">${sVal?'$'+Number(sVal).toLocaleString('en-US',{minimumFractionDigits:2}):'—'}</td></tr>`;
        }).join('')
      : `<tr><td colspan="3">${c.product||'—'}</td><td style="text-align:right"></td></tr>`}
    <tr class="total-row"><td colspan="3">Total</td><td style="text-align:right">USD ${Number(c.sales_value||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
  </table>
  <div class="terms">
    <strong>Payment Terms:</strong> ${c.sales_payment_terms||'—'} &nbsp;|&nbsp;
    <strong>BL:</strong> ${c.bl_number||'—'} &nbsp;|&nbsp;
    <strong>Vessel:</strong> ${c.vessel_name||'—'}
    ${c.notes?`<br><strong>Notes:</strong> ${c.notes}`:''}
  </div>
  <div style="color:#94a3b8;font-size:11px;margin-top:24px;text-align:center">Computer-generated invoice.</div>
  <scr`+`ipt>window.onload=()=>window.print();</scr`+`ipt></body></html>`);
  win.document.close();
}

/* ── ETA Reminder ── */
function checkEtaReminder() {
  const todayKey = new Date().toISOString().slice(0,10);
  if (localStorage.getItem('eta_reminder_date') === todayKey) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const inTransit = S.contracts.filter(c =>
    c.sailing_date && c.arrival_date &&
    !['closed','cancelled'].includes(c.status) &&
    new Date(c.arrival_date) >= today
  );
  if (!inTransit.length) return;

  localStorage.setItem('eta_reminder_date', todayKey);

  window._etaContracts = inTransit.map(c => ({ id: c.id, eta: c.arrival_date }));

  openModal(`
  <div class="modal modal-lg" onclick="event.stopPropagation()">
    <div class="modal-header" style="background:var(--amber-lt)">
      <div>
        <div class="modal-title">📅 Daily ETA Check — ${inTransit.length} consignment${inTransit.length > 1 ? 's' : ''} on water</div>
        <div class="text-sm text-muted" style="margin-top:4px">Review and update ETAs if they have changed.</div>
      </div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="padding:0">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Contract</th><th>Product</th><th>Vessel</th><th>Supplier</th>
          <th>Current ETA</th><th>Days Left</th><th>Update ETA</th>
        </tr></thead>
        <tbody>
          ${inTransit.map(c => {
            const daysLeft = Math.round((new Date(c.arrival_date) - new Date()) / 86400000);
            return `<tr>
              <td><strong>${c.contract_number}</strong></td>
              <td>${c.product}</td>
              <td>${c.vessel_name||'—'}</td>
              <td>${c.supplier_name||'—'}</td>
              <td>${fmt.date(c.arrival_date)}</td>
              <td>${daysLeft >= 0 ? 'in ' + daysLeft + 'd' : Math.abs(daysLeft) + 'd ago'}</td>
              <td><input type="date" id="eta-${c.id}" value="${c.arrival_date}"
                style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="modal-footer">
      <span class="text-sm text-muted" style="margin-right:auto">Changes only saved for dates you modify</span>
      <button class="btn" onclick="closeModal()">Skip for today</button>
      <button class="btn btn-cta" onclick="saveEtaUpdates(window._etaContracts)">Save Changes</button>
    </div>
  </div>`);
}

async function saveEtaUpdates(originals) {
  let updated = 0;
  for (const orig of originals) {
    const input = document.getElementById('eta-' + orig.id);
    if (!input || !input.value) continue;
    const { error } = await sb.from('contracts').update({
      arrival_date: input.value, updated_at: new Date().toISOString()
    }).eq('id', orig.id);
    if (!error) {
      const c = S.contracts.find(x => x.id === orig.id);
      if (c) c.arrival_date = input.value;
      updated++;
    }
  }
  closeModal();
  if (updated > 0) {
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;top:70px;right:24px;z-index:300;background:var(--green);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500';
    b.textContent = `✓ ${updated} ETA${updated > 1 ? 's' : ''} updated`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 3000);
  }
  setTimeout(checkContainerReturns, 1500);
}

/* ── Container Return Helpers ── */
window._crSaveNoDate   = btn => saveContainerReturn(btn.getAttribute('data-cid'), null);
window._crSaveWithDate = btn => { const d = document.getElementById('return-date-input'); saveContainerReturn(btn.getAttribute('data-cid'), d ? d.value : null); };
window._crConfirm      = btn => confirmContainerReturn(btn.getAttribute('data-cid'), btn.getAttribute('data-cnum'));
window._crSnooze       = btn => snoozeContainerReturn(btn.getAttribute('data-cid'));

function checkContainerReturns() {
  const todayKey = new Date().toISOString().slice(0,10);
  const pending = S.contracts.filter(c => {
    if (!c.free_days || !c.arrival_date) return false;
    if (['closed','cancelled'].includes(c.status)) return false;
    if (c.containers_returned_date) return false;
    if (new Date(c.arrival_date) > new Date()) return false;
    try { return localStorage.getItem('return_snoozed_' + c.id) !== todayKey; } catch(e) { return true; }
  });
  if (!pending.length) return;

  openModal(`
  <div class="modal" onclick="event.stopPropagation()" style="max-width:700px">
    <div class="modal-header" style="background:var(--teal-light)">
      <div>
        <div class="modal-title">📦 Empty Container Return Check</div>
        <div class="text-sm text-muted" style="margin-top:4px">Have the empty containers been returned to the shipping line?</div>
      </div>
      <button class="close-btn" onclick="snoozeAllReturns(${JSON.stringify(pending.map(c=>c.id))})">✕</button>
    </div>
    <div class="modal-body" style="padding:0">
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Customer</th><th>Free Days Status</th><th style="text-align:center">Returned?</th></tr></thead>
        <tbody>
          ${pending.map(c => {
            const arr = new Date(c.arrival_date); arr.setHours(0,0,0,0);
            const lastFree = new Date(arr); lastFree.setDate(lastFree.getDate() + parseInt(c.free_days));
            const today = new Date(); today.setHours(0,0,0,0);
            const diff = Math.round((today - lastFree) / 86400000);
            const st = diff > 0
              ? `<span style="color:var(--red);font-weight:600">${diff}d overdue</span>`
              : `<span style="color:var(--orange);font-weight:600">${Math.abs(diff)}d left</span>`;
            return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:12px"><strong>${c.contract_number}</strong><br><span class="text-sm text-muted">${c.product}</span></td>
              <td style="padding:12px">${c.customer_name||'—'}</td>
              <td style="padding:12px">${st}</td>
              <td style="padding:12px;text-align:center">
                <button class="btn btn-sm" style="margin-right:6px" onclick="_crConfirm(this)" data-cid="${c.id}" data-cnum="${c.contract_number}">✓ Returned</button>
                <button class="btn btn-sm" onclick="_crSnooze(this)" data-cid="${c.id}">Still out</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="modal-footer" style="justify-content:space-between">
      <span class="text-sm text-muted">Click "Still out" to be reminded again tomorrow</span>
      <button class="btn" onclick="snoozeAllReturns(${JSON.stringify(pending.map(c=>c.id))})">Remind me tomorrow</button>
    </div>
  </div>`);
}

function snoozeContainerReturn(id) {
  try { localStorage.setItem('return_snoozed_' + id, new Date().toISOString().slice(0,10)); } catch(e) {}
  closeModal();
  setTimeout(checkContainerReturns, 800);
}

function snoozeAllReturns(ids) {
  const t = new Date().toISOString().slice(0,10);
  ids.forEach(id => { try { localStorage.setItem('return_snoozed_' + id, t); } catch(e) {} });
  closeModal();
}

function confirmContainerReturn(id, num) {
  openModal(`
  <div class="modal modal-sm" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">✓ Containers Returned — ${num}</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Return Date (optional)</label>
        <input type="date" id="return-date-input" value="${new Date().toISOString().slice(0,10)}"
          style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px">
      </div>
      <p class="text-muted text-sm" style="margin-top:8px">The detention alert for this contract will be cleared permanently.</p>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="_crSaveNoDate(this)" data-cid="${id}">Save without date</button>
      <button class="btn btn-cta" onclick="_crSaveWithDate(this)" data-cid="${id}">Save with date</button>
    </div>
  </div>`);
}

async function saveContainerReturn(id, date) {
  const returnDate = date || new Date().toISOString().slice(0,10);
  const { error } = await sb.from('contracts').update({
    containers_returned_date: returnDate,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  const c = S.contracts.find(x => x.id === id);
  if (c) c.containers_returned_date = returnDate;
  closeModal();
  const b = document.createElement('div');
  b.style.cssText = 'position:fixed;top:70px;right:24px;z-index:300;background:var(--green);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500';
  b.textContent = '✓ Container return confirmed';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3000);
  setTimeout(checkContainerReturns, 600);
}
