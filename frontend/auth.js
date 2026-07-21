// ============================================================
//  auth.js — SummAI Authentication  (uses db.js)
//  Features: Login, Signup, Forgot Password, Validation
//  Password rules: ≥5 chars, ≥1 special symbol, ≥2 digits
// ============================================================

// ---------- Toast ----------
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  const icon = type === 'success' ? '✅' : type === 'danger' ? '❌' : 'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ---------- Tab Switch ----------
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
  });
  document.getElementById('loginPanel').classList.toggle('active', tab === 'login');
  document.getElementById('signupPanel').classList.toggle('active', tab === 'signup');
}

// ---------- Toggle Password Visibility ----------
function togglePass(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

// ---------- Email Validation Helper ----------
const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in',
  'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com',
  'rediffmail.com', 'rediff.com',
  'protonmail.com', 'proton.me',
  'zoho.com',
  'aol.com',
  'yandex.com', 'yandex.ru',
  'tutanota.com',
  'gmx.com', 'gmx.net'
];

function isValidEmailDomain(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function validateEmailField(inputId, errId) {
  const email = document.getElementById(inputId).value.trim().toLowerCase();
  if (!email) return;
  if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
    showErr(inputId, errId, 'Enter a valid email address (e.g. you@gmail.com)');
  } else if (!isValidEmailDomain(email)) {
    showErr(inputId, errId, 'Use a valid provider: gmail.com, yahoo.com, outlook.com, etc.');
  }
}

// Force lowercase while typing in email fields
function lowerCaseInput(el) {
  const pos = el.selectionStart;
  el.value = el.value.toLowerCase();
  el.setSelectionRange(pos, pos);
}

function clearErr(input) {
  input.classList.remove('error');
  const err = input.closest('.field').querySelector('.field-error');
  if (err) { err.textContent = ''; err.classList.remove('show'); }
}

function showErr(inputId, errId, msg) {
  const inp = document.getElementById(inputId);
  const err = document.getElementById(errId);
  inp.classList.add('error');
  err.textContent = msg;
  err.classList.add('show');
}

// ---------- Password Validation ----------
function validatePassword(pass) {
  const errors = [];
  if (pass.length < 5) errors.push('At least 5 characters required');
  const digitCount = (pass.match(/\d/g) || []).length;
  if (digitCount < 2) errors.push('At least 2 digits required');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) errors.push('At least 1 special character required');
  return errors;
}

// ---------- Password Strength ----------
function checkStrength(pass) {
  const fill = document.getElementById('strengthFill');
  if (!fill) return;
  const score =
    (pass.length >= 5 ? 1 : 0) +
    ((pass.match(/\d/g) || []).length >= 2 ? 1 : 0) +
    (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass) ? 1 : 0) +
    (pass.length >= 10 ? 1 : 0);
  const colors = ['#ff4d6d', '#ff9f1c', '#6c63ff', '#43e97b'];
  const widths  = ['25%', '50%', '75%', '100%'];
  fill.style.width = score > 0 ? widths[score - 1] : '0';
  fill.style.background = score > 0 ? colors[score - 1] : 'transparent';
}

// ---------- LOGIN (fixed: now async) ----------
async function doLogin() {
  const emailRaw = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass     = document.getElementById('loginPass').value;
  let valid = true;

  if (!emailRaw || !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(emailRaw) || !isValidEmailDomain(emailRaw)) {
    showErr('loginEmail', 'loginEmailErr', 'Enter a valid email (e.g. you@gmail.com)'); valid = false;
  }
  if (!pass) {
    showErr('loginPass', 'loginPassErr', 'Password is required'); valid = false;
  }
  if (!valid) return;

  try {
    const result = await DB.Users.findByEmail(emailRaw, btoa(pass));

    if (result.error || !result.user) {
      showErr('loginPass', 'loginPassErr', 'Invalid email or password');
      showToast('Login failed — check credentials', 'danger');
      return;
    }

    DB.Session.set(result.user);
    showToast('Welcome back, ' + result.user.name + '!', 'success');
    setTimeout(() => window.location.href = 'app.html', 800);

  } catch (e) {
    showToast('Server error — make sure the backend is running', 'danger');
    console.error(e);
  }
}

// ---------- SIGNUP (fixed: now async) ----------
async function doSignup() {
  const name     = document.getElementById('signupName').value.trim();
  const emailRaw = document.getElementById('signupEmail').value.trim().toLowerCase();
  const pass     = document.getElementById('signupPass').value;
  const pass2    = document.getElementById('signupPass2').value;
  let valid = true;

  if (!name || name.length < 2) {
    showErr('signupName', 'signupNameErr', 'Enter your full name'); valid = false;
  } else if (/\d/.test(name)) {
    showErr('signupName', 'signupNameErr', 'Name must not contain digits'); valid = false;
  } else if (!/^[a-zA-Z\u0900-\u097F\s\-'.]+$/.test(name)) {
    showErr('signupName', 'signupNameErr', "Name can only contain letters, spaces, hyphens, or apostrophes"); valid = false;
  }
  if (!emailRaw || !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(emailRaw) || !isValidEmailDomain(emailRaw)) {
    showErr('signupEmail', 'signupEmailErr', 'Enter a valid email (e.g. you@gmail.com)'); valid = false;
  }

  const passErrors = validatePassword(pass);
  if (passErrors.length > 0) {
    showErr('signupPass', 'signupPassErr', passErrors[0]); valid = false;
  }
  if (pass !== pass2) {
    showErr('signupPass2', 'signupPass2Err', 'Passwords do not match'); valid = false;
  }
  if (!valid) return;

  try {
    const result = await DB.Users.create({ name, email: emailRaw, password: btoa(pass) });

    if (result.error) {
      showErr('signupEmail', 'signupEmailErr', result.error);
      return;
    }

    DB.Session.set(result.user);
    showToast('Account created! Welcome, ' + name + '!', 'success');
    setTimeout(() => window.location.href = 'app.html', 800);

  } catch (e) {
    showToast('Server error — make sure the backend is running', 'danger');
    console.error(e);
  }
}

// ---------- FORGOT PASSWORD ----------
function openForgot(e) {
  e.preventDefault();
  document.getElementById('forgotModal').classList.add('open');
}
function closeForgot() {
  document.getElementById('forgotModal').classList.remove('open');
  document.getElementById('forgotEmail').value = '';
  const err = document.getElementById('forgotEmailErr');
  err.textContent = ''; err.classList.remove('show');
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!email || !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email) || !isValidEmailDomain(email)) {
    const err = document.getElementById('forgotEmailErr');
    err.textContent = 'Enter a valid email'; err.classList.add('show');
    return;
  }
  // Note: Forgot password just shows a message — real reset requires email service
  closeForgot();
  showToast('If that email exists, a reset link would be sent. (Email service not yet set up)', 'info');
}

// ---------- Enter key support ----------
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const loginActive = document.getElementById('loginPanel').classList.contains('active');
  if (loginActive) doLogin(); else doSignup();
});

// ---------- Force lowercase on email inputs ----------
document.addEventListener('DOMContentLoaded', () => {
  ['loginEmail', 'signupEmail', 'forgotEmail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => lowerCaseInput(el));
  });
});
