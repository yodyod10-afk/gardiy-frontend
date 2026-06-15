// Community Page JavaScript
const BACKEND = 'https://gardiy-backend-production.up.railway.app';
let allDesigns = [];
let _currentUserId = null; // set by checkUserStatus

document.addEventListener('DOMContentLoaded', function () {
    checkUserStatus();
    loadCommunityFeed();
    setupSearch();
    setupSort();
    setupFilters();
});

async function loadCommunityFeed() {
    try {
        const res = await fetch(`${BACKEND}/api/community`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        allDesigns = data.designs || [];
        renderCards(allDesigns);
    } catch (err) {
        console.error('Community load failed:', err);
        const empty = document.getElementById('communityEmptyState');
        empty.style.display = 'block';
        empty.innerHTML = `
            <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
            <h3 style="color:#2d3748;margin-bottom:0.5rem;">Couldn't load projects</h3>
            <p>Please try refreshing the page.</p>
        `;
    }
}

function renderCards(designs) {
    const grid = document.getElementById('projectsGrid');
    const empty = document.getElementById('communityEmptyState');
    grid.innerHTML = '';

    if (!designs.length) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    designs.forEach(d => grid.appendChild(buildCard(d)));
}

function buildCard(d) {
    const div = document.createElement('div');
    div.className = 'project-card';
    div.dataset.id = d.id;

    const name     = d.designName || 'Untitled Design';
    const author   = d.authorName || 'GarDIY User';
    const cost     = d.totalCost ? `$${Number(d.totalCost).toLocaleString()}` : '';
    const dims     = d.analysis?.dimensions || '';
    const sunlight = d.analysis?.sunlight || '';
    const caption  = (d.communityCaption || '').trim();
    const date     = new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const initial  = author.charAt(0).toUpperCase();
    const isOwner  = _currentUserId && d.authorId === _currentUserId;
    const imgHtml  = d.landscapeImageData
        ? `<img src="${d.landscapeImageData}" alt="${escHtml(name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0fdf4;color:#6ee7b7;font-size:3rem;">🌿</div>`;

    const ownerBtns = isOwner ? `
        <div style="display:flex;gap:6px;margin-bottom:10px;">
            <button class="comm-edit-btn" style="flex:1;padding:6px 10px;border:1.5px solid #d1fae5;border-radius:7px;background:#f0fdf4;color:#065f46;font-size:0.8rem;font-weight:600;cursor:pointer;">Edit post</button>
            <button class="comm-delete-btn" style="flex:1;padding:6px 10px;border:1.5px solid #fee2e2;border-radius:7px;background:#fff5f5;color:#dc2626;font-size:0.8rem;font-weight:600;cursor:pointer;">Delete post</button>
        </div>` : '';

    div.innerHTML = `
        <div class="project-image" style="height:200px;overflow:hidden;border-radius:12px 12px 0 0;">${imgHtml}</div>
        <div class="project-info" style="padding:16px;">
            <h3 class="project-title" style="margin:0 0 8px;font-size:1rem;font-weight:700;color:#1a202c;">${escHtml(name)}</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#10b981;color:white;font-weight:700;font-size:0.8rem;flex-shrink:0;">${initial}</span>
                <span style="font-size:0.85rem;color:#4a5568;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(author)}</span>
                <span style="font-size:0.78rem;color:#a0aec0;white-space:nowrap;">${date}</span>
            </div>
            ${ownerBtns}
            ${caption ? `<p class="comm-card-caption" style="margin:0 0 10px;font-size:0.85rem;color:#374151;line-height:1.5;word-break:break-word;">${escHtml(caption)}</p>` : `<p class="comm-card-caption" style="display:none;"></p>`}
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                ${dims ? `<span style="font-size:0.78rem;background:#f0fdf4;color:#065f46;padding:3px 8px;border-radius:20px;">${escHtml(dims)}</span>` : ''}
                ${sunlight ? `<span style="font-size:0.78rem;background:#fefce8;color:#92400e;padding:3px 8px;border-radius:20px;">${escHtml(sunlight)}</span>` : ''}
                ${cost ? `<span style="font-size:0.78rem;background:#eff6ff;color:#1d4ed8;padding:3px 8px;border-radius:20px;">${cost}</span>` : ''}
            </div>
            <button class="view-btn" data-token="${escAttr(d.shareToken || '')}" style="width:100%;padding:8px;background:#10b981;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;transition:background 0.15s;">View Design</button>
        </div>
    `;

    div.querySelector('.view-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        const token = this.dataset.token;
        if (token) window.location.href = `design.html?share=${token}`;
    });
    div.querySelector('.view-btn').addEventListener('mouseover', function () { this.style.background = '#059669'; });
    div.querySelector('.view-btn').addEventListener('mouseout', function () { this.style.background = '#10b981'; });

    if (isOwner) {
        div.querySelector('.comm-edit-btn').addEventListener('click', e => {
            e.stopPropagation();
            showCommunityEditModal(d.id, caption, div);
        });
        div.querySelector('.comm-delete-btn').addEventListener('click', e => {
            e.stopPropagation();
            deleteCommunityPost(d.id, div);
        });
    }

    return div;
}

