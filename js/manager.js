// Manager Dashboard JavaScript - WITH HARDSCAPES FULLY INTEGRATED

function compressImageToBase64(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            // Fill white so PNG transparent areas don't become black in JPEG
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}

// Default products including hardscapes
const defaultProducts = [
    // Paths
    { id: 'path-1', name: 'Natural Rock', image: '🪨', category: 'paths', price: 150, type: 'emoji' },
    { id: 'path-2', name: 'Brick', image: '🧱', category: 'paths', price: 200, type: 'emoji' },
    { id: 'path-3', name: 'Concrete', image: '⬜', category: 'paths', price: 120, type: 'emoji' },
    { id: 'path-4', name: 'Wood', image: '🪵', category: 'paths', price: 180, type: 'emoji' },
    
    // Grass
    { id: 'grass-1', name: 'Kentucky Bluegrass', image: '🟩', category: 'grass', price: 80, type: 'emoji' },
    { id: 'grass-2', name: 'Bermuda Grass', image: '🟢', category: 'grass', price: 70, type: 'emoji' },
    { id: 'grass-3', name: 'Zoysia Grass', image: '💚', category: 'grass', price: 90, type: 'emoji' },
    
    // HARDSCAPES (NEW!)
    { id: 'hardscape-1', name: 'Gravel - Light', image: '🪨', category: 'hardscapes', price: 2.50, type: 'emoji', tiling: true },
    { id: 'hardscape-2', name: 'Gravel - Dark', image: '⚫', category: 'hardscapes', price: 3.00, type: 'emoji', tiling: true },
    { id: 'hardscape-3', name: 'River Rocks', image: '🔵', category: 'hardscapes', price: 4.00, type: 'emoji', tiling: true },
    { id: 'hardscape-4', name: 'Marble Chips', image: '⚪', category: 'hardscapes', price: 5.50, type: 'emoji', tiling: true },
    { id: 'hardscape-5', name: 'Pea Gravel', image: '🟤', category: 'hardscapes', price: 2.00, type: 'emoji', tiling: true },
    { id: 'hardscape-6', name: 'Wood Mulch', image: '🟫', category: 'hardscapes', price: 1.80, type: 'emoji', tiling: true },
    
    // Plants
    { id: 'plant-1', name: 'Boxwood Shrub', image: '🌿', category: 'plants', price: 45, type: 'emoji' },
    { id: 'plant-2', name: 'Hostas', image: '🍀', category: 'plants', price: 30, type: 'emoji' },
    { id: 'plant-3', name: 'Lavender', image: '🪴', category: 'plants', price: 25, type: 'emoji' },
    
    // Trees
    { id: 'tree-1', name: 'Japanese Maple', image: '🍁', category: 'trees', price: 250, type: 'emoji' },
    { id: 'tree-2', name: 'Oak Tree', image: '🌳', category: 'trees', price: 400, type: 'emoji' },
    { id: 'tree-3', name: 'Pine Tree', image: '🌲', category: 'trees', price: 300, type: 'emoji' },
    
    // Flowers
    { id: 'flower-1', name: 'Roses', image: '🌹', category: 'flowers', price: 35, type: 'emoji' },
    { id: 'flower-2', name: 'Tulips', image: '🌷', category: 'flowers', price: 20, type: 'emoji' },
    { id: 'flower-3', name: 'Sunflowers', image: '🌻', category: 'flowers', price: 15, type: 'emoji' },
    
    // Rocks & Pavers
    { id: 'rocks-1', name: 'Concrete Paver',      image: '⬜', category: 'rocks_pavers', price: 6.00,  type: 'emoji' },
    { id: 'rocks-2', name: 'Brick Paver',          image: '🧱', category: 'rocks_pavers', price: 7.50,  type: 'emoji' },
    { id: 'rocks-3', name: 'Natural Stone Paver',  image: '🪨', category: 'rocks_pavers', price: 12.00, type: 'emoji' },
    { id: 'rocks-4', name: 'Flagstone',            image: '🟫', category: 'rocks_pavers', price: 8.00,  type: 'emoji' },
    { id: 'rocks-5', name: 'Pea Gravel',           image: '⚫', category: 'rocks_pavers', price: 2.50,  type: 'emoji' },
    { id: 'rocks-6', name: 'Decomposed Granite',   image: '🟡', category: 'rocks_pavers', price: 2.00,  type: 'emoji' },

    // Furniture
    { id: 'furniture-1', name: 'Chairs',       image: '🪑',  category: 'furniture', price: 180, type: 'emoji' },
    { id: 'furniture-2', name: 'Outdoor Sofa', image: '🛋️', category: 'furniture', price: 800, type: 'emoji' },
    { id: 'furniture-3', name: 'Fire Pit',     image: '🔥',  category: 'furniture', price: 450, type: 'emoji' }
];

