console.log('🎨 Design page loaded');

// ── Hardscape / Mulch coverage table (SF per ton at stated depth) ─────────────
const HARDSCAPE_COVERAGE = {
    'Colorado Rose 1.5"':         85,    // avg 80–90 SF/ton at 2"
    'Horizon Cobblestone 2–4"':   70,    // avg 65–75
    'Local River 1.5"':           85,
    'Mountain Granite 3/4"':      95,    // avg 90–100
    'Rainbow Cobblestone 2–4"':   70,
    'White Cobblestone 2–4"':     70,
    'White Cobblestone 4–8"':     52.5,  // avg 45–60
    'Second Harvest Brown Mulch': 130,   // avg 120–140 SF/ton at 3"
    'Second Harvest Black Mulch': 130,
    'Second Harvest Red Mulch':   130,
};

// Returns SF-per-pixel² based on Claude's analysis OR the manual area input
function getSqFtScale() {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) { console.warn('[SF] designCanvas not found'); return null; }

    // 1. Try manual input first
    const manualInput = document.getElementById('manualAreaInput');
    const manualVal   = manualInput ? parseFloat(manualInput.value) : NaN;

    // 2. Try Claude analysis
    const analysis  = window.GarDIYStorage?.getAnalysis();
    const claudeVal = analysis?.squareFeet && analysis.squareFeet !== '—'
        ? parseFloat(analysis.squareFeet) : NaN;

    const totalSqFt = !isNaN(manualVal) && manualVal > 0 ? manualVal
                    : !isNaN(claudeVal) && claudeVal > 0 ? claudeVal
                    : NaN;

    console.log('[SF] manualVal:', manualVal, '| claudeVal:', claudeVal, '| using:', totalSqFt);

    if (isNaN(totalSqFt)) { console.warn('[SF] No total area — enter it in the materials panel'); return null; }

    const px = canvas.offsetWidth * canvas.offsetHeight;
    console.log('[SF] canvas px²:', px, '| scale:', totalSqFt / px);
    return totalSqFt / px;
}

