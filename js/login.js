// Login Page JavaScript
const API = 'https://gardiy-backend-production.up.railway.app';

// Returns the ?next= redirect target (also checks sessionStorage for OAuth popup flow)
function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || sessionStorage.getItem('loginNext');
    sessionStorage.removeItem('loginNext');
    return next ? decodeURIComponent(next) : 'profile.html';
}

// Check if this page load is a Google OAuth redirect (token in URL fragment)
function checkOAuthRedirect() {
    const hash = window.location.hash;
    if (hash.startsWith('#oauth=')) {
        try {
            const data = JSON.parse(atob(hash.slice(7)));
            if (data.type === 'GOOGLE_AUTH' && data.token) {
                saveSession(data);
                history.replaceState(null, '', window.location.pathname + window.location.search);
                // If this is a popup, close it — the opener window handles the redirect
                if (window.opener && !window.opener.closed) {
                    window.close();
                    return true;
                }
                showMessage('Signed in with Google! Redirecting…', 'success');
                setTimeout(() => { window.location.href = getNextUrl(); }, 1000);
                return true;
            }
        } catch (e) { /* invalid token — fall through to normal login */ }
    }
    if (hash === '#oauth-error=1') {
        history.replaceState(null, '', window.location.pathname);
        showMessage('Google sign-in failed. Please try again.', 'error');
    }
    return false;
}