let products = [];

function initializeProducts() {
    const stored = localStorage.getItem('gardiyProducts');
    if (!stored) {
        console.log('Initializing default products...');
        localStorage.setItem('gardiyProducts', JSON.stringify(defaultProducts));
    } else {
        const parsed = JSON.parse(stored);
        if (parsed.length === 0) {
            console.log('Empty array - adding default products...');
            localStorage.setItem('gardiyProducts', JSON.stringify(defaultProducts));
        } else {
            console.log('Products already exist:', parsed.length, 'items');
        }
    }
}

function supplementWithDefaults(products) {
    const existingCategories = new Set(products.map(p => (p.category || '').toLowerCase()));
    const missing = defaultProducts.filter(p => !existingCategories.has((p.category || '').toLowerCase()));
    return missing.length ? [...products, ...missing] : products;
}

async function getProducts() {
    console.log('Getting products...');

    if (window.ProductAPI && window.MigrationHelper) {
        try {
            const isConnected = await MigrationHelper.checkConnection();
            if (isConnected) {
                console.log('Loading products from backend...');

                try {
                    const result = await ProductAPI.getAll();
                    console.log('Backend response:', result);

                    let products = null;

                    if (Array.isArray(result)) {
                        products = result;
                        console.log('✅ Loaded from backend (direct array):', products.length, 'products');
                    } else if (result && result.success && result.data && Array.isArray(result.data)) {
                        products = result.data;
                        console.log('✅ Loaded from backend (wrapped):', products.length, 'products');
                    }

                    if (products && products.length > 0) {
                        products = products.map((p, idx) => {
                            if (!p.id && !p._id) {
                                p.id = 'product-' + idx;
                            } else if (p._id && !p.id) {
                                p.id = p._id;
                            }
                            return p;
                        });
                        return supplementWithDefaults(products);
                    } else {
                        console.warn('Backend returned empty or invalid data');
                    }
                } catch (apiError) {
                    console.error('Backend API call failed:', apiError);
                }
            }
        } catch (e) {
            console.warn('Backend connection check failed:', e);
        }
    } else {
        console.warn('Backend APIs not available');
    }

    console.log('Falling back to localStorage');
    const stored = localStorage.getItem('gardiyProducts');
    const products = stored ? JSON.parse(stored) : defaultProducts;
    console.log('Getting products from localStorage:', products.length);
    return supplementWithDefaults(products);
}

async function saveProducts(products) {
    console.log('Saving products:', products.length);

    if (window.MigrationHelper && window.ProductAPI) {
        try {
            const isConnected = await MigrationHelper.checkConnection();
            if (isConnected) {
                const result = await ProductAPI.bulkImport(products);
                if (result && result.success) {
                    console.log('✅ Products saved to backend');
                    window.dispatchEvent(new CustomEvent('productsUpdated', { detail: products }));
                    return;
                }
                // Auth failure or other backend error
                if (result && result.message && result.message.toLowerCase().includes('auth')) {
                    showMessage('⚠️ You must be logged in to save products. Please log in first.', 'error');
                    throw new Error('Not authenticated');
                }
                throw new Error(result?.message || 'Backend save failed');
            }
        } catch (e) {
            if (e.message === 'Not authenticated') throw e;
            console.warn('Backend save failed:', e.message);
        }
    }

    // Fallback to localStorage
    localStorage.setItem('gardiyProducts', JSON.stringify(products));
    window.dispatchEvent(new CustomEvent('productsUpdated', { detail: products }));
    console.log('Saved to localStorage (offline fallback)');
}

async function addProduct(product) {
    product.id = 'custom-' + Date.now();
    console.log('Adding product:', product.name);
    
    if (window.ProductAPI && window.MigrationHelper) {
        try {
            const isConnected = await MigrationHelper.checkConnection();
            if (isConnected) {
                const result = await ProductAPI.create(product);
                if (result && result.success) {
                    console.log('✅ Product added to backend');
                    return product;
                }
            }
        } catch (e) {
            console.warn('Backend add failed, using localStorage:', e);
        }
    }
    
    const products = await getProducts();
    products.push(product);
    await saveProducts(products);
    return product;
}