// Shoelace formula — polygon area in pixels²
function polygonAreaPx(points) {
    let area = 0, n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

// Returns sq ft covered by a placed item (null if no scale available)
function getItemSqFt(placedItem) {
    const scale = getSqFtScale();
    if (!scale) return null;
    const el = placedItem.element;
    if (el.dataset.polyPoints) {
        const pts    = JSON.parse(el.dataset.polyPoints);
        const areaPx = pts.length >= 3 ? polygonAreaPx(pts) : 0;
        const sqFt   = areaPx * scale;
        console.log(`[SF] "${placedItem.name}" polyPoints(${pts.length}) areaPx=${areaPx.toFixed(0)} → ${sqFt.toFixed(1)} sqFt`);
        return pts.length >= 3 ? sqFt : null;
    }
    const w    = parseFloat(el.style.width)  || el.offsetWidth;
    const h    = parseFloat(el.style.height) || el.offsetHeight;
    const sqFt = w * h * scale;
    console.log(`[SF] "${placedItem.name}" rect ${w}×${h}px → ${sqFt.toFixed(1)} sqFt`);
    return sqFt;
}

// Keyword-based coverage lookup — handles typos, truncation, any naming variation
function getCoverageRate(name) {
    // Exact match first
    if (HARDSCAPE_COVERAGE[name] !== undefined) return HARDSCAPE_COVERAGE[name];

    const n = name.toLowerCase().replace(/[""''–—]/g, ' ').replace(/\s+/g, ' ').trim();

    // Mulch — check before cobblestone so "harvest" keywords win
    if (n.includes('mulch') || n.includes('harvest')) {
        if (n.includes('brown')) { console.log(`[SF] keyword match "${name}" → Brown Mulch 130`); return 130; }
        if (n.includes('black')) { console.log(`[SF] keyword match "${name}" → Black Mulch 130`); return 130; }
        if (n.includes('red'))   { console.log(`[SF] keyword match "${name}" → Red Mulch 130`);   return 130; }
        console.log(`[SF] keyword match "${name}" → Mulch (generic) 130`); return 130;
    }

    // Cobblestone / Cbblestone variants — size matters
    if (n.includes('cobble') || n.includes('cbble') || n.includes('coblestone')) {
        if (n.includes('4') && (n.includes('8') || n.includes('- 8'))) {
            console.log(`[SF] keyword match "${name}" → Cobblestone 4-8" 52.5`); return 52.5;
        }
        console.log(`[SF] keyword match "${name}" → Cobblestone 2-4" 70`); return 70;
    }

    // Specific stone types
    if (n.includes('colorado') || n.includes('rose')) {
        console.log(`[SF] keyword match "${name}" → Colorado Rose 85`); return 85;
    }
    if (n.includes('river')) {
        console.log(`[SF] keyword match "${name}" → River Rock 85`); return 85;
    }
    if (n.includes('granite')) {
        console.log(`[SF] keyword match "${name}" → Granite 95`); return 95;
    }
    if (n.includes('rainbow')) {
        console.log(`[SF] keyword match "${name}" → Rainbow Cobblestone 70`); return 70;
    }
    if (n.includes('white') && (n.includes('cobble') || n.includes('stone'))) {
        if (n.includes('4') && n.includes('8')) {
            console.log(`[SF] keyword match "${name}" → White Cobblestone 4-8" 52.5`); return 52.5;
        }
        console.log(`[SF] keyword match "${name}" → White Cobblestone 2-4" 70`); return 70;
    }

    console.log(`[SF] no coverage match for "${name}"`);
    return undefined;
}

// ── Global state ──────────────────────────────────────────────────────────────
let placedItems    = [];
let selectedItem   = null;
let controlPanel   = null;
let itemIdCounter  = 0;
let isRotating     = false;
let rotationCenter = { x: 0, y: 0 };

// Polygon dots (grass / hardscapes)
let polyDots          = [];
let isDraggingPolyDot = false;
let draggedPolyDot    = null;
let polyDotIdCounter  = 0;

// Path dots (paths category)
let meshDots      = [];
let isDraggingDot = false;
let draggedDot    = null;
let dotIdCounter  = 0;

// Corner resize handles (regular items)
let cornerHandles = [];

// ── Mock products ─────────────────────────────────────────────────────────────
function getMockProducts() {
    return [
        { id: 1,  name: 'Stone Pathway',   category: 'paths',      type: 'emoji', image: '🛤️', price: 150  },
        { id: 2,  name: 'Wood Chips Path', category: 'paths',      type: 'emoji', image: '🟤', price: 120  },
        { id: 3,  name: 'Brick Path',      category: 'paths',      type: 'emoji', image: '🧱', price: 200  },
        { id: 4,  name: 'Lawn',            category: 'grass',      type: 'emoji', image: '🌿', price: 0.50 },
        { id: 5,  name: 'Grass Field',     category: 'grass',      type: 'emoji', image: '🌾', price: 0.40 },
        { id: 6,  name: 'Small Plant',     category: 'plants',     type: 'emoji', image: '🌱', price: 25   },
        { id: 7,  name: 'Potted Plant',    category: 'plants',     type: 'emoji', image: '🪴', price: 45   },
        { id: 8,  name: 'Cactus',          category: 'plants',     type: 'emoji', image: '🌵', price: 35   },
        { id: 9,  name: 'Tree',            category: 'trees',      type: 'emoji', image: '🌳', price: 150  },
        { id: 10, name: 'Palm Tree',       category: 'trees',      type: 'emoji', image: '🌴', price: 200  },
        { id: 11, name: 'Deciduous Tree',  category: 'trees',      type: 'emoji', image: '🌲', price: 180  },
        { id: 12, name: 'Rose',            category: 'flowers',    type: 'emoji', image: '🌹', price: 20   },
        { id: 13, name: 'Sunflower',       category: 'flowers',    type: 'emoji', image: '🌻', price: 25   },
        { id: 14, name: 'Tulip',           category: 'flowers',    type: 'emoji', image: '🌷', price: 18   },
        { id: 15, name: 'Cherry Blossom',  category: 'flowers',    type: 'emoji', image: '🌸', price: 30   },
        { id: 16, name: 'Bench',           category: 'furniture',  type: 'emoji', image: '🪑', price: 200  },
        { id: 17, name: 'Table',           category: 'furniture',  type: 'emoji', image: '🛋️', price: 300  },
        { id: 18, name: 'Fountain',        category: 'furniture',  type: 'emoji', image: '⛲', price: 500  },
    ];
}

async function getProducts() {
    if (window.ProductAPI && window.MigrationHelper) {
        try {
            const connected = await MigrationHelper.checkConnection();
            if (connected) {
                const result = await ProductAPI.getAll();
                const products = Array.isArray(result) ? result
                    : (result?.products && Array.isArray(result.products)) ? result.products
                    : (result?.data    && Array.isArray(result.data))     ? result.data
                    : null;
                if (products?.length) return products;
            }
        } catch (e) { console.warn('Backend unavailable, using fallback'); }
    }
    const stored = localStorage.getItem('gardiyProducts');
    if (stored) { try { return JSON.parse(stored); } catch (e) {} }
    return getMockProducts();
}

async function getItemPrices() {
    const products = await getProducts();
    const map = {};
    products.forEach(p => map[p.name] = p.price);
    return map;
}

// ── Category helpers ──────────────────────────────────────────────────────────
function isGrassItem(n, c)     { return (c||'').toLowerCase() === 'grass'; }
function isHardscapeItem(n, c) { return (c||'').toLowerCase() === 'hardscapes'; }
function isMeshItem(n, c)      { return isGrassItem(n, c) || isHardscapeItem(n, c); }
function isPathItem(n, c) {
    return (c||'').toLowerCase() === 'paths' ||
        ['path','pathway','walkway'].some(k => (n||'').toLowerCase().includes(k));
}

// ── DOM ready ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    checkUserStatus();
    await loadProductCategories();

    const savedImage = window.GarDIYStorage?.getImage();
    const canvasImage = document.getElementById('canvasImage');
    const canvasHint  = document.getElementById('canvasHint');
    if (savedImage && canvasImage) {
        canvasImage.src = savedImage;
        if (canvasHint) canvasHint.style.display = 'none';
    }

    setupCategoryButtons();
    setupCanvasClick();
    setupCheckoutButtons();
    loadSavedDesign();

    // Pre-fill area input from Claude analysis, wire up live recalc
    const areaInput = document.getElementById('manualAreaInput');
    if (areaInput) {
        const analysis = window.GarDIYStorage?.getAnalysis();
        const claudeSF = analysis?.squareFeet && analysis.squareFeet !== '—' ? parseFloat(analysis.squareFeet) : null;
        if (claudeSF) { areaInput.value = claudeSF; console.log('[SF] Pre-filled area from Claude:', claudeSF, 'sq ft'); }
        areaInput.addEventListener('input', () => { console.log('[SF] Manual area changed to:', areaInput.value); updateMaterialsList(); });
    }

    // ── Global mousemove: poly dot drag + path dot drag ──
    document.addEventListener('mousemove', e => {
        const canvas = document.getElementById('designCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Poly dot drag (grass / hardscapes)
        if (isDraggingPolyDot && draggedPolyDot && selectedItem) {
            draggedPolyDot.style.left = mx + 'px';
            draggedPolyDot.style.top  = my + 'px';
            const dotId = parseInt(draggedPolyDot.dataset.dotId);
            const points = JSON.parse(selectedItem.dataset.polyPoints || '[]');
            const idx = points.findIndex(p => p.id === dotId);
            if (idx !== -1) {
                points[idx].x = mx;
                points[idx].y = my;
                selectedItem.dataset.polyPoints = JSON.stringify(points);
                applyPolyShape(selectedItem);
                updateControlPanelPosition(selectedItem);
            }
        }

        // Path dot drag
        if (isDraggingDot && draggedDot && selectedItem) {
            draggedDot.style.left = mx + 'px';
            draggedDot.style.top  = my + 'px';
            const dotId = parseInt(draggedDot.dataset.dotId);
            const points = JSON.parse(selectedItem.dataset.pathPoints || '[]');
            const idx = points.findIndex(p => p.id === dotId);
            if (idx !== -1) {
                points[idx].x = mx;
                points[idx].y = my;
                selectedItem.dataset.pathPoints = JSON.stringify(points);
                applyPathShape(selectedItem);
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingPolyDot) updateMaterialsList();
        isDraggingPolyDot = false; draggedPolyDot = null;
        isDraggingDot     = false; draggedDot     = null;
    });
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
// Keyed by numeric index matching data-pid attribute — avoids putting large
// base64 strings or unescaped quotes into HTML data attributes.
const productRegistry = {};

async function loadProductCategories() {
    const products = await getProducts();
    if (!products.length) return;

    // Build registry so click handler can look up full product data by index
    products.forEach((p, i) => { productRegistry[i] = p; });

    const categories = {
        paths:      { name: 'Paths',      icon: '🛤️', products: [] },
        grass:      { name: 'Grass',      icon: '🌿', products: [] },
        hardscapes: { name: 'Hardscapes', icon: '🪨', products: [] },
        plants:     { name: 'Plants',     icon: '🌱', products: [] },
        trees:      { name: 'Trees',      icon: '🌳', products: [] },
        flowers:    { name: 'Flowers',    icon: '🌸', products: [] },
        furniture:  { name: 'Furniture',  icon: '🪑', products: [] },
    };

    products.forEach((p, i) => {
        if (categories[p.category]) categories[p.category].products.push({ ...p, _pid: i });
    });

    const sidebar = document.querySelector('.design-sidebar');
    if (!sidebar) return;

    const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    let html = '<h3>🎨 Products</h3><div class="category-list">';
    Object.keys(categories).forEach(key => {
        const cat = categories[key];
        if (!cat.products.length) return;
        html += `<div class="category-section" data-category="${key}">
            <button class="category-btn">
                <span class="category-icon">${cat.icon}</span>
                <span>${cat.name}</span>
                <span class="expand-icon">▼</span>
            </button>
            <div class="category-items" style="display:none;">`;
        cat.products.forEach(p => {
            const thumb = p.type === 'image'
                ? `<img src="${esc(p.image)}" style="width:40px;height:40px;object-fit:contain;border-radius:8px;">`
                : `<span style="font-size:32px;">${esc(p.image)}</span>`;
            html += `<div class="product-item" data-pid="${p._pid}">
                ${thumb}
                <div class="product-info">
                    <div class="product-name">${esc(p.name)}</div>
                    <div class="product-price">$${p.price}</div>
                </div>
            </div>`;
        });
        html += '</div></div>';
    });
    html += '</div>';
    sidebar.innerHTML = html;
}

function setupCategoryButtons() {
    document.addEventListener('click', e => {
        if (!e.target.closest('.category-btn')) return;
        const section = e.target.closest('.category-section');
        const items   = section.querySelector('.category-items');
        const icon    = section.querySelector('.expand-icon');
        const open    = items.style.display !== 'none';
        items.style.display = open ? 'none' : 'block';
        icon.textContent    = open ? '▼' : '▲';
    });
}

function setupCanvasClick() {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;
    canvas.addEventListener('click', e => {
        if (e.target.closest('.draggable-item') ||
            e.target.closest('.control-panel')  ||
            e.target.classList.contains('poly-dot') ||
            e.target.classList.contains('mesh-dot')) return;
        deselectItem();
    });
}

// ── Product click → add to canvas ────────────────────────────────────────────
document.addEventListener('click', async e => {
    const item = e.target.closest('.product-item');
    if (!item) return;
    const pid = item.dataset.pid;
    const p = productRegistry[pid];
    if (!p) return;
    const canvas = document.getElementById('designCanvas');
    const rect   = canvas.getBoundingClientRect();
    const data   = {
        name: p.name, image: p.image,
        type: p.type, category: p.category,
        price: parseFloat(p.price),
    };
    const isMesh = isMeshItem(data.name, data.category);
    const x = isMesh ? rect.width  / 2 - 200 : rect.width  / 2 - 40;
    const y = isMesh ? rect.height / 2 - 125 : rect.height / 2 - 40;
    await addItemToCanvas(data, x, y);
});

// ── Add item to canvas ────────────────────────────────────────────────────────
async function addItemToCanvas(itemData, x, y) {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    const isMesh = isMeshItem(itemData.name, itemData.category);
    const isPath = isPathItem(itemData.name, itemData.category);
    const w = isMesh ? 400 : 80;
    const h = isMesh ? 250 : 80;

    const item = document.createElement('div');
    item.className        = 'draggable-item';
    item.dataset.id       = itemIdCounter++;
    item.dataset.name     = itemData.name;
    item.dataset.category = itemData.category;
    item.dataset.type     = itemData.type;
    item.dataset.rotation = '0';
    item.dataset.imageUrl = itemData.image;

    item.style.cssText = `
        position:absolute; left:${x}px; top:${y}px;
        width:${w}px; height:${h}px;
        cursor:move; user-select:none;
        z-index:${Math.min(itemIdCounter, 100)};
        display:flex; align-items:center; justify-content:center;
    `;

    if (isMesh) {
        item.style.overflow     = 'hidden';
        item.style.borderRadius = '4px';

        // 4 corner dots in canvas-absolute coordinates
        const polyPoints = [
            { id: polyDotIdCounter++, x: x,     y: y     },
            { id: polyDotIdCounter++, x: x + w, y: y     },
            { id: polyDotIdCounter++, x: x + w, y: y + h },
            { id: polyDotIdCounter++, x: x,     y: y + h },
        ];
        item.dataset.polyPoints = JSON.stringify(polyPoints);

        if (itemData.type === 'image') {
            item.innerHTML = `<img src="${itemData.image}" style="width:100%;height:100%;object-fit:fill;pointer-events:none;display:block;">`;
        } else {
            item.style.backgroundColor = 'rgba(120,190,90,0.3)';
            item.innerHTML = `<span style="font-size:64px;opacity:0.7;pointer-events:none;">${itemData.image}</span>`;
        }

        // Double-click on item → add dot at that exact position
        item.addEventListener('dblclick', e => {
            if (e.target.classList.contains('poly-dot')) return;
            e.preventDefault(); e.stopPropagation();
            if (item !== selectedItem) { selectItem(item); return; }
            const r = canvas.getBoundingClientRect();
            addPolyDot(e.clientX - r.left, e.clientY - r.top, item);
        });

    } else if (isPath) {
        const pathPoints = [
            { id: dotIdCounter++, x: x,       y: y },
            { id: dotIdCounter++, x: x + 100, y: y },
            { id: dotIdCounter++, x: x + 200, y: y },
        ];
        item.dataset.pathPoints = JSON.stringify(pathPoints);
        item.dataset.pathWidth  = '40';
    } else {
        if (itemData.type === 'image') {
            item.innerHTML = `<img src="${itemData.image}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;border-radius:8px;">`;
        } else {
            item.innerHTML = `<span style="font-size:48px;pointer-events:none;">${itemData.image}</span>`;
        }
    }

    canvas.appendChild(item);

    const prices = await getItemPrices();
    placedItems.push({
        id: item.dataset.id, element: item,
        name: itemData.name, category: itemData.category,
        type: itemData.type, price: prices[itemData.name] || itemData.price || 0,
    });

    makeDraggable(item);
    updateMaterialsList();
    selectItem(item);
}

// ── Drag ──────────────────────────────────────────────────────────────────────
function makeDraggable(item) {
    let dragging = false, sx, sy;

    item.addEventListener('mousedown', e => {
        if (e.target.classList.contains('poly-dot')) return;
        if (e.target.classList.contains('mesh-dot')) return;
        if (isRotating) return;
        selectItem(item);
        dragging = true; sx = e.clientX; sy = e.clientY;
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        sx = e.clientX; sy = e.clientY;

        if (item.dataset.polyPoints) {
            const points = JSON.parse(item.dataset.polyPoints).map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
            item.dataset.polyPoints = JSON.stringify(points);
            applyPolyShape(item);
            if (item === selectedItem) updatePolyDotPositions(item);
        } else {
            item.style.left = (parseInt(item.style.left) || 0) + dx + 'px';
            item.style.top  = (parseInt(item.style.top)  || 0) + dy + 'px';
            if (item === selectedItem) positionCornerHandles(item);
        }
        updateControlPanelPosition(item);
    });

    document.addEventListener('mouseup', () => { dragging = false; });
}

// ── Select / deselect ─────────────────────────────────────────────────────────
function selectItem(item) {
    if (selectedItem === item) return;
    deselectItem();
    selectedItem = item;
    item.classList.add('selected');

    if (isMeshItem(item.dataset.name, item.dataset.category)) {
        createPolyDots(item);
    } else if (isPathItem(item.dataset.name, item.dataset.category)) {
        createPathControls(item);
    } else {
        createCornerHandles(item);
    }
    createControlPanel(item);
}

function deselectItem() {
    if (!selectedItem) return;
    selectedItem.classList.remove('selected');
    selectedItem = null;
    removePolyDots();
    removeMeshDots();
    removeCornerHandles();
    removeControlPanel();
}

// ── Polygon dot system ────────────────────────────────────────────────────────

function createPolyDots(item) {
    removePolyDots();
    const canvas = document.getElementById('designCanvas');
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    polyDots = points.map(pt => {
        const dot = makePolyDot(pt, item);
        canvas.appendChild(dot);
        return dot;
    });
}

function makePolyDot(point, item) {
    const dot = document.createElement('div');
    dot.className      = 'poly-dot';
    dot.dataset.dotId  = point.id;
    dot.dataset.itemId = item.dataset.id;
    dot.style.cssText  = `
        position:absolute;
        left:${point.x}px; top:${point.y}px;
        width:16px; height:16px;
        background:white; border:3px solid #667eea;
        border-radius:50%; cursor:move;
        z-index:9999; transform:translate(-50%,-50%);
        box-shadow:0 2px 8px rgba(102,126,234,0.55);
        pointer-events:auto;
    `;

    dot.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        isDraggingPolyDot = true;
        draggedPolyDot    = dot;
    });

    // Right-click dot → delete it
    dot.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        const points = JSON.parse(item.dataset.polyPoints || '[]');
        if (points.length <= 3) return; // keep at least 3
        const filtered = points.filter(p => p.id !== parseInt(dot.dataset.dotId));
        item.dataset.polyPoints = JSON.stringify(filtered);
        createPolyDots(item);
        applyPolyShape(item);
        updateControlPanelPosition(item);
    });

    return dot;
}

