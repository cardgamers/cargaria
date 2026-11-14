/* ═══════════════════════════════════════════════════════
   CARGARIA — Settings: Company, Roles, Ports, Upgrade
   ═══════════════════════════════════════════════════════ */

function settings(tab) {
  tab = tab || 'company';
  document.getElementById('page-title').textContent = 'Settings';
  document.getElementById('topbar-actions').innerHTML = '';

  const tabs = [
    { id: 'company', label: 'Company Profile' },
    { id: 'roles',   label: 'Role Permissions' },
    { id: 'ports',   label: 'Ports Reference' },
    { id: 'upgrade', label: '⭐ Upgrade' },
  ];

  setContent(`
    <div class="tab-bar" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab-btn ${tab===t.id?'active':''}" onclick="settings('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div id="settings-body"></div>`);

  if (tab === 'company') settingsCompany();
  else if (tab === 'roles')   settingsRoles();
  else if (tab === 'ports')   settingsPorts();
  else if (tab === 'upgrade') upgrade();
}

/* ── Company Profile ── */
function settingsCompany() {
  const co = S.company || {};
  const v  = x => x !== null && x !== undefined ? x : '';
  const isAdmin = S.role === 'admin';

  document.getElementById('settings-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Company Form -->
      <div class="card" style="padding:20px">
        <div class="card-title">Company Details</div>
        <div class="form-grid">
          <div class="form-group full"><label>Company Name</label><input type="text" id="co-name" value="${v(co.name)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group full"><label>Trading Name</label><input type="text" id="co-tradename" value="${v(co.trading_name)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group"><label>Tax / GST Number</label><input type="text" id="co-tax" value="${v(co.tax_number)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group"><label>Registration Number</label><input type="text" id="co-reg" value="${v(co.registration_number)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group"><label>Country</label><input type="text" id="co-country" value="${v(co.country)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group"><label>Currency</label>
            <select id="co-currency" ${isAdmin?'':'disabled'}>
              <option value="USD" ${co.currency==='USD'?'selected':''}>USD — US Dollar</option>
              <option value="EUR" ${co.currency==='EUR'?'selected':''}>EUR — Euro</option>
              <option value="GBP" ${co.currency==='GBP'?'selected':''}>GBP — British Pound</option>
              <option value="SGD" ${co.currency==='SGD'?'selected':''}>SGD — Singapore Dollar</option>
            </select>
          </div>
          <div class="form-group full"><label>Address</label><textarea id="co-address" rows="2" ${isAdmin?'':'disabled'}>${v(co.address)}</textarea></div>
          <div class="form-group full"><label>Email</label><input type="email" id="co-email" value="${v(co.email)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group full"><label>Phone</label><input type="tel" id="co-phone" value="${v(co.phone)}" ${isAdmin?'':'disabled'}></div>
          <div class="form-group full"><label>Website</label><input type="url" id="co-website" value="${v(co.website)}" ${isAdmin?'':'disabled'} placeholder="https://"></div>
        </div>
        ${isAdmin ? `
        <div style="margin-top:16px">
          <button class="btn btn-cta" onclick="saveCompanyProfile()">Save Changes</button>
        </div>` : '<p class="text-muted text-sm">Only admins can edit company details.</p>'}
      </div>

      <!-- Logo & Branding -->
      <div>
        <div class="card" style="padding:20px;margin-bottom:16px">
          <div class="card-title">Company Logo</div>
          <div style="text-align:center;margin-bottom:16px">
            <img id="co-logo-preview" src="${co.logo_url || ''}" alt="" style="max-height:80px;max-width:200px;object-fit:contain;${!co.logo_url?'display:none':''}" onerror="this.style.display='none'">
            ${!co.logo_url ? '<div style="color:var(--text3);font-size:13px;padding:20px 0">No logo uploaded</div>' : ''}
          </div>
          ${isAdmin ? `
          <div class="upload-area" onclick="document.getElementById('logo-upload').click()" style="cursor:pointer">
            <div style="font-size:24px;margin-bottom:6px">🖼</div>
            <div style="font-size:13px">Click to upload logo (PNG/JPG, max 2MB)</div>
            <input type="file" id="logo-upload" accept="image/*" style="display:none" onchange="uploadLogo(this)">
          </div>` : ''}
        </div>

        <!-- Current User Info -->
        <div class="card" style="padding:20px">
          <div class="card-title">Your Account</div>
          ${[
            ['Name', S.userRecord?.name || '—'],
            ['Email', S.user?.email || '—'],
            ['Role', S.role || '—'],
            ['Plan', S.company?.plan || 'Starter'],
          ].map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
          <div style="margin-top:12px">
            <button class="btn btn-sm btn-danger" onclick="doLogout()">Sign Out</button>
          </div>
        </div>
      </div>
    </div>`;
}

async function saveCompanyProfile() {
  const { error } = await sb.from('companies').update({
    name:                document.getElementById('co-name').value.trim() || null,
    trading_name:        document.getElementById('co-tradename').value.trim() || null,
    tax_number:          document.getElementById('co-tax').value.trim() || null,
    registration_number: document.getElementById('co-reg').value.trim() || null,
    country:             document.getElementById('co-country').value.trim() || null,
    currency:            document.getElementById('co-currency').value,
    address:             document.getElementById('co-address').value.trim() || null,
    email:               document.getElementById('co-email').value.trim() || null,
    phone:               document.getElementById('co-phone').value.trim() || null,
    website:             document.getElementById('co-website').value.trim() || null,
    updated_at:          new Date().toISOString(),
  }).eq('id', S.companyId);

  if (error) { alert('Error saving: ' + error.message); return; }

  // Refresh company in state
  const { data } = await sb.from('companies').select('*').eq('id', S.companyId).single();
  if (data) S.company = data;

  const b = document.createElement('div');
  b.style.cssText = 'position:fixed;top:70px;right:24px;z-index:300;background:var(--green);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500';
  b.textContent = '✓ Company profile saved';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3000);
}

async function uploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return; }

  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${S.companyId}/logo.${ext}`;

  const { error: uploadErr } = await sb.storage.from('company-assets').upload(path, file, { upsert: true });
  if (uploadErr) { alert('Upload error: ' + uploadErr.message); return; }

  const { data: { publicUrl } } = sb.storage.from('company-assets').getPublicUrl(path);

  await sb.from('companies').update({ logo_url: publicUrl }).eq('id', S.companyId);
  if (S.company) S.company.logo_url = publicUrl;

  const preview = document.getElementById('co-logo-preview');
  if (preview) { preview.src = publicUrl; preview.style.display = ''; }

  const b = document.createElement('div');
  b.style.cssText = 'position:fixed;top:70px;right:24px;z-index:300;background:var(--green);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500';
  b.textContent = '✓ Logo uploaded';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3000);
}

/* ── Role Permissions Table ── */
function settingsRoles() {
  const sections = ['contracts','payments','reports','suppliers','customers','settings'];
  const roles    = ['admin','logistics','finance','sales','viewer'];
  const perms = {
    admin:     { contracts:true, payments:true, reports:true, suppliers:true, customers:true, settings:true },
    logistics: { contracts:true, payments:false,reports:true, suppliers:true, customers:true, settings:false },
    finance:   { contracts:false,payments:true, reports:true, suppliers:false,customers:false,settings:false },
    sales:     { contracts:false,payments:false,reports:false,suppliers:false,customers:true, settings:false },
    viewer:    { contracts:false,payments:false,reports:false,suppliers:false,customers:false,settings:false },
  };

  document.getElementById('settings-body').innerHTML = `
    <div class="card" style="padding:20px">
      <div class="card-title">Role Permissions</div>
      <p class="text-muted text-sm" style="margin-bottom:16px">
        ✓ = Can create and edit &nbsp;|&nbsp; All roles can view all data<br>
        Your current role: <strong>${S.role || 'viewer'}</strong>
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Section</th>
              ${roles.map(r => `<th style="text-align:center">${r.charAt(0).toUpperCase()+r.slice(1)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sections.map(sec => `
              <tr>
                <td>${sec.charAt(0).toUpperCase()+sec.slice(1)}</td>
                ${roles.map(r => `
                  <td style="text-align:center">
                    ${perms[r][sec]
                      ? '<span style="color:var(--green);font-size:18px">✓</span>'
                      : '<span style="color:var(--border);font-size:18px">—</span>'}
                  </td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="alert alert-info" style="margin-top:16px">
        <strong>Note:</strong> Roles are assigned by admin users. Contact your administrator to change your role.
      </div>
    </div>`;
}

/* ── Ports Reference ── */
function settingsPorts() {
  const ports = S.ports || [];
  const groups = S.portGroups || [];

  document.getElementById('settings-body').innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">
        Ports Reference (${ports.length} ports)
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Display Name</th>
              <th>Country</th>
              <th>Group</th>
              <th style="text-align:center">Load Port</th>
              <th style="text-align:center">Discharge Port</th>
            </tr>
          </thead>
          <tbody>
            ${ports.map(p => `
              <tr>
                <td><strong>${p.name||'—'}</strong></td>
                <td>${p.display_name||p.name||'—'}</td>
                <td>${p.country||'—'}</td>
                <td>${(groups.find(g => g.id === p.port_group_id))?.name || '—'}</td>
                <td style="text-align:center">${p.is_load_port ? '✓' : ''}</td>
                <td style="text-align:center">${p.is_discharge_port ? '✓' : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ── Upgrade Screen with PayPal ── */
function upgrade() {
  const co = S.company || {};
  const plan = co.plan || 'starter';
  const isGrowth   = plan === 'growth';
  const isBusiness = plan === 'business';

  const el = document.getElementById('settings-body') || document.getElementById('upgrade-wrap') || document.createElement('div');
  el.innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:28px;font-weight:800;color:var(--navy);margin-bottom:8px">Upgrade Cargaria</div>
        <div style="color:var(--text2);font-size:15px">Scale your timber trading operations</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px">

        <!-- Starter -->
        <div class="card" style="padding:24px;text-align:center;border:2px solid ${plan==='starter'?'var(--navy)':'var(--border)'}">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Starter</div>
          <div style="font-size:28px;font-weight:800;color:var(--navy);margin-bottom:4px">Free</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:20px">Forever</div>
          <ul style="text-align:left;padding:0;list-style:none;margin-bottom:20px;font-size:13px;color:var(--text2)">
            <li style="padding:4px 0">✓ Up to 5 contracts</li>
            <li style="padding:4px 0">✓ 1 user</li>
            <li style="padding:4px 0">✓ Basic P&L reports</li>
            <li style="padding:4px 0">✓ 100MB document storage</li>
          </ul>
          <div class="btn" style="width:100%;opacity:.5;cursor:default;text-align:center">${plan==='starter'?'Current Plan':'Downgrade'}</div>
        </div>

        <!-- Growth -->
        <div class="card" style="padding:24px;text-align:center;border:2px solid ${isGrowth?'var(--teal-dark)':'var(--border)'};position:relative">
          <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--amber);color:#fff;font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px">POPULAR</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Growth</div>
          <div style="font-size:28px;font-weight:800;color:var(--teal-dark);margin-bottom:4px">$49</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:20px">per month</div>
          <ul style="text-align:left;padding:0;list-style:none;margin-bottom:20px;font-size:13px;color:var(--text2)">
            <li style="padding:4px 0">✓ Unlimited contracts</li>
            <li style="padding:4px 0">✓ Up to 5 users</li>
            <li style="padding:4px 0">✓ Full reports suite</li>
            <li style="padding:4px 0">✓ Document storage 2GB</li>
            <li style="padding:4px 0">✓ Payment alerts</li>
            <li style="padding:4px 0">✓ Detention tracking</li>
          </ul>
          ${isGrowth
            ? '<div class="btn btn-cta" style="width:100%;text-align:center;opacity:.7;cursor:default">Current Plan</div>'
            : `<div id="paypal-growth-btn" style="margin-top:4px"></div>`}
        </div>

        <!-- Business -->
        <div class="card" style="padding:24px;text-align:center;border:2px solid ${isBusiness?'var(--navy)':'var(--border)'}">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Business</div>
          <div style="font-size:28px;font-weight:800;color:var(--navy);margin-bottom:4px">$149</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:20px">per month</div>
          <ul style="text-align:left;padding:0;list-style:none;margin-bottom:20px;font-size:13px;color:var(--text2)">
            <li style="padding:4px 0">✓ Everything in Growth</li>
            <li style="padding:4px 0">✓ Unlimited users</li>
            <li style="padding:4px 0">✓ 10GB document storage</li>
            <li style="padding:4px 0">✓ Priority support</li>
            <li style="padding:4px 0">✓ Custom branding</li>
            <li style="padding:4px 0">✓ API access</li>
          </ul>
          ${isBusiness
            ? '<div class="btn btn-cta" style="width:100%;text-align:center;opacity:.7;cursor:default">Current Plan</div>'
            : `<div id="paypal-business-btn" style="margin-top:4px"></div>`}
        </div>

      </div>

      <p style="text-align:center;color:var(--text3);font-size:12px">Secure payment via PayPal. Cancel anytime. No long-term contracts.</p>
    </div>`;

  // Load PayPal SDK and render buttons
  if (!isGrowth || !isBusiness) {
    _loadPayPalButtons();
  }
}

function _loadPayPalButtons() {
  if (document.getElementById('paypal-sdk')) {
    _renderPayPalButtons();
    return;
  }
  const script = document.createElement('script');
  script.id = 'paypal-sdk';
  script.src = 'https://www.paypal.com/sdk/js?client-id=BAAdX2xlynQ1xDbtaY8GNIVHMmR-Xm4hn-S3qYLkE6hDOxkX01wJdMKV6hgQJQ6-ldcwQh4_mUrvZZzm2A&vault=true&intent=subscription';
  script.setAttribute('data-sdk-integration-source', 'button-factory');
  script.onload = _renderPayPalButtons;
  document.head.appendChild(script);
}

function _renderPayPalButtons() {
  if (!window.paypal) return;

  const growthEl   = document.getElementById('paypal-growth-btn');
  const businessEl = document.getElementById('paypal-business-btn');

  const makeBtn = (planId, el) => {
    if (!el) return;
    paypal.Buttons({
      style: { shape:'rect', color:'gold', layout:'vertical', label:'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
      onApprove: async (data) => {
        await sb.from('companies').update({
          plan: planId === 'P-1MU75323PF273043UNK5Z3FQ' ? 'growth' : 'business',
          paypal_subscription_id: data.subscriptionID,
        }).eq('id', S.companyId);
        if (S.company) S.company.plan = planId === 'P-1MU75323PF273043UNK5Z3FQ' ? 'growth' : 'business';
        const b = document.createElement('div');
        b.style.cssText = 'position:fixed;top:70px;right:24px;z-index:300;background:var(--green);color:#fff;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:600';
        b.textContent = '🎉 Subscription activated! Welcome to ' + (planId === 'P-1MU75323PF273043UNK5Z3FQ' ? 'Growth' : 'Business') + ' plan!';
        document.body.appendChild(b);
        setTimeout(() => b.remove(), 5000);
        setTimeout(() => settings('upgrade'), 500);
      },
    }).render(el);
  };

  makeBtn('P-1MU75323PF273043UNK5Z3FQ', growthEl);
  makeBtn('P-2LP97708XR7667703NK5Z3YI', businessEl);
}
