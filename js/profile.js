// Profile Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    let user = JSON.parse(localStorage.getItem('gardiyUser'));

    if (!user || !user.loggedIn) {
        window.location.href = 'login.html?next=profile.html';
        return;
    }

    // Load user data from cached session
    loadUserData(user);

    // Show Manager link immediately if session says admin
    if (user.isAdmin) {
        const managerLink = document.getElementById('managerLink');
        if (managerLink) managerLink.style.display = 'flex';
    }

    // Fetch fresh permissions from backend in the background (non-blocking)
    // This fixes stale sessions where isAdmin was set after the JWT was issued
    fetchAndApplyAdminStatus(user);

    // Menu navigation
    const menuItems = document.querySelectorAll('.menu-item:not(.logout)');
    const contentSections = document.querySelectorAll('.content-section');

    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active menu item
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');

            // Show corresponding content section
            const sectionId = this.dataset.section + '-section';
            contentSections.forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none';
            });
            
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.style.display = 'block';
                setTimeout(() => targetSection.classList.add('active'), 10);
            }

            if (this.dataset.section === 'subscription') {
                setTimeout(() => { if (typeof window.renderSubscription === 'function') window.renderSubscription(); }, 100);
            }
        });
    });

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        localStorage.removeItem('gardiyUser');
        showMessage('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    });

    // Edit profile
    const editProfileBtn = document.getElementById('editProfileBtn');
    editProfileBtn.addEventListener('click', function() {
        const menuItem = document.querySelector('.menu-item[data-section="settings"]');
        menuItem.click();
    });

    // Load real projects from backend
    loadUserProjects(user);

    // Pre-render subscription section in background so it's ready when clicked
    setTimeout(() => { if (typeof window.renderSubscription === 'function') window.renderSubscription(); }, 500);

    // Settings forms
    setupSettingsForms();

    // Product filter bar in manager section
    setupMgrProductFilters();
});

function loadUserData(user) {
    // Update profile card
    document.getElementById('profileName').textContent = user.name || 'User';
    document.getElementById('profileEmail').textContent = user.email || '';
    
    // Set avatar initials
    const initials = getInitials(user.name || user.email);
    document.getElementById('profileAvatar').textContent = initials;

    // Update settings form
    document.getElementById('settingsName').value = user.name || '';
    document.getElementById('settingsEmail').value = user.email || '';
}

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

const BACKEND = 'https://gardiy-backend-production.up.railway.app';