function removePolyDots() {
    polyDots.forEach(d => d.remove());
    polyDots = [];
}

// ── Corner resize handles (regular items) ─────────────────────────────────────
function createCornerHandles(item) {
    removeCornerHandles();
    const canvas = document.getElementById('designCanvas');
    ['nw','ne','se','sw'].forEach(pos => {
        const h = document.createElement('div');
        h.className      = 'corner-handle';
        h.dataset.pos    = pos;
        h.dataset.itemId = item.dataset.id;
        h.style.cssText  = `
            position:absolute; width:14px; height:14px;
            background:white; border:3px solid #667eea; border-radius:3px;
            cursor:${pos}-resize; z-index:9999; transform:translate(-50%,-50%);
            box-shadow:0 2px 6px rgba(102,126,234,0.45); pointer-events:auto;
        `;
        h.addEventListener('mousedown', startCornerResize);
        canvas.appendChild(h);
        cornerHandles.push(h);
    });
    positionCornerHandles(item);
}

function positionCornerHandles(item) {
    if (!cornerHandles.length) return;
    const l = parseInt(item.style.left) || 0;
    const t = parseInt(item.style.top)  || 0;
    const w = item.offsetWidth;
    const h = item.offsetHeight;
    const coords = { nw:[l,t], ne:[l+w,t], se:[l+w,t+h], sw:[l,t+h] };
    cornerHandles.forEach(handle => {
        const [x, y] = coords[handle.dataset.pos];
        handle.style.left = x + 'px';
        handle.style.top  = y + 'px';
    });
}