document.addEventListener('DOMContentLoaded', function () {
    // Handle Google OAuth redirect before rendering the login form
    if (checkOAuthRedirect()) return;
    // ── Tab switching ──────────────────────────────────────────────────────
    const signinTab  = document.getElementById('signinTab');
    const signupTab  = document.getElementById('signupTab');
    const signinForm = document.getElementById('signinForm');
    const signupForm = document.getElementById('signupForm');

    signinTab.addEventListener('click', () => {
        signinTab.classList.add('active');
        signupTab.classList.remove('active');
        signinForm.style.display = 'block';
        signupForm.style.display = 'none';
    });

    signupTab.addEventListener('click', () => {
        signupTab.classList.add('active');
        signinTab.classList.remove('active');
        signupForm.style.display = 'block';
        signinForm.style.display = 'none';
    });

    // Auto-switch to Create Account tab when arriving via #signup
    if (window.location.hash === '#signup') {
        signupTab.click();
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // ── Login ──────────────────────────────────────────────────────────────
    document.getElementById('loginForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const email    = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const btn      = this.querySelector('button[type="submit"]');

        btn.disabled    = true;
        btn.textContent = 'Signing in…';

        try {
            const res  = await fetch(`${API}/api/auth/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (!data.success) {
                showMessage(data.message || 'Login failed.', 'error');
                return;
            }

            saveSession(data);
            showMessage('Welcome back! Redirecting…', 'success');
            setTimeout(() => { window.location.href = getNextUrl(); }, 1200);
        } catch (err) {
            showMessage('Could not reach server. Is the backend running?', 'error');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Sign In';
        }
    });

    // ── Register ───────────────────────────────────────────────────────────
    document.getElementById('registerForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const name            = document.getElementById('signupName').value.trim();
        const email           = document.getElementById('signupEmail').value.trim();
        const password        = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const agreeTerms      = document.getElementById('agreeTerms').checked;
        const btn             = this.querySelector('button[type="submit"]');

        if (password !== confirmPassword) { showMessage('Passwords do not match.', 'error'); return; }
        if (password.length < 8)          { showMessage('Password must be at least 8 characters.', 'error'); return; }
        if (!agreeTerms)                  { showMessage('Please agree to the terms of service.', 'error'); return; }

        btn.disabled    = true;
        btn.textContent = 'Creating account…';

        try {
            const res  = await fetch(`${API}/api/auth/register`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name, email, password })
            });
            const data = await res.json();

            if (!data.success) {
                showMessage(data.message || 'Registration failed.', 'error');
                return;
            }

            saveSession(data);
            showMessage('Account created! Redirecting…', 'success');
            setTimeout(() => { window.location.href = getNextUrl(); }, 1200);
        } catch (err) {
            showMessage('Could not reach server. Is the backend running?', 'error');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Create Account';
        }
    });

    // ── Google OAuth ───────────────────────────────────────────────────────
    document.querySelectorAll('.google-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            sessionStorage.setItem('loginNext', getNextUrl());
            const popup = window.open(
                'https://gardiy-backend-production.up.railway.app/api/auth/google',
                'google-auth',
                'width=520,height=620,left=' + (screen.width/2 - 260) + ',top=' + (screen.height/2 - 310)
            );
            if (!popup) { showMessage('Allow popups for this page to use Google sign-in.', 'error'); return; }
            btn.textContent = 'Waiting for Google…';
            btn.disabled = true;

            // When the popup saves the session to localStorage, this window detects it
            // via the storage event and redirects itself (the popup only navigates itself)
            function onStorage(e) {
                if (e.key === 'gardiyUser' && e.newValue) {
                    window.removeEventListener('storage', onStorage);
                    clearInterval(pollTimer);
                    const next = sessionStorage.getItem('loginNext') || 'profile.html';
                    sessionStorage.removeItem('loginNext');
                    window.location.href = next;
                }
            }
            window.addEventListener('storage', onStorage);

            const pollTimer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(pollTimer);
                    window.removeEventListener('storage', onStorage);
                    btn.disabled = false;
                    btn.innerHTML = '<img src="https://www.google.com/favicon.ico" width="18" style="vertical-align:middle;margin-right:8px">Continue with Google';
                }
            }, 500);
        });
    });

    // Google OAuth now uses a redirect instead of postMessage
    // (postMessage fails when window.opener is nulled during cross-origin navigation)
    // Handled in the DOMContentLoaded block above via checkOAuthRedirect()

    // ── Apple (placeholder) ────────────────────────────────────────────────
    document.querySelectorAll('.apple-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.preventDefault(); showMessage('Apple sign-in coming soon!', 'info'); });
    });

    // ── Password toggles ───────────────────────────────────────────────────
    addPasswordToggle('loginPassword');
    addPasswordToggle('signupPassword');
    addPasswordToggle('confirmPassword');
});

// Save JWT + user info to localStorage in the format the rest of the app expects
function saveSession(data) {
    localStorage.setItem('gardiyUser', JSON.stringify({
        id:       data.user.id,
        name:     data.user.name,
        email:    data.user.email,
        isAdmin:  data.user.isAdmin || false,
        loggedIn: true,
        token:    data.token,
        timestamp: new Date().toISOString()
    }));
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showMessage(message, type) {
    document.querySelector('.auth-message')?.remove();

    const div = document.createElement('div');
    div.className = `auth-message ${type}`;
    div.textContent = message;
    div.style.cssText = `
        position:fixed; top:100px; right:20px; padding:14px 22px;
        border-radius:10px; font-weight:600; z-index:10000;
        box-shadow:0 4px 20px rgba(0,0,0,0.15);
        animation:slideIn 0.3s ease;
    `;
    div.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    div.style.color = 'white';
    document.body.appendChild(div);
    setTimeout(() => { div.style.animation = 'slideOut 0.3s ease'; setTimeout(() => div.remove(), 300); }, 3000);
}

function addPasswordToggle(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const group = input.closest('.form-group');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<img src="images/eye.png" style="width:20px;height:20px;object-fit:contain;display:block;">';
    btn.style.cssText = 'position:absolute;right:14px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;opacity:0.5;transition:opacity 0.2s;line-height:0;';
    group.style.position = 'relative';
    input.style.paddingRight = '44px';
    group.appendChild(btn);
    btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type  = show ? 'text' : 'password';
        btn.innerHTML = show
            ? '<img src="images/monkey.png" style="width:20px;height:20px;object-fit:contain;display:block;">'
            : '<img src="images/eye.png" style="width:20px;height:20px;object-fit:contain;display:block;">';
        btn.style.opacity = show ? '1' : '0.5';
    });
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn  { from { transform:translateX(400px); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideOut { from { transform:translateX(0); opacity:1; } to { transform:translateX(400px); opacity:0; } }
`;
document.head.appendChild(style);