async function loadUserProjects(user) {
    const grid    = document.getElementById('projectsGrid');
    const statEl  = document.getElementById('statProjects');
    if (!grid) return;

    if (!user.token) {
        grid.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;grid-column:1/-1;">Sign in to view your projects.</p>';
        return;
    }

    try {
        const res  = await fetch(`${BACKEND}/api/designs`, { headers: { 'Authorization': `Bearer ${user.token}` } });
        const data = await res.json();
        if (!data.success) throw new Error('fetch failed');

        const projects = (data.designs || []).filter(d => d.isDraft);
        if (statEl) statEl.textContent = projects.length;

        if (!projects.length) {
            grid.innerHTML = `
                <div style="text-align:center;color:#6b7280;padding:48px 20px;grid-column:1/-1;">
                    <div style="font-size:3rem;margin-bottom:12px;">🌱</div>
                    <h3 style="margin:0 0 8px;color:#374151;">No saved projects yet</h3>
                    <p style="margin:0 0 20px;">Go to the design tool, build your landscape, and click <strong>Save</strong>.</p>
                    <a href="upload.html" style="padding:10px 24px;background:#10b981;color:white;border-radius:8px;text-decoration:none;font-weight:600;">+ Start Designing</a>
                </div>`;
            return;
        }

        grid.innerHTML = projects.map(p => {
            const date    = new Date(p.updatedAt || p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const safeName = (p.designName || 'My Project').replace(/"/g, '&quot;');
            const isActive = localStorage.getItem('gardiyActiveProject') === p._id;
            return `
                <div class="project-item" data-id="${p._id}">
                    <div class="project-thumb" style="background:linear-gradient(135deg,#d1fae5,#a7f3d0);display:flex;align-items:center;justify-content:center;min-height:120px;position:relative;">
                        <div style="font-size:2.8rem;">🌿</div>
                        ${isActive ? '<div class="project-status" style="background:#10b981;">Active</div>' : ''}
                    </div>
                    <div class="project-details">
                        <h3 style="margin:0 0 4px;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.designName || 'Untitled Project'}</h3>
                        <p class="project-meta">Last saved: ${date}</p>
                        <div class="project-actions">
                            <button class="action-btn proj-open-btn" data-id="${p._id}" data-name="${safeName}">✏️ Open</button>
                            <button class="action-btn proj-del-btn"  data-id="${p._id}" data-name="${safeName}">🗑️ Delete</button>
                        </div>
                    </div>
                </div>`;
        }).join('') + `
            <div class="new-project-card">
                <a href="upload.html"><div class="plus-icon">+</div><p>New Project</p></a>
            </div>`;

        // Open button → set active project in localStorage and go to design page
        grid.querySelectorAll('.proj-open-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                localStorage.setItem('gardiyActiveProject',     btn.dataset.id);
                localStorage.setItem('gardiyActiveProjectName', btn.dataset.name);
                window.location.href = 'design.html';
            });
        });

        // Delete button → call API then remove card
        grid.querySelectorAll('.proj-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete "${btn.dataset.name}"?`)) return;
                try {
                    const r = await fetch(`${BACKEND}/api/designs/${btn.dataset.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${user.token}` }
                    });
                    const d = await r.json();
                    if (d.success) {
                        if (localStorage.getItem('gardiyActiveProject') === btn.dataset.id) {
                            localStorage.removeItem('gardiyActiveProject');
                            localStorage.removeItem('gardiyActiveProjectName');
                        }
                        btn.closest('.project-item').remove();
                        const remaining = grid.querySelectorAll('.project-item[data-id]').length;
                        if (statEl) statEl.textContent = remaining;
                        if (!remaining) loadUserProjects(user);
                        showMessage('Project deleted', 'success');
                    }
                } catch (e) { showMessage('Failed to delete project', 'error'); }
            });
        });

    } catch (e) {
        grid.innerHTML = '<p style="color:#ef4444;text-align:center;padding:40px;grid-column:1/-1;">Failed to load projects. Please refresh the page.</p>';
    }
}

function setupProjectActions() {
    document.querySelectorAll('.order-item .contact-us-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const orderItem = this.closest('.order-item');
            const orderNum  = orderItem?.querySelector('h3')?.textContent || '';
            openContactModal(orderNum);
        });
    });
}

function openContactModal(orderRef) {
    document.getElementById('contactModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'contactModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
                <h2 style="margin:0;font-size:1.2rem;color:#1a202c;">Contact Us</h2>
                <button onclick="document.getElementById('contactModal').remove()" style="background:#f3f4f6;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;color:#6b7280;">✕</button>
            </div>
            ${orderRef ? `<p style="margin:0 0 1rem;font-size:13px;color:#6b7280;">Regarding: <strong>${orderRef}</strong></p>` : ''}
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Your Name *</label>
                    <input id="contactName" type="text" placeholder="John Doe" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Email *</label>
                    <input id="contactEmail" type="email" placeholder="you@email.com" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">How can we help? *</label>
                    <textarea id="contactMessage" rows="4" placeholder="Describe your question or issue…" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;"></textarea>
                </div>
                <div id="contactError" style="display:none;color:#dc2626;font-size:13px;"></div>
                <button id="contactSendBtn" onclick="sendContactMessage('${orderRef.replace(/'/g,"\\'")}')
                " style="padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;font-weight:600;font-size:15px;cursor:pointer;">Send Message</button>
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // Pre-fill from logged-in user
    const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (user.name)  document.getElementById('contactName').value  = user.name;
    if (user.email) document.getElementById('contactEmail').value = user.email;
}