function removeCornerHandles() {
    cornerHandles.forEach(h => h.remove());
    cornerHandles = [];
}

function startCornerResize(e) {
    e.stopPropagation(); e.preventDefault();
    const pos  = e.currentTarget.dataset.pos;
    const item = document.querySelector(`[data-id="${e.currentTarget.dataset.itemId}"]`);
    if (!item) return;

    const startX = e.clientX, startY = e.clientY;
    const startL = parseInt(item.style.left) || 0;
    const startT = parseInt(item.style.top)  || 0;
    const startW = item.offsetWidth;
    const startH = item.offsetHeight;
    const MIN    = 40;

    const onMove = mv => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        let l = startL, t = startT, w = startW, h = startH;

        if (pos === 'nw') {
            w = Math.max(MIN, startW - dx); l = startL + (startW - w);
            h = Math.max(MIN, startH - dy); t = startT + (startH - h);
        } else if (pos === 'ne') {
            w = Math.max(MIN, startW + dx);
            h = Math.max(MIN, startH - dy); t = startT + (startH - h);
        } else if (pos === 'se') {
            w = Math.max(MIN, startW + dx);
            h = Math.max(MIN, startH + dy);
        } else if (pos === 'sw') {
            w = Math.max(MIN, startW - dx); l = startL + (startW - w);
            h = Math.max(MIN, startH + dy);
        }

        item.style.left = l + 'px'; item.style.top  = t + 'px';
        item.style.width = w + 'px'; item.style.height = h + 'px';
        positionCornerHandles(item);
        updateControlPanelPosition(item);
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        updateMaterialsList();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function updatePolyDotPositions(item) {
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    polyDots.forEach(dot => {
        const pt = points.find(p => p.id === parseInt(dot.dataset.dotId));
        if (pt) { dot.style.left = pt.x + 'px'; dot.style.top = pt.y + 'px'; }
    });
}

function addPolyDot(canvasX, canvasY, item) {
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    const newPt  = { id: polyDotIdCounter++, x: canvasX, y: canvasY };

    // Insert between the two nearest consecutive sorted points
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const sorted = [...points].sort((a, b) =>
        Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );
    const newAngle = Math.atan2(canvasY - cy, canvasX - cx);
    let insertIdx  = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
        const a1 = Math.atan2(sorted[i].y - cy, sorted[i].x - cx);
        const a2 = Math.atan2(sorted[(i + 1) % sorted.length].y - cy, sorted[(i + 1) % sorted.length].x - cx);
        if (newAngle >= Math.min(a1, a2) && newAngle <= Math.max(a1, a2)) { insertIdx = i + 1; break; }
    }
    sorted.splice(insertIdx, 0, newPt);

    item.dataset.polyPoints = JSON.stringify(sorted);
    createPolyDots(item);
    applyPolyShape(item);
    updateControlPanelPosition(item);
}