async function updateProduct(productId, updatedData) {
    console.log('updateProduct called with ID:', productId);
    
    const products = await getProducts();
    const index = products.findIndex(p => p.id === productId || p._id === productId);
    console.log('Product index:', index);
    
    if (index !== -1) {
        products[index] = { ...products[index], ...updatedData };
        console.log('Updating product:', {
            ...products[index],
            image: products[index].image.substring(0, 50) + '...'
        });
        await saveProducts(products);
        return products[index];
    } else {
        console.error('Product not found with ID:', productId);
    }
    return null;
}

async function deleteProduct(productId) {
    console.log('🗑️ Starting delete for product:', productId);
    
    try {
        const products = await getProducts();
        console.log('📦 Current products count:', products.length);
        
        const productToDelete = products.find(p => p.id === productId || p._id === productId);
        if (!productToDelete) {
            console.error('❌ Product not found:', productId);
            alert('Error: Product not found!');
            return;
        }
        
        console.log('🎯 Found product to delete:', productToDelete.name);
        
        const filtered = products.filter(p => p.id !== productId && p._id !== productId);
        console.log('📦 Products after filter:', filtered.length);
        
        if (filtered.length === products.length) {
            console.error('❌ Filter failed - no products removed!');
            alert('Error: Failed to remove product from list!');
            return;
        }
        
        console.log('💾 Saving filtered products to backend...');
        await saveProducts(filtered);
        
        console.log('✅ Product deleted successfully!');
    } catch (error) {
        console.error('❌ Delete failed:', error);
        alert('Error deleting product: ' + error.message);
    }
}