async function sendContactMessage(orderRef) {
    const name    = document.getElementById('contactName')?.value.trim();
    const email   = document.getElementById('contactEmail')?.value.trim();
    const message = document.getElementById('contactMessage')?.value.trim();
    const errEl   = document.getElementById('contactError');
    const sendBtn = document.getElementById('contactSendBtn');

    if (!name || !email || !message) {
        if (errEl) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; }
        return;
    }
    if (errEl) errEl.style.display = 'none';

    sendBtn.textContent = 'Sending…'; sendBtn.disabled = true;
    try {
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const res = await fetch(`${BACKEND}/api/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(session.token ? { 'Authorization': `Bearer ${session.token}` } : {}) },
            body: JSON.stringify({ name, email, message, orderRef }),
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('contactModal').remove();
            showMessage('Message sent! We\'ll get back to you shortly.', 'success');
        } else {
            throw new Error(data.message || 'Failed to send');
        }
    } catch (err) {
        sendBtn.textContent = 'Send Message'; sendBtn.disabled = false;
        if (errEl) { errEl.textContent = 'Failed to send: ' + err.message; errEl.style.display = 'block'; }
    }
}

function shareProject(projectTitle) {
    // Create share modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
        ">
            <h2 style="margin-bottom: 20px; color: #2d3748;">Share Project</h2>
            <p style="margin-bottom: 30px; color: #718096;">${projectTitle}</p>
            
            <div style="display: flex; gap: 12px; margin-bottom: 30px;">
                <button class="share-social-btn" data-platform="facebook" style="flex: 1; padding: 14px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; font-weight: 600; transition: all 0.3s;">
                    📘 Facebook
                </button>
                <button class="share-social-btn" data-platform="twitter" style="flex: 1; padding: 14px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; font-weight: 600; transition: all 0.3s;">
                    🐦 Twitter
                </button>
                <button class="share-social-btn" data-platform="pinterest" style="flex: 1; padding: 14px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; font-weight: 600; transition: all 0.3s;">
                    📌 Pinterest
                </button>
            </div>

            <div style="margin-bottom: 20px;">
                <input type="text" value="https://gardiy.org/project/${Math.random().toString(36).substr(2, 9)}" readonly style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    background: #f8f9fa;
                    font-size: 14px;
                " id="shareLink">
            </div>

            <button id="copyLinkBtn" style="
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
                margin-bottom: 12px;
            ">Copy Link</button>

            <button id="closeShareModal" style="
                width: 100%;
                padding: 14px;
                background: white;
                color: #4a5568;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
            ">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Copy link functionality
    modal.querySelector('#copyLinkBtn').addEventListener('click', function() {
        const linkInput = modal.querySelector('#shareLink');
        linkInput.select();
        document.execCommand('copy');
        this.textContent = '✓ Copied!';
        setTimeout(() => {
            this.textContent = 'Copy Link';
        }, 2000);
    });

    // Social share buttons
    modal.querySelectorAll('.share-social-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const platform = this.dataset.platform;
            console.log(`Sharing to ${platform}`);
            showMessage(`Opening ${platform}...`, 'info');
        });

        btn.addEventListener('mouseenter', function() {
            this.style.borderColor = '#667eea';
            this.style.transform = 'translateY(-2px)';
        });

        btn.addEventListener('mouseleave', function() {
            this.style.borderColor = '#e2e8f0';
            this.style.transform = 'translateY(0)';
        });
    });

    // Close modal
    modal.querySelector('#closeShareModal').addEventListener('click', function() {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => modal.remove(), 300);
        }
    });
}

function setupSettingsForms() {
    // Personal information form
    const personalInfoForm = document.querySelector('#settings-section .settings-card:nth-child(2) form');
    if (!personalInfoForm) return;
    personalInfoForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = document.getElementById('settingsName').value;
        const phone = document.getElementById('settingsPhone').value;
        
        // Update user data
        const user = JSON.parse(localStorage.getItem('gardiyUser'));
        user.name = name;
        user.phone = phone;
        localStorage.setItem('gardiyUser', JSON.stringify(user));
        
        // Update UI
        document.getElementById('profileName').textContent = name;
        const initials = getInitials(name);
        document.getElementById('profileAvatar').textContent = initials;
        
        showMessage('Profile updated successfully!', 'success');
    });

    // Password change form
    const passwordForm = document.querySelector('#settings-section .settings-card:nth-child(3) form');
    if (!passwordForm) return;
    passwordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const inputs = this.querySelectorAll('input');
        const currentPassword = inputs[0].value;
        const newPassword = inputs[1].value;
        const confirmPassword = inputs[2].value;
        
        if (newPassword !== confirmPassword) {
            showMessage('Passwords do not match!', 'error');
            return;
        }
        
        if (newPassword.length < 8) {
            showMessage('Password must be at least 8 characters!', 'error');
            return;
        }
        
        // Simulate password change
        console.log('Changing password...');
        showMessage('Password updated successfully!', 'success');
        
        // Clear form
        this.reset();
    });

    // Delete account
    const deleteBtn = document.querySelector('.danger-btn');
    deleteBtn.addEventListener('click', function() {
        const confirmed = confirm('Are you absolutely sure? This action cannot be undone. Type DELETE to confirm.');
        if (confirmed) {
            showMessage('Account deleted', 'error');
            setTimeout(() => {
                localStorage.removeItem('gardiyUser');
                window.location.href = 'index.html';
            }, 2000);
        }
    });
}

function showMessage(message, type) {
    const existingMessage = document.querySelector('.toast-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'toast-message';
    messageDiv.textContent = message;
    
    messageDiv.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    `;

    if (type === 'success') {
        messageDiv.style.background = '#48bb78';
        messageDiv.style.color = 'white';
    } else if (type === 'error') {
        messageDiv.style.background = '#f56565';
        messageDiv.style.color = 'white';
    } else {
        messageDiv.style.background = '#4299e1';
        messageDiv.style.color = 'white';
    }

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

// Fetches fresh user data from the backend in the background.
// Updates localStorage and shows the Manager link if isAdmin changed.
async function fetchAndApplyAdminStatus(user) {
    try {
        const res = await fetch('https://gardiy-backend-production.up.railway.app/api/auth/me', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.user) return;
        if (data.user.isAdmin && !user.isAdmin) {
            user.isAdmin = true;
            localStorage.setItem('gardiyUser', JSON.stringify(user));
            const managerLink = document.getElementById('managerLink');
            if (managerLink) managerLink.style.display = 'flex';
        }
    } catch { /* backend unavailable — silently skip */ }
}

// ── Manager Dashboard ────────────────────────────────────────────────────────

const MGR_API = 'https://gardiy-backend-production.up.railway.app/api';

function mgrToken() {
    try { return JSON.parse(localStorage.getItem('gardiyUser') || '{}').token || ''; } catch { return ''; }
}

function showManagerTab(tab) {
    ['overview', 'products', 'submissions'].forEach(t => {
        document.getElementById('mgr-' + t).style.display = t === tab ? 'block' : 'none';
        const btn = document.getElementById('mgr-tab-' + t);
        if (btn) {
            btn.style.background = t === tab ? '#10b981' : 'white';
            btn.style.color      = t === tab ? 'white'   : '#4a5568';
            btn.style.border     = t === tab ? 'none'    : '1px solid #e2e8f0';
        }
    });
    if (tab === 'products')    loadMgrProducts();
    if (tab === 'submissions') loadMgrSubmissions();
    if (tab === 'overview')    loadMgrStats();
}

function showAddProductForm() {
    document.getElementById('addProductForm').style.display = 'block';
}

async function loadMgrStats() {
    try {
        const r = await fetch(`${MGR_API}/manager/stats`, { headers: { Authorization: `Bearer ${mgrToken()}` } });
        const d = await r.json();
        if (!d.success) return;
        document.getElementById('stat-products').textContent    = d.productCount;
        document.getElementById('stat-submissions').textContent = d.designCount;
        document.getElementById('stat-users').textContent       = d.userCount;
    } catch {}
}

const MGR_DEFAULT_PRODUCTS = [
    { id: 'rocks-1', name: 'Concrete Paver',     image: '⬜', category: 'rocks_pavers', price: 6.00,  type: 'emoji' },
    { id: 'rocks-2', name: 'Brick Paver',         image: '🧱', category: 'rocks_pavers', price: 7.50,  type: 'emoji' },
    { id: 'rocks-3', name: 'Natural Stone Paver', image: '🪨', category: 'rocks_pavers', price: 12.00, type: 'emoji' },
    { id: 'rocks-4', name: 'Flagstone',           image: '🟫', category: 'rocks_pavers', price: 8.00,  type: 'emoji' },
    { id: 'rocks-5', name: 'Pea Gravel',          image: '⚫', category: 'rocks_pavers', price: 2.50,  type: 'emoji' },
    { id: 'rocks-6', name: 'Decomposed Granite',  image: '🟡', category: 'rocks_pavers', price: 2.00,  type: 'emoji' },
];

let mgrProductsCache = [];
let mgrProductFilter = 'all';

function renderMgrProductCard(p) {
    const img = p.type === 'image' && p.image
        ? `<img src="${p.image}" style="width:100%;height:100px;object-fit:cover;border-radius:8px 8px 0 0;">`
        : `<div style="height:100px;background:#f0fdf4;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;font-size:2.5rem;">${p.image || '🌿'}</div>`;
    const id = p._id || p.id;
    const isDefault = !p._id;
    return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
        ${img}
        <div style="padding:0.75rem;">
            <div style="font-weight:600;font-size:13px;color:#2d3748;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
            <div style="font-size:12px;color:#718096;margin:2px 0;">$${p.price} · ${p.category}</div>
            <div style="display:flex;gap:6px;margin-top:6px;">
                ${!isDefault ? `<button onclick="openEditProductModal('${id}')" style="flex:1;padding:4px;background:#ebf8ff;color:#2b6cb0;border:1px solid #bee3f8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Edit</button>` : ''}
                ${!isDefault ? `<button onclick="deleteMgrProduct('${id}')" style="flex:1;padding:4px;background:#fff5f5;color:#e53e3e;border:1px solid #fed7d7;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Delete</button>` : ''}
                ${isDefault ? `<span style="font-size:11px;color:#9ca3af;font-style:italic;">Default — add to backend to edit</span>` : ''}
            </div>
        </div>
    </div>`;
}

function renderMgrProductsGrid() {
    const grid = document.getElementById('mgr-products-grid');
    const countEl = document.getElementById('mgr-product-count');
    if (!mgrProductsCache.length) { grid.innerHTML = '<p style="color:#718096;grid-column:1/-1;">No products yet.</p>'; return; }
    const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let filtered;
    if (mgrProductFilter === 'all') {
        filtered = mgrProductsCache;
    } else if (mgrProductFilter === 'recent') {
        filtered = mgrProductsCache.filter(p => p.createdAt && (now - new Date(p.createdAt).getTime()) <= RECENT_MS);
    } else if (mgrProductFilter === 'previous') {
        filtered = mgrProductsCache.filter(p => !p.createdAt || (now - new Date(p.createdAt).getTime()) > RECENT_MS);
    } else {
        filtered = mgrProductsCache.filter(p => (p.category || '').toLowerCase() === mgrProductFilter);
    }
    countEl.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;
    if (!filtered.length) { grid.innerHTML = '<p style="color:#718096;grid-column:1/-1;">No products match this filter.</p>'; return; }
    grid.innerHTML = filtered.map(renderMgrProductCard).join('');
}

function setupMgrProductFilters() {
    const bar = document.getElementById('mgrProductFilterBar');
    if (!bar) return;
    bar.addEventListener('click', e => {
        const btn = e.target.closest('.product-filter-btn');
        if (!btn) return;
        mgrProductFilter = btn.dataset.filter;
        bar.querySelectorAll('.product-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderMgrProductsGrid();
    });
}

async function loadMgrProducts() {
    const grid = document.getElementById('mgr-products-grid');
    const countEl = document.getElementById('mgr-product-count');
    grid.innerHTML = '<p style="color:#718096;grid-column:1/-1;">Loading…</p>';
    try {
        const r = await fetch(`${MGR_API}/products`);
        const d = await r.json();
        // Backend returns array directly; some versions wrap in { success, products }
        let products = Array.isArray(d) ? d : (d.success && d.products ? d.products : null);
        if (!products) { grid.innerHTML = '<p style="color:#e53e3e;">Failed to load products.</p>'; return; }
        const existingCats = new Set(products.map(p => (p.category || '').toLowerCase()));
        const missing = MGR_DEFAULT_PRODUCTS.filter(p => !existingCats.has(p.category));
        if (missing.length) products = [...products, ...missing];
        mgrProductsCache = products;
        renderMgrProductsGrid();
    } catch { grid.innerHTML = '<p style="color:#e53e3e;grid-column:1/-1;">Error loading products.</p>'; }
}

function openEditProductModal(id) {
    const p = mgrProductsCache.find(x => (x._id || x.id) === id);
    if (!p) return;

    const existing = document.getElementById('mgrEditModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mgrEditModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';

    const currentImg = p.type === 'image' && p.image
        ? `<img src="${p.image}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;">`
        : `<div style="width:80px;height:80px;background:#f0fdf4;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2rem;">${p.image || '🌿'}</div>`;

    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;max-height:90vh;overflow-y:auto;">
            <h3 style="margin:0 0 1.25rem;color:#1a202c;">Edit Product</h3>
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;">
                <div id="editImgPreview">${currentImg}</div>
                <div style="flex:1;font-size:13px;color:#718096;">Current image. Upload a new one below to replace it.</div>
            </div>
            <div style="display:grid;gap:0.75rem;">
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Name</label>
                    <input id="edit-name" type="text" value="${p.name}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Category</label>
                    <select id="edit-category" style="width:100%;padding:9px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
                        <option value="hardscapes"  ${p.category==='hardscapes'  ?'selected':''}>Hardscapes</option>
                        <option value="rocks_pavers"${p.category==='rocks_pavers'?'selected':''}>Rocks &amp; Pavers</option>
                        <option value="shrubs"      ${p.category==='shrubs'      ?'selected':''}>Shrubs</option>
                        <option value="trees"       ${p.category==='trees'       ?'selected':''}>Trees</option>
                        <option value="grass"       ${p.category==='grass'       ?'selected':''}>Grass</option>
                        <option value="flowers"     ${p.category==='flowers'     ?'selected':''}>Flowers</option>
                        <option value="paths"       ${p.category==='paths'       ?'selected':''}>Paths</option>
                        <option value="furniture"   ${p.category==='furniture'   ?'selected':''}>Furniture</option>
                    </select>
                </div>
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Price ($)</label>
                    <input id="edit-price" type="number" value="${p.price}" min="0" step="0.01" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">New Image (optional — leave blank to keep current)</label>
                    <input id="edit-image" type="file" accept="image/*" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;">
                </div>
            </div>
            <div style="display:flex;gap:0.75rem;margin-top:1.5rem;">
                <button id="editSaveBtn" onclick="submitEditProduct('${id}')" style="flex:1;padding:10px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Save Changes</button>
                <button onclick="document.getElementById('mgrEditModal').remove()" style="padding:10px 16px;background:white;color:#4a5568;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;">Cancel</button>
            </div>
        </div>`;

    // Live preview of newly selected image
    modal.querySelector('#edit-image').addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('editImgPreview').innerHTML =
                `<img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;">`;
        };
        reader.readAsDataURL(file);
    });

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