// Apply clip-path polygon from canvas-absolute dot coordinates
function applyPolyShape(item) {
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    if (points.length < 3) return;

    const xs   = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const W    = Math.max(1, maxX - minX);
    const H    = Math.max(1, maxY - minY);

    item.style.left   = minX + 'px';
    item.style.top    = minY + 'px';
    item.style.width  = W + 'px';
    item.style.height = H + 'px';

    // Sort by angle for correct polygon winding
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const sorted = [...points].sort((a, b) =>
        Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );

    const clip = sorted.map(p =>
        `${((p.x - minX) / W * 100).toFixed(2)}% ${((p.y - minY) / H * 100).toFixed(2)}%`
    ).join(', ');

    item.style.clipPath        = `polygon(${clip})`;
    item.style.webkitClipPath  = `polygon(${clip})`;
}

// ── Control panel ─────────────────────────────────────────────────────────────
function createControlPanel(item) {
    removeControlPanel();
    const canvas = document.getElementById('designCanvas');
    const panel  = document.createElement('div');
    panel.className = 'control-panel';

    const isMesh = isMeshItem(item.dataset.name, item.dataset.category);

    let html = `
        <button class="control-btn" onclick="moveBackward('${item.dataset.id}')" title="Move back">▼</button>
        <button class="control-btn" onclick="moveForward('${item.dataset.id}')"  title="Move front">▲</button>
        <button class="control-btn" onclick="copyItem('${item.dataset.id}')"     title="Copy">⧉</button>
    `;

    if (isMesh) {
        html += `<button class="control-btn" onclick="resetSize('${item.dataset.id}')" title="Reset shape">↻</button>`;
        html += `<span style="font-size:11px;color:#718096;padding:0 4px;" id="dotCountBadge"></span>`;
    }

    html += `
        <div class="rotation-dial" data-item-id="${item.dataset.id}" title="Rotate">
            <div class="dial-handle" style="transform:rotate(${item.dataset.rotation||0}deg);"></div>
        </div>
        <button class="control-btn delete-btn" onclick="deleteItem('${item.dataset.id}')">🗑️</button>
    `;

    panel.innerHTML = html;
    canvas.appendChild(panel);
    controlPanel = panel;

    updateControlPanelPosition(item);
    updateDotCount();

    const dial = panel.querySelector('.rotation-dial');
    if (dial) dial.addEventListener('mousedown', startRotation);
}

function updateDotCount() {
    if (!selectedItem || !selectedItem.dataset.polyPoints) return;
    const badge = document.getElementById('dotCountBadge');
    if (badge) {
        const n = JSON.parse(selectedItem.dataset.polyPoints).length;
        badge.textContent = `${n} pts · right-click to add/remove`;
    }
}