function managerLogout() {
    localStorage.removeItem('gardiyUser');
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
    let session = {};
    try { session = JSON.parse(localStorage.getItem('gardiyUser') || '{}'); } catch {}

    if (!session.token || !session.loggedIn) {
        window.location.href = 'login.html?next=manager.html';
        return;
    }
    if (!session.isAdmin) {
        document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:1rem;color:#4a5568;">
            <div style="font-size:48px;">🔒</div>
            <h2 style="margin:0;">Manager access only</h2>
            <p style="margin:0;color:#718096;">Your account (${session.email}) does not have manager permissions.</p>
            <a href="profile.html" style="color:#10b981;text-decoration:none;font-weight:600;">← Back to Profile</a>
        </div>`;
        return;
    }

    // Admin confirmed — update nav
    const authEl = document.getElementById('authStatus');
    const logoutBtn = document.getElementById('logoutBtn');
    if (authEl) { authEl.textContent = session.name || session.email; authEl.style.background = '#d1fae5'; authEl.style.color = '#065f46'; }
    if (logoutBtn) logoutBtn.style.display = 'inline-block';

    setupTabs();
    loadProductsGrid();
    setupAddProductButton();
    if (typeof loadStats === 'function') loadStats();
});

function setupTabs() {
    const menuItems = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');
            
            tabContents.forEach(tc => tc.classList.remove('active'));
            const targetTab = document.getElementById(tabName + '-tab');
            if (targetTab) {
                targetTab.classList.add('active');
            }
            
            if (tabName === 'products') loadProductsGrid();
            if (tabName === 'designs' && typeof loadSubmissions === 'function') loadSubmissions();
        });
    });
}

async function loadProductsGrid() {
    console.log('Loading products grid...');
    const productsGrid = document.getElementById('productsGrid');
    
    if (!productsGrid) {
        console.error('Products grid not found!');
        return;
    }
    
    const products = await getProducts();
    console.log('Products to display:', products.length);
    
    if (products.length > 0) {
        console.log('Sample product keys:', Object.keys(products[0]));
        console.log('Sample product:', products[0]);
    }
    
    if (products.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state">
                <h3>No products yet</h3>
                <p>Click "Add Product" to create your first product</p>
            </div>
        `;
        return;
    }
    
    const categories = {
        'paths':        'Paths',
        'grass':        'Grass',
        'hardscapes':   'Hardscapes',
        'rocks_pavers': 'Rocks & Pavers',
        'plants':       'Plants',
        'trees':        'Trees',
        'flowers':      'Flowers',
        'furniture':    'Furniture',
    };
    
    let html = '';
    
    for (const [catKey, catName] of Object.entries(categories)) {
        const catProducts = products.filter(p => p.category === catKey);
        
        if (catProducts.length > 0) {
            html += `
                <div class="category-section">
                    <h3>${catName} (${catProducts.length})</h3>
                    <div class="products-list">
            `;
            
            catProducts.forEach(product => {
                const productId = product.id || product._id;
                
                const displayImage = product.type === 'emoji' 
                    ? `<div class="product-emoji">${product.image}</div>`
                    : `<img src="${product.image}" class="product-image" alt="${product.name}">`;
                
                const tilingBadge = product.tiling ? '<span class="tiling-badge">🔄 Tiling</span>' : '';
                
                html += `
                    <div class="product-card" data-id="${productId}">
                        ${displayImage}
                        <div class="product-info">
                            <h4>${product.name}</h4>
                            <p class="product-price">$${product.price}</p>
                            <p class="product-category">${catName}</p>
                            <p class="product-type">${product.type === 'emoji' ? '🎨 Emoji' : '📷 Image'}</p>
                            ${tilingBadge}
                        </div>
                        <div class="product-actions">
                            <button class="edit-product-btn" data-id="${productId}">✏️ Edit</button>
                            <button class="delete-product-btn" data-id="${productId}">🗑️ Delete</button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    }
    
    if (html === '') {
        html = `
            <div class="empty-state">
                <h3>No products in any category</h3>
                <p>Click "Add Product" to create your first product</p>
            </div>
        `;
    }
    
    productsGrid.innerHTML = html;
    console.log('Products grid loaded successfully');
    
    setupProductActions();
}

async function setupProductActions() {
    console.log('🔧 Setting up product action buttons...');
    
    const editButtons = document.querySelectorAll('.edit-product-btn');
    const deleteButtons = document.querySelectorAll('.delete-product-btn');
    
    console.log('Found buttons:', {
        edit: editButtons.length,
        delete: deleteButtons.length
    });
    
    editButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('✏️ Edit button clicked!');
            const productId = this.dataset.id;
            console.log('Product ID:', productId);
            
            const products = await getProducts();
            const product = products.find(p => p.id === productId || p._id === productId);
            
            console.log('Found product:', product);
            
            if (product) {
                openEditProductModal(product);
            } else {
                console.error('Product not found!');
            }
        });
    });
    
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('🗑️ Delete button clicked!');
            const productId = this.dataset.id;
            console.log('Product ID:', productId);
            
            const products = await getProducts();
            const product = products.find(p => p.id === productId || p._id === productId);
            
            console.log('Found product:', product);
            
            if (product && confirm(`Delete "${product.name}"? This will remove it from the design page.`)) {
                console.log('Confirmed delete, proceeding...');
                await deleteProduct(productId);
                await loadProductsGrid();
                showMessage('Product deleted successfully!', 'success');
            }
        });
    });
    
    console.log('✅ Product action buttons setup complete');
}

function setupAddProductButton() {
    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            openAddProductModal();
        });
    }
}

function openAddProductModal() {
    const modal = createProductModal();
    document.body.appendChild(modal);
}

function openEditProductModal(product) {
    const modal = createProductModal(product);
    document.body.appendChild(modal);
}

function createProductModal(existingProduct = null) {
    const isEdit = existingProduct !== null;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
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
    
    const imagePreview = existingProduct && existingProduct.type === 'image'
        ? `<img src="${existingProduct.image}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 12px;">`
        : existingProduct && existingProduct.type === 'emoji'
        ? `<div style="font-size: 64px;">${existingProduct.image}</div>`
        : '<div style="color: #cbd5e0;">No image</div>';
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
        ">
            <h2 style="margin-bottom: 24px;">${isEdit ? '✏️ Edit Product' : '➕ Add New Product'}</h2>
            
            <form id="productForm">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">Product Name *</label>
                    <input type="text" id="productName" value="${existingProduct?.name || ''}" 
                        placeholder="e.g., Lavender Bush" required
                        style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; box-sizing: border-box;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">Image Type *</label>
                    <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                        <label style="flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; cursor: pointer; text-align: center;">
                            <input type="radio" name="imageType" value="emoji" ${!existingProduct || existingProduct.type === 'emoji' ? 'checked' : ''} style="margin-right: 8px;">
                            🎨 Emoji
                        </label>
                        <label style="flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; cursor: pointer; text-align: center;">
                            <input type="radio" name="imageType" value="image" ${existingProduct?.type === 'image' ? 'checked' : ''} style="margin-right: 8px;">
                            📷 Upload Image
                        </label>
                    </div>
                </div>
                
                <div id="emojiSection" style="margin-bottom: 20px; ${existingProduct?.type === 'image' ? 'display: none;' : ''}">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">Emoji Icon *</label>
                    <input type="text" id="productEmoji" value="${existingProduct?.type === 'emoji' ? existingProduct.image : ''}" 
                        placeholder="🌹" maxlength="2"
                        style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 24px; box-sizing: border-box;">
                    <p style="font-size: 12px; color: #718096; margin-top: 4px;">Choose an emoji to represent this product</p>
                </div>
                
                <div id="imageSection" style="margin-bottom: 20px; ${existingProduct?.type !== 'image' ? 'display: none;' : ''}">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">Product Image *</label>
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div id="imagePreview" style="
                            width: 200px;
                            height: 200px;
                            border: 2px dashed #e2e8f0;
                            border-radius: 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: #f7fafc;
                            flex-shrink: 0;
                        ">
                            ${imagePreview}
                        </div>
                        <div style="flex: 1;">
                            <input type="file" id="productImage" accept="image/*" 
                                style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; box-sizing: border-box;">
                            <p style="font-size: 12px; color: #718096; margin-top: 8px;">
                                Upload a PNG, JPG, or WEBP image<br>
                                Transparent backgrounds work best!
                            </p>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">Category *</label>
                    <select id="productCategory" required
                        style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; box-sizing: border-box;">
                        <option value="">Select category...</option>
                        <option value="paths"        ${existingProduct?.category === 'paths'        ? 'selected' : ''}>Paths</option>
                        <option value="grass"        ${existingProduct?.category === 'grass'        ? 'selected' : ''}>Grass</option>
                        <option value="hardscapes"   ${existingProduct?.category === 'hardscapes'   ? 'selected' : ''}>Hardscapes</option>
                        <option value="rocks_pavers" ${existingProduct?.category === 'rocks_pavers' ? 'selected' : ''}>Rocks &amp; Pavers</option>
                        <option value="plants"       ${existingProduct?.category === 'plants'       ? 'selected' : ''}>Plants</option>
                        <option value="trees"        ${existingProduct?.category === 'trees'        ? 'selected' : ''}>Trees</option>
                        <option value="flowers"      ${existingProduct?.category === 'flowers'      ? 'selected' : ''}>Flowers</option>
                        <option value="furniture"    ${existingProduct?.category === 'furniture'    ? 'selected' : ''}>Furniture</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                        <input type="checkbox" id="tilingCheckbox" ${existingProduct?.tiling ? 'checked' : ''} style="margin-right: 8px;">
                        🔄 Enable Tiling (for hardscapes)
                    </label>
                    <p style="font-size: 12px; color: #718096; margin-top: 4px;">Check this for gravel, mulch, and other hardscapes that should tile/repeat</p>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 8px;">Price ($) *</label>
                    <input type="number" id="productPrice" value="${existingProduct?.price || ''}" 
                        placeholder="150" required min="0" step="0.01"
                        style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; box-sizing: border-box;">
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button type="button" id="cancelBtn"
                        style="flex: 1; padding: 14px; background: white; border: 2px solid #e2e8f0; 
                        border-radius: 12px; font-weight: 600; cursor: pointer;">
                        Cancel
                    </button>
                    <button type="submit" id="submitBtn"
                        style="flex: 1; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
                        ${isEdit ? 'Update Product' : 'Add Product'}
                    </button>
                </div>
            </form>
        </div>
    `;
    
    const imageTypeRadios = modal.querySelectorAll('input[name="imageType"]');
    const emojiSection = modal.querySelector('#emojiSection');
    const imageSection = modal.querySelector('#imageSection');
    
    imageTypeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'emoji') {
                emojiSection.style.display = 'block';
                imageSection.style.display = 'none';
            } else {
                emojiSection.style.display = 'none';
                imageSection.style.display = 'block';
            }
        });
    });
    
    const imageInput = modal.querySelector('#productImage');
    const imagePreviewDiv = modal.querySelector('#imagePreview');
    
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    imagePreviewDiv.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 12px;">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    modal.querySelector('#cancelBtn').addEventListener('click', () => {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => modal.remove(), 300);
        }
    });
    
    const form = modal.querySelector('#productForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const imageType = modal.querySelector('input[name="imageType"]:checked').value;
        const tilingEnabled = modal.querySelector('#tilingCheckbox').checked;
        let imageData = '';
        
        if (imageType === 'emoji') {
            imageData = modal.querySelector('#productEmoji').value.trim();
            if (!imageData) {
                alert('Please enter an emoji!');
                return;
            }
        } else {
            const imageFile = modal.querySelector('#productImage').files[0];
            
            if (!imageFile && !existingProduct) {
                alert('Please upload an image!');
                return;
            }
            
            if (isEdit && existingProduct.type === 'emoji' && imageType === 'image' && !imageFile) {
                alert('Please upload an image to switch from emoji to image type!');
                return;
            }
            
            if (imageFile) {
                try {
                    imageData = await compressImageToBase64(imageFile, 120, 0.70);
                    console.log('Image compressed, length:', imageData.length);
                } catch (error) {
                    alert('Error reading image file. Please try again.');
                    console.error('Image read error:', error);
                    return;
                }
            } else if (existingProduct && existingProduct.type === 'image') {
                imageData = existingProduct.image;
                console.log('Keeping existing image');
            }
        }
        
        const productData = {
            name: modal.querySelector('#productName').value.trim(),
            image: imageData,
            type: imageType,
            category: modal.querySelector('#productCategory').value,
            price: parseFloat(modal.querySelector('#productPrice').value),
            tiling: tilingEnabled
        };
        
        console.log('Submitting product:', {
            ...productData,
            image: productData.image.substring(0, 50) + '...'
        });
        
        if (isEdit) {
            const result = await updateProduct(existingProduct.id, productData);
            if (result) {
                showMessage('Product updated successfully!', 'success');
            } else {
                showMessage('Error updating product!', 'error');
                return;
            }
        } else {
            await addProduct(productData);
            showMessage('Product added successfully! It will appear in the design page.', 'success');
        }
        
        await loadProductsGrid();
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.remove(), 300);
    });
    
    return modal;
}