async function submitEditProduct(id) {
    const name     = document.getElementById('edit-name').value.trim();
    const category = document.getElementById('edit-category').value;
    const price    = parseFloat(document.getElementById('edit-price').value);
    const imageFile = document.getElementById('edit-image').files[0];

    if (!name)        { alert('Enter a product name.'); return; }
    if (isNaN(price)) { alert('Enter a valid price.');  return; }

    const btn = document.getElementById('editSaveBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
        const p = mgrProductsCache.find(x => (x._id || x.id) === id);
        let imageData = p ? p.image : null;
        if (imageFile) imageData = await compressImageForUpload(imageFile);

        const payload = { name, category, price, image: imageData, type: imageFile ? 'image' : (p?.type || 'image') };
        const r = await fetch(`${MGR_API}/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mgrToken()}` },
            body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (d.success) {
            document.getElementById('mgrEditModal').remove();
            loadMgrProducts();
        } else {
            alert(d.message || 'Failed to update product.');
        }
    } catch (e) {
        alert('Error updating product: ' + e.message);
    } finally {
        const btn2 = document.getElementById('editSaveBtn');
        if (btn2) { btn2.textContent = 'Save Changes'; btn2.disabled = false; }
    }
}

async function deleteMgrProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
        const r = await fetch(`${MGR_API}/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${mgrToken()}` } });
        const d = await r.json();
        if (d.success) loadMgrProducts();
        else alert(d.message || 'Delete failed.');
    } catch { alert('Error deleting product.'); }
}