function updateControlPanelPosition(item) {
    if (!controlPanel) return;
    let cx, ty;
    if (item.dataset.polyPoints) {
        const pts = JSON.parse(item.dataset.polyPoints);
        const xs  = pts.map(p => p.x), ys = pts.map(p => p.y);
        cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        ty = Math.min(...ys);
    } else {
        cx = (parseInt(item.style.left) || 0) + item.offsetWidth / 2;
        ty = parseInt(item.style.top) || 0;
    }
    controlPanel.style.left = (cx - controlPanel.offsetWidth / 2) + 'px';
    controlPanel.style.top  = Math.max(4, ty - controlPanel.offsetHeight - 12) + 'px';
}

function removeControlPanel() {
    if (controlPanel) { controlPanel.remove(); controlPanel = null; }
}

// ── Rotation ──────────────────────────────────────────────────────────────────
function startRotation(e) {
    e.stopPropagation(); e.preventDefault();
    isRotating = true;
    const itemId = e.currentTarget.dataset.itemId;
    const item   = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;

    const canvas = document.getElementById('designCanvas');
    const cRect  = canvas.getBoundingClientRect();
    const iRect  = item.getBoundingClientRect();
    rotationCenter = {
        x: iRect.left + iRect.width  / 2 - cRect.left,
        y: iRect.top  + iRect.height / 2 - cRect.top,
    };

    const onMove = mv => {
        if (!isRotating) return;
        let angle = Math.atan2(mv.clientY - cRect.top  - rotationCenter.y,
                               mv.clientX - cRect.left - rotationCenter.x) * 180 / Math.PI;
        angle = ((angle + 90) % 360 + 360) % 360;
        item.dataset.rotation = Math.round(angle);
        item.style.transform  = `rotate(${angle}deg)`;
        const dh = e.currentTarget.querySelector('.dial-handle');
        if (dh) dh.style.transform = `rotate(${angle}deg)`;
    };
    const onUp = () => { isRotating = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ── Item actions ──────────────────────────────────────────────────────────────
window.resetSize = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    const l = parseInt(item.style.left) || 0;
    const t = parseInt(item.style.top)  || 0;
    const polyPoints = [
        { id: polyDotIdCounter++, x: l,       y: t       },
        { id: polyDotIdCounter++, x: l + 400, y: t       },
        { id: polyDotIdCounter++, x: l + 400, y: t + 250 },
        { id: polyDotIdCounter++, x: l,       y: t + 250 },
    ];
    item.dataset.polyPoints   = JSON.stringify(polyPoints);
    item.style.clipPath        = 'none';
    item.style.webkitClipPath = 'none';
    item.style.width           = '400px';
    item.style.height          = '250px';
    if (item === selectedItem) { createPolyDots(item); updateControlPanelPosition(item); updateDotCount(); }
};

window.moveForward = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) item.style.zIndex = Math.min((parseInt(item.style.zIndex) || 1) + 1, 100);
};
window.moveBackward = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) item.style.zIndex = Math.max(1, (parseInt(item.style.zIndex) || 1) - 1);
};
window.changeSize = function(itemId, delta) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    item.style.width  = Math.max(50, item.offsetWidth  + delta) + 'px';
    item.style.height = Math.max(50, item.offsetHeight + delta) + 'px';
    updateControlPanelPosition(item);
};
window.deleteItem = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    const idx = placedItems.findIndex(i => i.id === itemId);
    if (idx !== -1) placedItems.splice(idx, 1);
    item.remove();
    deselectItem();
    updateMaterialsList();
};

window.copyItem = async function(itemId) {
    const src = placedItems.find(i => i.id === itemId);
    if (!src) return;
    const el     = src.element;
    const offset = 25;

    const itemData = {
        name:     src.name,
        image:    el.dataset.imageUrl,
        type:     src.type,
        category: src.category,
        price:    src.price,
    };

    const x = (parseInt(el.style.left) || 0) + offset;
    const y = (parseInt(el.style.top)  || 0) + offset;

    await addItemToCanvas(itemData, x, y);

    // For mesh items, copy the polygon shape offset by the same amount
    const newEl = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
    if (newEl && el.dataset.polyPoints) {
        const pts = JSON.parse(el.dataset.polyPoints).map(p => ({
            ...p, id: polyDotIdCounter++, x: p.x + offset, y: p.y + offset,
        }));
        newEl.dataset.polyPoints = JSON.stringify(pts);
        applyPolyShape(newEl);
        if (newEl === selectedItem) { createPolyDots(newEl); updateControlPanelPosition(newEl); }
    }
    // Copy size for regular items
    if (newEl && !el.dataset.polyPoints) {
        newEl.style.width  = el.style.width;
        newEl.style.height = el.style.height;
    }
};