function showMessage(message, type) {
    const existingMessage = document.querySelector('.manager-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'manager-message';
    messageDiv.textContent = message;
    
    messageDiv.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        z-index: 10001;
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

const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    
    .category-section {
        margin-bottom: 32px;
    }
    
    .category-section h3 {
        font-size: 20px;
        color: #2d3748;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e2e8f0;
    }
    
    .products-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
    }
    
    .product-card {
        background: white;
        border: 2px solid #e2e8f0;
        border-radius: 16px;
        padding: 20px;
        transition: all 0.3s ease;
    }
    
    .product-card:hover {
        border-color: #667eea;
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    }
    
    .product-emoji {
        font-size: 48px;
        text-align: center;
        margin-bottom: 12px;
    }
    
    .product-image {
        width: 100%;
        height: 120px;
        object-fit: contain;
        margin-bottom: 12px;
        border-radius: 8px;
    }
    
    .product-info h4 {
        font-size: 18px;
        color: #2d3748;
        margin-bottom: 8px;
    }
    
    .product-price {
        font-size: 20px;
        font-weight: 700;
        color: #667eea;
        margin-bottom: 4px;
    }
    
    .product-category {
        font-size: 13px;
        color: #718096;
        margin-bottom: 4px;
    }
    
    .product-type {
        font-size: 12px;
        color: #a0aec0;
        margin-bottom: 8px;
    }
    
    .tiling-badge {
        display: inline-block;
        background: #667eea;
        color: white;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 600;
        margin-bottom: 12px;
    }
    
    .product-actions {
        display: flex;
        gap: 8px;
    }
    
    .edit-product-btn,
    .delete-product-btn {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.3s ease;
    }
    
    .edit-product-btn:hover {
        background: #667eea;
        color: white;
        border-color: #667eea;
    }
    
    .delete-product-btn:hover {
        background: #f56565;
        color: white;
        border-color: #f56565;
    }
    
    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #718096;
    }
`;
document.head.appendChild(style);

console.log('✅ Manager page with Hardscapes fully integrated');
