/* ═══════════════════════════════════════════════════════
   CARGARIA — Suppliers Screen
   ═══════════════════════════════════════════════════════ */

function suppliersScreen() {
  document.getElementById('page-title').textContent = 'Suppliers';
  const canEdit = canWrite('suppliers');
  document.getElementById('topbar-actions').innerHTML = canEdit
    ? '<button class="btn btn-cta" onclick="addSupplierModal()">+ Add Supplier</button>' : '';

  const suppliers = S.suppliers || [];

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
              <th class="num">Total Purchase</th>
              ${canEdit ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${suppliers.length === 0
              ? `<tr><td colspan="${canEdit?8:7}" class="text-muted text-center" style="padding:32px">No suppliers yet</td></tr>`
              : suppliers.map(s => {
                  const myContracts = S.contracts.filter(c => c.supplier_id === s.id);
                  const totalPurchase = myContracts.reduce((sum,c) => sum + (+c.purchase_value||0), 0);
                  return `<tr>
                    <td>
                      <strong>${s.name}</strong>
                      ${s.company_registration ? `<div class="text-muted" style="font-size:11px">${s.company_registration}</div>` : ''}
                    </td>
                    <td>${s.country || '—'}</td>
                    <td>${s.contact_person || '—'}</td>
                    <td>${s.email ? `<a href="mailto:${s.email}" style="color:var(--teal-dark)">${s.email}</a>` : '—'}</td>
                    <td>${s.phone || '—'}</td>
                    <td class="text-center">${myContracts.length}</td>
                    <td class="amt">${totalPurchase ? fmt.usd(totalPurchase) : '—'}</td>
                    ${canEdit ? `<td><button class="btn btn-sm" onclick="editSupplierModal('${s.id}')">✏️</button></td>` : ''}
                  </tr>`;
                }).join('')}
          </tbody>
        </table>
      </div>
    </div>`);
}

function addSupplierModal() {
  openModal(`
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Add Supplier</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Company Name *</label><input type="text" id="sup-name" placeholder="Timber Co. Ltd"></div>
        <div class="form-group"><label>Country</label><input type="text" id="sup-country" placeholder="Malaysia"></div>
        <div class="form-group"><label>Company Registration</label><input type="text" id="sup-reg" placeholder="Reg No."></div>
        <div class="form-group"><label>Contact Person</label><input type="text" id="sup-contact" placeholder="Name"></div>
        <div class="form-group"><label>Email</label><input type="email" id="sup-email" placeholder="supplier@example.com"></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="sup-phone" placeholder="+60 12 345 6789"></div>
        <div class="form-group full"><label>Address</label><textarea id="sup-addr" rows="2" placeholder="Street, City, Country"></textarea></div>
        <div class="form-group full"><label>Notes</label><textarea id="sup-notes" rows="2"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveSupplier(null)">Save Supplier</button>
    </div>
  </div>`);
}

async function editSupplierModal(id) {
  const { data: s } = await sb.from('suppliers').select('*').eq('id', id).single();
  if (!s) return;
  const v = x => x !== null && x !== undefined ? x : '';
  openModal(`
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Edit Supplier — ${s.name}</div>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Company Name *</label><input type="text" id="sup-name" value="${v(s.name)}"></div>
        <div class="form-group"><label>Country</label><input type="text" id="sup-country" value="${v(s.country)}"></div>
        <div class="form-group"><label>Company Registration</label><input type="text" id="sup-reg" value="${v(s.company_registration)}"></div>
        <div class="form-group"><label>Contact Person</label><input type="text" id="sup-contact" value="${v(s.contact_person)}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="sup-email" value="${v(s.email)}"></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="sup-phone" value="${v(s.phone)}"></div>
        <div class="form-group full"><label>Address</label><textarea id="sup-addr" rows="2">${v(s.address)}</textarea></div>
        <div class="form-group full"><label>Notes</label><textarea id="sup-notes" rows="2">${v(s.notes)}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-cta" onclick="saveSupplier('${id}')">Save Changes</button>
    </div>
  </div>`);
}

async function saveSupplier(id) {
  const name = document.getElementById('sup-name').value.trim();
  if (!name) { alert('Company name is required'); return; }

  const payload = {
    name,
    country:              document.getElementById('sup-country').value.trim() || null,
    company_registration: document.getElementById('sup-reg').value.trim() || null,
    contact_person:       document.getElementById('sup-contact').value.trim() || null,
    email:                document.getElementById('sup-email').value.trim() || null,
    phone:                document.getElementById('sup-phone').value.trim() || null,
    notes:                document.getElementById('sup-notes').value.trim() || null,
  };

  let error;
  if (id) {
    ({ error } = await sb.from('suppliers').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id));
  } else {
    payload.company_id = S.companyId;
    ({ error } = await sb.from('suppliers').insert(payload));
  }

  if (error) { alert('Error: ' + error.message); return; }

  const { data } = await sb.from('suppliers').select('*').eq('company_id', S.companyId).order('name');
  S.suppliers = data || [];
  closeModal();
  suppliersScreen();
}
