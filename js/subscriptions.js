// Subscription plan limits and usage tracking
// Client-side limits are a UX hint only — real enforcement is on the backend.

const PLAN_LIMITS = {
    free:  { scans: 3,        ordersPerMonth: 1,        label: 'Free Trial' },
    basic: { scans: 20,       ordersPerMonth: 5,        label: 'Basic'      },
    pro:   { scans: Infinity, ordersPerMonth: Infinity, label: 'Pro'        },
};

// Sync plan from server so localStorage always reflects true DB state
(async function syncPlanOnLoad() {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token || !session.loggedIn) return;
    try {
        const res  = await fetch('https://gardiy-backend-production.up.railway.app/api/subscription/status', {
            headers: { 'Authorization': `Bearer ${session.token}` }
        });
        const data = await res.json();
        if (data.success) {
            session.plan                 = data.plan;
            session.planStatus           = data.planStatus;
            session.planCurrentPeriodEnd = data.planCurrentPeriodEnd;
            localStorage.setItem('gardiyUser', JSON.stringify(session));
        }
    } catch (e) { /* non-fatal — fall back to localStorage */ }
})();

const UNRESTRICTED_EMAIL = 'yodyod10@gmail.com';

function subGetUser() {
    try { return JSON.parse(localStorage.getItem('gardiyUser') || '{}'); } catch { return {}; }
}

function subSaveUser(user) {
    localStorage.setItem('gardiyUser', JSON.stringify(user));
}

function isUnrestricted(user) {
    return !!(user.isAdmin || (user.email || '').toLowerCase() === UNRESTRICTED_EMAIL);
}

function getCurrentPlan(user) {
    return PLAN_LIMITS[user.plan] ? user.plan : 'free';
}

function getUsage(user) {
    const usage = { scans: 0, ordersThisMonth: 0, ordersMonthReset: '', ...(user.usage || {}) };
    const thisMonth = new Date().toISOString().slice(0, 7);
    if (usage.ordersMonthReset !== thisMonth) {
        usage.ordersThisMonth = 0;
        usage.ordersMonthReset = thisMonth;
    }
    return usage;
}

function checkScanLimit() {
    const user = subGetUser();
    if (!user.loggedIn) return { allowed: true }; // handle on login check elsewhere
    if (isUnrestricted(user)) return { allowed: true };
    const plan = getCurrentPlan(user);
    const limit = PLAN_LIMITS[plan].scans;
    const used  = getUsage(user).scans || 0;
    return { allowed: used < limit, used, limit, plan, planLabel: PLAN_LIMITS[plan].label };
}

function incrementScans() {
    const user = subGetUser();
    if (!user.loggedIn || isUnrestricted(user)) return;
    const usage = getUsage(user);
    usage.scans = (usage.scans || 0) + 1;
    user.usage = usage;
    subSaveUser(user);
}

function checkOrderLimit() {
    const user = subGetUser();
    if (!user.loggedIn) return { allowed: true };
    if (isUnrestricted(user)) return { allowed: true };
    const plan  = getCurrentPlan(user);
    const limit = PLAN_LIMITS[plan].ordersPerMonth;
    const used  = getUsage(user).ordersThisMonth || 0;
    return { allowed: used < limit, used, limit, plan, planLabel: PLAN_LIMITS[plan].label };
}

function incrementOrders() {
    const user = subGetUser();
    if (!user.loggedIn || isUnrestricted(user)) return;
    const usage = getUsage(user);
    usage.ordersThisMonth = (usage.ordersThisMonth || 0) + 1;
    user.usage = usage;
    subSaveUser(user);
}

function showUpgradeModal(message) {
    const existing = document.getElementById('upgradeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'upgradeModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2.5rem;max-width:440px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:3rem;margin-bottom:1rem;">🔒</div>
            <h2 style="margin:0 0 0.75rem;color:#1a202c;font-size:1.4rem;">Plan Limit Reached</h2>
            <p style="color:#4a5568;margin:0 0 1.5rem;line-height:1.6;">${message}</p>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                <a href="index.html#pricing" style="display:block;padding:12px 24px;background:linear-gradient(135deg,#10b981,#059669);color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">View Plans &amp; Upgrade</a>
                <button onclick="document.getElementById('upgradeModal').remove()" style="padding:10px;background:white;color:#718096;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;font-size:14px;">Maybe Later</button>
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

window.GarDIYSubscriptions = {
    checkScanLimit,
    incrementScans,
    checkOrderLimit,
    incrementOrders,
    showUpgradeModal,
    isUnrestricted,
    getCurrentPlan,
    subGetUser,
};