function compressImageForUpload(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const maxPx = 800;
            const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            const isPng = file.type === 'image/png';
            if (!isPng) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(); };
        img.src = url;
    });
}

async function submitNewProduct() {
    const name     = document.getElementById('np-name').value.trim();
    const category = document.getElementById('np-category').value;
    const price    = parseFloat(document.getElementById('np-price').value);
    const imageFile = document.getElementById('np-image').files[0];

    if (!name)              { alert('Enter a product name.');  return; }
    if (isNaN(price))       { alert('Enter a valid price.');   return; }
    if (!imageFile)         { alert('Choose an image file.');  return; }

    const btn = document.querySelector('#addProductForm button');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
        const imageData = await compressImageForUpload(imageFile);
        const product = { name, category, price, image: imageData, type: 'image', tiling: category === 'hardscapes' || category === 'grass' };
        const r = await fetch(`${MGR_API}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mgrToken()}` },
            body: JSON.stringify(product)
        });
        const d = await r.json();
        if (d.success) {
            document.getElementById('addProductForm').style.display = 'none';
            document.getElementById('np-name').value = '';
            document.getElementById('np-price').value = '';
            document.getElementById('np-image').value = '';
            loadMgrProducts();
        } else {
            alert(d.message || 'Failed to save product.');
        }
    } catch (e) {
        alert('Error saving product: ' + e.message);
    } finally {
        btn.textContent = 'Save Product';
        btn.disabled = false;
    }
}