function showCommunityEditModal(designId, existingCaption, cardEl) {
    document.getElementById('commEditModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'commEditModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:420px;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 0.4rem;font-size:1.1rem;font-weight:700;color:#1a202c;">Edit Post</h3>
            <p style="margin:0 0 1rem;font-size:0.85rem;color:#6b7280;">Update the caption for your community post.</p>
            <textarea id="commEditCapTa" maxlength="500" placeholder="Write something about your design… (optional)"
                style="width:100%;box-sizing:border-box;height:96px;padding:0.7rem 0.8rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:0.875rem;font-family:inherit;resize:vertical;outline:none;"
                onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='#e2e8f0'">${escHtml(existingCaption)}</textarea>
            <div style="font-size:0.72rem;color:#9ca3af;text-align:right;margin:4px 0 1rem;"><span id="commEditCount">${existingCaption.length}</span>/500</div>
            <div style="display:flex;gap:0.6rem;">
                <button id="commEditCancel" style="flex:1;padding:0.65rem;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:0.875rem;font-weight:600;color:#6b7280;">Cancel</button>
                <button id="commEditSave" style="flex:2;padding:0.65rem;border:none;border-radius:8px;background:#10b981;color:#fff;cursor:pointer;font-size:0.875rem;font-weight:700;">Save Changes</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const ta    = overlay.querySelector('#commEditCapTa');
    const count = overlay.querySelector('#commEditCount');
    ta.addEventListener('input', () => { count.textContent = ta.value.length; });
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);

    overlay.querySelector('#commEditCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#commEditSave').addEventListener('click', async () => {
        const newCaption = ta.value.trim();
        overlay.remove();
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        if (!session.token) return;
        try {
            const res  = await fetch(`${BACKEND}/api/designs/${designId}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
                body: JSON.stringify({ communityCaption: newCaption }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            const capEl = cardEl.querySelector('.comm-card-caption');
            if (capEl) {
                capEl.textContent = newCaption;
                capEl.style.display = newCaption ? '' : 'none';
            }
            showMessage('Post updated!', 'success');
        } catch (e) {
            console.error('Edit failed:', e);
            showMessage('Could not update post.', 'error');
        }
    });
}

async function deleteCommunityPost(designId, cardEl) {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token) return;

    document.getElementById('commDeleteModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'commDeleteModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:360px;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">🗑️</div>
            <h3 style="margin:0 0 0.5rem;font-size:1.05rem;font-weight:700;color:#1a202c;">Remove from community?</h3>
            <p style="margin:0 0 1.25rem;font-size:0.85rem;color:#6b7280;">This will remove your post from the community feed. Your saved project is not affected.</p>
            <div style="display:flex;gap:0.6rem;">
                <button id="commDelCancel" style="flex:1;padding:0.65rem;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:0.875rem;font-weight:600;color:#6b7280;">Cancel</button>
                <button id="commDelConfirm" style="flex:1;padding:0.65rem;border:none;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-size:0.875rem;font-weight:700;">Remove</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#commDelCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#commDelConfirm').addEventListener('click', async () => {
        overlay.remove();
        try {
            const res  = await fetch(`${BACKEND}/api/designs/${designId}/publish`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.token}` },
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            cardEl.style.transition = 'opacity 0.3s';
            cardEl.style.opacity    = '0';
            setTimeout(() => {
                cardEl.remove();
                allDesigns = allDesigns.filter(d => d.id !== designId);
                if (!document.querySelectorAll('.project-card').length) {
                    document.getElementById('communityEmptyState').style.display = 'block';
                }
            }, 300);
            showMessage('Post removed from community.', 'success');
        } catch (e) {
            console.error('Delete failed:', e);
            showMessage('Could not remove post.', 'error');
        }
    });
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
    return String(s).replace(/"/g,'&quot;');
}

function setupFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const f = this.dataset.filter;
            if (f === 'all') { renderCards(allDesigns); return; }
            const q = f.toLowerCase();
            const filtered = allDesigns.filter(d => {
                const sunlight = (d.analysis?.sunlight || '').toLowerCase();
                const soil = (d.analysis?.soilType || '').toLowerCase();
                const climate = (d.analysis?.climate || '').toLowerCase();
                if (f === 'full-sun') return sunlight.includes('full sun');
                if (f === 'partial') return sunlight.includes('partial');
                if (f === 'shade') return sunlight.includes('shade');
                if (f === 'low-cost') return (d.totalCost || 0) > 0 && (d.totalCost || 0) < 500;
                return sunlight.includes(q) || soil.includes(q) || climate.includes(q);
            });
            renderCards(filtered);
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.querySelector('.search-btn');

    function doSearch() {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) { renderCards(allDesigns); return; }
        const filtered = allDesigns.filter(d =>
            (d.designName || '').toLowerCase().includes(q) ||
            (d.authorName || '').toLowerCase().includes(q) ||
            (d.analysis?.dimensions || '').toLowerCase().includes(q) ||
            (d.analysis?.sunlight || '').toLowerCase().includes(q)
        );
        renderCards(filtered);
    }

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInput) {
        searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(); });
        searchInput.addEventListener('input', () => { if (!searchInput.value) renderCards(allDesigns); });
    }
}

