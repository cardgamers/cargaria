/* ═══════════════════════════════════════════════════════
   CARGARIA — Auth: Login, Signup, Onboarding
   ═══════════════════════════════════════════════════════ */

function showAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('auth-tab-' + tab).classList.add('active');
  document.getElementById('auth-' + tab).classList.add('active');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-err');

  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }

  btn.textContent = 'Signing in…';
  btn.disabled = true;
  err.textContent = '';

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

  if (error) {
    err.textContent = error.message;
    btn.textContent = 'Sign In';
    btn.disabled = false;
    return;
  }

  S.user = data.user;
  await initSession();
}

async function doSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-pass').value;
  const btn   = document.getElementById('signup-btn');
  const err   = document.getElementById('signup-err');

  if (!name || !email || !pass) { err.textContent = 'All fields are required.'; return; }
  if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }

  btn.textContent = 'Creating account…';
  btn.disabled = true;
  err.textContent = '';

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name } },
  });

  if (error) {
    err.textContent = error.message;
    btn.textContent = 'Create Account';
    btn.disabled = false;
    return;
  }

  if (data.session) {
    // Auto-confirmed
    S.user = data.user;
    await initSession();
  } else {
    // Email verification required
    document.getElementById('auth-signup').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:40px;margin-bottom:12px">📬</div>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:8px">Check your email</h3>
        <p style="color:var(--text2);font-size:13px">We sent a confirmation link to <strong>${email}</strong>.<br>Click it to activate your account.</p>
      </div>`;
  }
}

/* ── Onboarding ── */
let _obStep = 1;
let _obBtype = 'trader';

function selectBtype(type) {
  _obBtype = type;
  document.querySelectorAll('.btype-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('btype-' + type)?.classList.add('selected');
}

function obNext() {
  const steps = document.querySelectorAll('.ob-step');
  const dots  = document.querySelectorAll('.ob-dot');

  // Validate current step
  if (_obStep === 1) {
    const name = document.getElementById('ob-company').value.trim();
    if (!name) { alert('Please enter your company name.'); return; }
  }

  // Mark dot done
  if (_obStep <= dots.length) dots[_obStep - 1].classList.add('done');

  _obStep++;

  if (_obStep > steps.length) {
    // Save and proceed
    saveOnboarding();
    return;
  }

  steps.forEach((s, i) => s.classList.toggle('active', i + 1 === _obStep));
}

async function saveOnboarding() {
  const companyName = document.getElementById('ob-company').value.trim();
  const btn = document.getElementById('ob-finish-btn');
  if (btn) { btn.textContent = 'Setting up…'; btn.disabled = true; }

  // Create company via RPC
  const { data, error } = await sb.rpc('create_company_for_signup', {
    company_name: companyName,
    user_id: S.user.id,
  });

  if (error) {
    alert('Error setting up company: ' + error.message);
    if (btn) { btn.textContent = 'Get Started'; btn.disabled = false; }
    return;
  }

  // Update company with business type
  const companyId = data;
  await sb.from('companies').update({
    business_type: _obBtype,
  }).eq('id', companyId);

  // Update user record name
  const name = document.getElementById('ob-name').value.trim() || S.user.email;
  await sb.from('users').update({ name }).eq('id', S.user.id);

  S.companyId = companyId;
  S.role = 'admin';

  // Reload user record
  const { data: userRecord } = await sb.from('users')
    .select('*, companies(*)').eq('id', S.user.id).single();
  S.userRecord = userRecord;
  S.company = userRecord?.companies || { name: companyName };

  await loadAndShowApp();
}