async function loadMgrSubmissions() {
    const list = document.getElementById('mgr-submissions-list');
    list.innerHTML = '<p style="color:#718096;grid-column:1/-1;">Loading submissions…</p>';
    try {
        const r = await fetch(`${MGR_API}/manager/submissions`, { headers: { Authorization: `Bearer ${mgrToken()}` } });
        const d = await r.json();
        if (!d.success) { list.innerHTML = '<p style="color:#e53e3e;grid-column:1/-1;">Failed to load.</p>'; return; }
        if (!d.designs.length) { list.innerHTML = '<p style="color:#718096;grid-column:1/-1;">No submissions yet.</p>'; return; }
        list.innerHTML = d.designs.map(s => {
            const date  = new Date(s.createdAt).toLocaleDateString();
            const items = (s.items || []);
            const total = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
            const thumb = s.landscapeImageData
                ? `<img src="${s.landscapeImageData}" onclick="document.getElementById('subLightboxImg').src=this.src;document.getElementById('subLightbox').style.display='flex';document.body.style.overflow='hidden'" style="width:100%;height:140px;object-fit:cover;cursor:zoom-in;border-radius:8px 8px 0 0;">`
                : `<div style="height:140px;background:#f7fafc;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;font-size:3rem;">🎨</div>`;
            return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
                ${thumb}
                <div style="padding:0.875rem;">
                    <div style="font-weight:600;font-size:14px;color:#2d3748;">${s.designName || 'Untitled'}</div>
                    <div style="font-size:12px;color:#718096;margin:3px 0;">${date} · ${items.length} items · $${total.toFixed(2)}</div>
                    <div style="font-size:11px;color:#a0aec0;word-break:break-all;">User: ${s.userId}</div>
                </div>
            </div>`;
        }).join('');
    } catch { list.innerHTML = '<p style="color:#e53e3e;grid-column:1/-1;">Error loading submissions.</p>'; }
}

async function clearAllSubmissions() {
    if (!confirm('Delete every submission currently shown here? This cannot be undone.')) return;
    try {
        const r = await fetch(`${MGR_API}/manager/submissions`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${mgrToken()}` }
        });
        const d = await r.json();
        if (!d.success) { alert(d.message || 'Failed to delete submissions.'); return; }
        loadMgrSubmissions();
    } catch { alert('Error deleting submissions.'); }
}

// Load stats when manager section first activates
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.menu-item[data-section]').forEach(item => {
        item.addEventListener('click', function() {
            if (this.dataset.section === 'manager') {
                setTimeout(loadMgrStats, 100);
            }
            if (this.dataset.section === 'subscription') {
                setTimeout(() => { if (typeof renderSubscription === 'function') renderSubscription(); }, 50);
            }
        });
    });
});
