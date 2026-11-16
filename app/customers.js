/* ═══════════════════════════════════════════════════════
   CARGARIA — Customers Screen
   ═══════════════════════════════════════════════════════ */

function customersScreen() {
  document.getElementById('page-title').textContent = 'Customers';
  const canEdit = canWrite('customers');
  document.getElementById('topbar-actions').innerHTML = canEdit
    ? '<button class="btn btn-cta" onclick="addCustomerModal()">+ Add Customer</button>' : '';

  const customers = S.customers || [];

  setContent(`
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Contact Person</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Contracts</th>
              <th class="num">Total Sales</th>
              ${canEdit ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${customers.length === 0
              ? `<tr><td colspan="${canEdit?8:7}" class="text-muted text-center" style="padding:32px">No customers yet</td></tr>`
              : customers.map(c => {
                  const myContracts = S.contracts.filter(x => x.customer_id === c.id);
                  const totalSales = myContracts.reduce((sum,x) => sum + (+x.sales_value||0), 0);
                  return `<tr>
                    <td>
                      <strong>${c.name}</strong>
                      ${c.company_registration ? `<div class="text-muted" style="font-size:11px">${c.company_registration}</div>` : ''}
                    </td>
                    <td>${c.country || '—'}</td>
                    <td>${c.contact_person || '—'}</td>
                    <td>${c.email ? `<a href="mailto:${c.email}" style="color:var(--teal-dark)">${c.email}</a>` : '—'}</td>
                    <td>${c.phone || '—'}</td>
                    <td class="text-center">${myContracts.length}</td>
                    <td class="amt">${totalSales ? fmt.usd(totalSales) : '—'}</td>
                    ${canEdit ? `<td><button class="btn btn-sm" onclick="editCustomerModal('${c.id}')">✏️</button></td>` : ''}
                  </tr>`;
                }).join('')}
          </tbody>
        </table>
      </div>
    </div>`);
}

function addCustomerModal() {
  openModal(`
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Add Customer</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Company Name *</label><input type="text" id="cust-name" placeholder="Buyer Ltd"></div>
        <div class="form-group"><label>Country</label><input type="text" id="cust-country" placeholder="India"></div>
        <div class="form-group"><label>Company Registration</label><input type="text" id="cust-reg" placeholder="Reg No."></div>
        <div class="form-group"><label>Contact Person</label><input type="text" id="cust-contact" placeholder="Name"></div>
        <div class="form-group"><label>Email</label><input type="email" id="cust-email" placeholder="buyer@example.com"></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="cust-phone" placeholder="+91 98765 43210"></div>
        <div class="form-group full"><label>Address</label><textarea id="cust-addr" rows="2" placeholder="Street, City, Country"></textarea></div>
        <div class="form-group full"><label>Notes</label><textarea id="cust-notes" rows="2"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveCustomer(null)">Save Customer</button>
    </div>
  </div>`);
}

async function editCustomerModal(id) {
  const { data: c } = await sb.from('customers').select('*').eq('id', id).single();
  if (!c) return;
  const v = x => x !== null && x !== undefined ? x : '';
  openModal(`
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Edit Customer — ${c.name}</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Company Name *</label><input type="text" id="cust-name" value="${v(c.name)}"></div>
        <div class="form-group"><label>Country</label><input type="text" id="cust-country" value="${v(c.country)}"></div>
        <div class="form-group"><label>Company Registration</label><input type="text" id="cust-reg" value="${v(c.company_registration)}"></div>
        <div class="form-group"><label>Contact Person</label><input type="text" id="cust-contact" value="${v(c.contact_person)}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="cust-email" value="${v(c.email)}"></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="cust-phone" value="${v(c.phone)}"></div>
        <div class="form-group full"><label>Address</label><textarea id="cust-addr" rows="2">${v(c.address)}</textarea></div>
        <div class="form-group full"><label>Notes</label><textarea id="cust-notes" rows="2">${v(c.notes)}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveCustomer('${id}')">Save Changes</button>
    </div>
  </div>`);
}

async function saveCustomer(id) {
  const name = document.getElementById('cust-name').value.trim();
  if (!name) { alert('Company name is required'); return; }

  const payload = {
    name,
    country:              document.getElementById('cust-country').value.trim() || null,
    company_registration: document.getElementById('cust-reg').value.trim() || null,
    contact_person:       document.getElementById('cust-contact').value.trim() || null,
    email:                document.getElementById('cust-email').value.trim() || null,
    phone:                document.getElementById('cust-phone').value.trim() || null,
    notes:                document.getElementById('cust-notes').value.trim() || null,
  };

  let error;
  if (id) {
    ({ error } = await sb.from('customers').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id));
  } else {
    payload.company_id = S.companyId;
    ({ error } = await sb.from('customers').insert(payload));
  }

  if (error) { alert('Error: ' + error.message); return; }

  const { data } = await sb.from('customers').select('*').eq('company_id', S.companyId).order('name');
  S.customers = data || [];
  closeModal();
  customersScreen();
}