function setupSort() {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;
    sortSelect.addEventListener('change', function () {
        const sorted = [...allDesigns];
        if (this.value === 'popular') {
            sorted.sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0));
        } else {
            sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        renderCards(sorted);
    });
}

// Check user login status
function checkUserStatus() {
    const user = JSON.parse(localStorage.getItem('gardiyUser') || 'null');
    const navActions = document.querySelector('.nav-actions');
    const signInBtn = navActions ? navActions.querySelector('a[href="login.html"]') : null;

    if (user && user.loggedIn) {
        _currentUserId = user.id || user._id || null;
        if (signInBtn) { signInBtn.textContent = user.name || 'Profile'; signInBtn.href = 'profile.html'; }
    }
}

// Helper function to show messages
function showMessage(message, type) {
    document.querySelector('.message-toast')?.remove();
    const div = document.createElement('div');
    div.className = 'message-toast';
    div.textContent = message;
    div.style.cssText = `position:fixed;top:100px;right:20px;padding:16px 24px;border-radius:12px;font-weight:600;z-index:10000;animation:slideIn 0.3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.15);`;
    div.style.background = type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1';
    div.style.color = 'white';
    document.body.appendChild(div);
    setTimeout(() => { div.style.animation = 'slideOut 0.3s ease'; setTimeout(() => div.remove(), 300); }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn  { from { transform:translateX(400px); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideOut { from { transform:translateX(0); opacity:1; } to { transform:translateX(400px); opacity:0; } }
`;
document.head.appendChild(style);