// ── Materials list ────────────────────────────────────────────────────────────
function updateMaterialsList() {
    const list = document.getElementById('materialsList');
    if (!list) return;
    if (!placedItems.length) {
        list.innerHTML = '<p style="color:#718096;text-align:center;padding:20px;">Add items to see your shopping list</p>';
        updateTotal(0);
        return;
    }

    // Separate coverage items (hardscape/mulch) from regular items
    const coverage = {}; // name → { name, price, sfPerTon, totalSqFt, noScale }
    const regular  = {}; // name → { name, price, count }

    placedItems.forEach(item => {
        const sfPerTon = getCoverageRate(item.name);
        if (sfPerTon !== undefined) {
            if (!coverage[item.name]) coverage[item.name] = { name: item.name, price: item.price, sfPerTon, totalSqFt: 0, noScale: false };
            const sqFt = getItemSqFt(item);
            if (sqFt === null) coverage[item.name].noScale = true;
            else coverage[item.name].totalSqFt += sqFt;
        } else {
            if (!regular[item.name]) regular[item.name] = { name: item.name, price: item.price, count: 0 };
            regular[item.name].count++;
        }
    });

    let total = 0, html = '';

    // Coverage-based rows
    Object.values(coverage).forEach(item => {
        const tons = item.totalSqFt / item.sfPerTon;
        const cost = tons * item.price;
        total += cost;
        const hasScale = !item.noScale && item.totalSqFt > 0;
        html += `<div class="material-item coverage-item">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${item.name}</div>
                ${hasScale ? `
                <div style="font-size:11px;color:#10b981;font-weight:600;margin-top:3px;">📐 ${item.totalSqFt.toFixed(1)} sq ft covered</div>
                <div style="font-size:11px;color:#718096;">${tons.toFixed(2)} tons · $${item.price.toFixed(2)}/ton</div>
                ` : item.noScale ? `
                <div style="font-size:11px;color:#f59e0b;">⚠ Analyze photo to calculate SF</div>
                ` : `
                <div style="font-size:11px;color:#718096;">Shape on canvas to calculate SF</div>
                `}
            </div>
            <div style="font-weight:700;color:#059669;font-size:14px;white-space:nowrap;">$${cost.toFixed(2)}</div>
        </div>`;
    });

    // Regular rows
    Object.values(regular).forEach(item => {
        const sub = item.count * item.price;
        total += sub;
        html += `<div class="material-item">
            <div><div style="font-weight:600;font-size:13px;">${item.name}</div>
            <div style="font-size:12px;color:#718096;">Qty: ${item.count}</div></div>
            <div style="font-weight:700;color:#667eea;font-size:14px;">$${sub.toFixed(2)}</div>
        </div>`;
    });

    list.innerHTML = html;
    updateTotal(total);
}
function updateTotal(total) {
    const el = document.getElementById('totalCost');
    if (el) el.textContent = `$${total.toFixed(2)}`;
}

// ── Save / load ───────────────────────────────────────────────────────────────
function saveDesign() {
    try {
        localStorage.setItem('gardiyDesign', JSON.stringify({
            items: placedItems.map(i => ({
                name: i.name, category: i.category, type: i.type,
                x:    parseInt(i.element.style.left), y: parseInt(i.element.style.top),
                width: parseInt(i.element.style.width), height: parseInt(i.element.style.height),
                rotation: parseInt(i.element.dataset.rotation || 0),
                zIndex:   parseInt(i.element.style.zIndex) || 1,
                price:    i.price,
                polyPoints:  i.element.dataset.polyPoints,
                pathPoints:  i.element.dataset.pathPoints,
                pathWidth:   i.element.dataset.pathWidth,
            })),
        }));
    } catch (e) { console.warn('Save error:', e); }
}

async function loadSavedDesign() {
    const saved = localStorage.getItem('gardiyDesign');
    if (!saved) return;
    try {
        const data     = JSON.parse(saved);
        const products = await getProducts();
        for (const d of data.items) {
            const product = products.find(p => p.name === d.name);
            if (!product) continue;
            await addItemToCanvas(product, d.x, d.y);
            const item = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
            if (!item) continue;
            item.style.width     = d.width  + 'px';
            item.style.height    = d.height + 'px';
            item.dataset.rotation = d.rotation || 0;
            item.style.transform  = `rotate(${d.rotation || 0}deg)`;
            item.style.zIndex     = d.zIndex || 1;
            if (d.polyPoints) { item.dataset.polyPoints = d.polyPoints; applyPolyShape(item); }
            if (d.pathPoints) { item.dataset.pathPoints = d.pathPoints; item.dataset.pathWidth = d.pathWidth || '40'; applyPathShape(item); }
        }
        deselectItem();
    } catch (e) { console.error('Load error:', e); }
}

// ── Path system ───────────────────────────────────────────────────────────────
function removeMeshDots() { meshDots.forEach(d => d.remove()); meshDots = []; }

function createPathControls(item) {
    removeMeshDots();
    const canvas = document.getElementById('designCanvas');
    const points = JSON.parse(item.dataset.pathPoints || '[]');
    meshDots = points.map(pt => {
        const dot = document.createElement('div');
        dot.className      = 'mesh-dot';
        dot.dataset.dotId  = pt.id;
        dot.style.cssText  = `
            position:absolute; left:${pt.x}px; top:${pt.y}px;
            width:12px; height:12px; background:#ffb800; border:3px solid #ff8c42;
            border-radius:50%; cursor:move; z-index:9999;
            transform:translate(-50%,-50%);
            box-shadow:0 2px 8px rgba(255,140,66,0.4); pointer-events:auto;
        `;
        dot.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); isDraggingDot = true; draggedDot = dot; });
        dot.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); addPathPoint(e.clientX, e.clientY); });
        canvas.appendChild(dot);
        return dot;
    });
    applyPathShape(item);
}

function applyPathShape(item) {
    const points    = JSON.parse(item.dataset.pathPoints || '[]');
    const pathWidth = parseInt(item.dataset.pathWidth || 40);
    if (points.length < 2) return;

    let svg = item.querySelector('svg.path-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('path-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        item.appendChild(svg);
    }

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad  = pathWidth;
    const W    = maxX - minX + pad * 2, H = maxY - minY + pad * 2;

    item.style.left = (minX - pad) + 'px'; item.style.top  = (minY - pad) + 'px';
    item.style.width = W + 'px';           item.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad  = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = `pg${item.dataset.id}`;
    grad.innerHTML = `<stop offset="0%" style="stop-color:#a0826d"/><stop offset="100%" style="stop-color:#8b6f47"/>`;
    defs.appendChild(grad); svg.appendChild(defs);

    let d = `M ${points[0].x - minX + pad} ${points[0].y - minY + pad}`;
    for (let i = 1; i < points.length; i++) {
        const cx2 = points[i].x - minX + pad, cy2 = points[i].y - minY + pad;
        if (i === points.length - 1) { d += ` L ${cx2} ${cy2}`; }
        else {
            const nx = points[i+1].x - minX + pad, ny = points[i+1].y - minY + pad;
            d += ` Q ${cx2} ${cy2} ${(cx2+nx)/2} ${(cy2+ny)/2}`;
        }
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); path.setAttribute('stroke', `url(#pg${item.dataset.id})`);
    path.setAttribute('stroke-width', pathWidth); path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0.9');
    svg.appendChild(path);
}

