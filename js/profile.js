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
        });
    });

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('gardiyUser');
            showMessage('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        }
    });

    // Edit profile
    const editProfileBtn = document.getElementById('editProfileBtn');
    editProfileBtn.addEventListener('click', function() {
        const menuItem = document.querySelector('.menu-item[data-section="settings"]');
        menuItem.click();
    });

    // Project actions
    setupProjectActions();

    // Settings forms
    setupSettingsForms();
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

function setupProjectActions() {
    // Edit buttons
    document.querySelectorAll('.project-item .action-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const action = this.textContent.trim();
            const projectTitle = this.closest('.project-item').querySelector('h3').textContent;
            
            if (action.includes('Edit')) {
                console.log('Editing:', projectTitle);
                showMessage('Opening design editor...', 'info');
                setTimeout(() => {
                    window.location.href = 'design.html';
                }, 1000);
            } else if (action.includes('Share')) {
                console.log('Sharing:', projectTitle);
                shareProject(projectTitle);
            } else if (action.includes('Delete')) {
                console.log('Deleting:', projectTitle);
                if (confirm(`Are you sure you want to delete "${projectTitle}"?`)) {
                    this.closest('.project-item').style.animation = 'fadeOut 0.3s ease';
                    setTimeout(() => {
                        this.closest('.project-item').remove();
                        showMessage('Project deleted', 'success');
                    }, 300);
                }
            }
        });
    });

    // Order actions
    document.querySelectorAll('.order-item .action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.textContent.trim();
            const orderNum = this.closest('.order-item').querySelector('h3').textContent;
            
            if (action.includes('View') || action.includes('Track')) {
                console.log('Viewing order:', orderNum);
                showMessage('Opening order details...', 'info');
            } else if (action.includes('Reorder')) {
                console.log('Reordering:', orderNum);
                showMessage('Adding items to cart...', 'info');
            } else if (action.includes('Contact')) {
                console.log('Contacting support for:', orderNum);
                showMessage('Opening support chat...', 'info');
            }
        });
    });
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
                <input type="text" value="https://gardiy.com/project/${Math.random().toString(36).substr(2, 9)}" readonly style="
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
    const personalInfoForm = document.querySelector('.settings-card:nth-child(1) form');
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
    const passwordForm = document.querySelector('.settings-card:nth-child(2) form');
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

async function loadMgrProducts() {
    const grid = document.getElementById('mgr-products-grid');
    const countEl = document.getElementById('mgr-product-count');
    grid.innerHTML = '<p style="color:#718096;grid-column:1/-1;">Loading…</p>';
    try {
        const r = await fetch(`${MGR_API}/products`);
        const d = await r.json();
        if (!d.success || !d.products) { grid.innerHTML = '<p style="color:#e53e3e;">Failed to load products.</p>'; return; }
        const products = d.products;
        countEl.textContent = `${products.length} products`;
        if (!products.length) { grid.innerHTML = '<p style="color:#718096;grid-column:1/-1;">No products yet.</p>'; return; }
        grid.innerHTML = products.map(p => {
            const img = p.type === 'image' && p.image
                ? `<img src="${p.image}" style="width:100%;height:100px;object-fit:cover;border-radius:8px 8px 0 0;">`
                : `<div style="height:100px;background:#f0fdf4;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;font-size:2.5rem;">${p.image || '🌿'}</div>`;
            const id = p._id || p.id;
            return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
                ${img}
                <div style="padding:0.75rem;">
                    <div style="font-weight:600;font-size:13px;color:#2d3748;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                    <div style="font-size:12px;color:#718096;margin:2px 0;">$${p.price} · ${p.category}</div>
                    <button onclick="deleteMgrProduct('${id}')" style="margin-top:6px;width:100%;padding:4px;background:#fff5f5;color:#e53e3e;border:1px solid #fed7d7;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Delete</button>
                </div>
            </div>`;
        }).join('');
    } catch { grid.innerHTML = '<p style="color:#e53e3e;grid-column:1/-1;">Error loading products.</p>'; }
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
            const maxPx = file.type === 'image/png' ? 300 : 200;
            const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.75));
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

// Load stats when manager section first activates
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.menu-item[data-section]').forEach(item => {
        item.addEventListener('click', function() {
            if (this.dataset.section === 'manager') {
                setTimeout(loadMgrStats, 100);
            }
        });
    });
});