function addPathPoint(clientX, clientY) {
    if (!selectedItem || !selectedItem.dataset.pathPoints) return;
    const rect = document.getElementById('designCanvas').getBoundingClientRect();
    const pts  = JSON.parse(selectedItem.dataset.pathPoints);
    pts.push({ id: dotIdCounter++, x: clientX - rect.left, y: clientY - rect.top });
    selectedItem.dataset.pathPoints = JSON.stringify(pts);
    createPathControls(selectedItem);
}

window.changePathWidth = function(itemId, delta) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    item.dataset.pathWidth = Math.max(10, Math.min(100, parseInt(item.dataset.pathWidth || 40) + delta));
    applyPathShape(item);
};
window.resetPath = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    const pts = JSON.parse(item.dataset.pathPoints);
    const sx = pts[0].x, sy = pts[0].y;
    item.dataset.pathPoints = JSON.stringify([
        { id: pts[0].id,  x: sx,       y: sy },
        { id: pts[1]?.id ?? dotIdCounter++, x: sx + 100, y: sy },
        { id: pts[2]?.id ?? dotIdCounter++, x: sx + 200, y: sy },
    ]);
    createPathControls(item);
};

// ── Checkout ──────────────────────────────────────────────────────────────────
function checkUserStatus() {
    const user  = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    const badge = document.querySelector('.user-badge');
    if (badge) badge.textContent = user.loggedIn ? `👤 ${user.name || 'User'}` : '👤 Guest';
}

function setupCheckoutButtons() {
    const btn = document.getElementById('checkoutMainBtn');
    if (!btn) return;
    btn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (!placedItems.length) { alert('⚠️ Please add items to your design first!'); return; }
        const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        if (!user.loggedIn) {
            if (confirm('⚠️ Please sign in to proceed.\n\nGo to login page?')) { try { saveDesign(); } catch(ex){} window.location.href = 'login.html'; }
            return;
        }
        try { saveDesign(); } catch(ex){}
        btn.disabled = true;
        btn.textContent = 'Capturing design...';
        await submitDesignForCheckout();
        btn.disabled = false;
        btn.textContent = 'Proceed to Checkout →';
    });
}

async function submitDesignForCheckout() {
    const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!user.loggedIn || !user.email) { alert('⚠️ Please sign in'); return; }
    if (!placedItems.length) { alert('⚠️ Add items first'); return; }

    // Hide control panels and dots before screenshot
    document.querySelectorAll('.control-panel, .poly-dot, .corner-handle, .mesh-dot').forEach(el => el.style.visibility = 'hidden');

    let designScreenshot = null;
    try {
        const canvasEl = document.getElementById('designCanvas');
        const captured = await html2canvas(canvasEl, {
            useCORS: true,
            allowTaint: false,
            scale: 0.5,
            logging: false,
        });
        designScreenshot = captured.toDataURL('image/jpeg', 0.7);
    } catch (e) {
        console.warn('Screenshot failed:', e);
    }

    // Restore visibility
    document.querySelectorAll('.control-panel, .poly-dot, .corner-handle, .mesh-dot').forEach(el => el.style.visibility = '');

    const total  = placedItems.reduce((s, i) => s + (i.price || 0), 0);
    const width  = document.getElementById('width')?.value  || 'Not specified';
    const height = document.getElementById('height')?.value || 'Not specified';
    const depth  = document.getElementById('depth')?.value  || 'Not specified';

    try {
        localStorage.setItem(`design_${user.email}`, JSON.stringify({
            customerId: user.email, customerName: user.name || user.email.split('@')[0],
            customerEmail: user.email, customerPhone: user.phone || 'Not provided',
            items: placedItems.map(i => ({ name: i.name, price: i.price })),
            totalItems: placedItems.length, estimatedTotal: total,
            dimensions: { width, height, depth },
            submittedAt: new Date().toISOString(), status: 'pending_review', notes: '',
            designScreenshot,
        }));
        localStorage.removeItem('gardiyDesign');
        placedItems = []; updateMaterialsList();
        window.location.href = 'checkout.html';
    } catch (e) { alert('⚠️ Storage error. Try clearing browser storage.'); }
}

// ── Styles ────────────────────────────────────────────────────────────────────
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
    .draggable-item.selected { outline:2px dashed #667eea; outline-offset:3px; }

    .poly-dot {
        transition: transform 0.1s, background 0.1s;
    }
    .poly-dot:hover {
        transform: translate(-50%,-50%) scale(1.5) !important;
        background: #667eea !important;
        border-color: white !important;
    }

    .corner-handle {
        transition: transform 0.1s, background 0.1s;
    }
    .corner-handle:hover {
        transform: translate(-50%,-50%) scale(1.4) !important;
        background: #667eea !important;
        border-color: white !important;
    }

    .mesh-dot { transition: transform 0.1s; }
    .mesh-dot:hover { transform:translate(-50%,-50%) scale(1.5) !important; background:#ff8c42 !important; }

    .control-panel {
        position:absolute; display:flex; gap:6px; align-items:center;
        background:white; padding:6px 10px; border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.15); z-index:9998; pointer-events:auto;
    }
    .control-btn {
        width:34px; height:34px; border:none; border-radius:8px;
        background:#f7fafc; cursor:pointer; font-size:16px;
        display:flex; align-items:center; justify-content:center; transition:all 0.15s;
    }
    .control-btn:hover { background:#e2e8f0; transform:translateY(-2px); }
    .control-btn.delete-btn:hover { background:#fee; color:#e53e3e; }

    .rotation-dial {
        width:36px; height:36px; border-radius:50%;
        background:linear-gradient(135deg,#667eea,#764ba2);
        cursor:grab; position:relative; display:flex;
        align-items:center; justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.2);
    }
    .rotation-dial:active { cursor:grabbing; }
    .dial-handle {
        width:4px; height:16px; background:white; border-radius:2px;
        position:absolute; top:4px; transform-origin:center 14px;
    }
` }));

console.log('✅ Design page ready');

