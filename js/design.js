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

// Bricks per sq ft by product name — add entries here as new products are defined
const BRICK_PATH_DENSITY = {
    'brick path':  4,   // red/standard brick: 4 per sqft
    'brick paver': 4,
    'stone pathway': 5, // smaller stone units
    'wood chips path': 0, // coverage-based, not brick-count
};

function getBricksPerSqFt(name) {
    const n = (name || '').toLowerCase();
    for (const [key, val] of Object.entries(BRICK_PATH_DENSITY)) {
        if (n.includes(key)) return val;
    }
    return 4; // default: 4 bricks per sq ft
}

// Returns brick count info for a placed brick-path item
// Fill mode: uses shoelace polygon area; stroke mode: uses getTotalLength
function getBrickPathInfo(placedItem) {
    const el    = placedItem.element;
    const scale = getSqFtScale();

    if (el.dataset.pathFill === 'true') {
        // Freehand drawn area — calculate from polygon
        const points = JSON.parse(el.dataset.pathPoints || '[]');
        if (points.length < 3) return null;
        if (!scale) return { noScale: true };
        const areaPx        = polygonAreaPx(points);
        if (areaPx < 1) return null;
        const areaInSqFt    = areaPx * scale;
        const bricksPerSqFt = getBricksPerSqFt(placedItem.name);
        const brickCount    = Math.ceil(areaInSqFt * bricksPerSqFt * 1.1);
        return { areaInSqFt, bricksPerSqFt, brickCount, cost: brickCount * placedItem.price, noScale: false };
    }

    // Legacy stroke mode — measure path length × width
    const svgEl  = el.querySelector('svg.path-svg');
    const pathEl = svgEl?.querySelector('path[data-measure]') || svgEl?.querySelector('path');
    if (!pathEl) return null;
    const pixelLength   = pathEl.getTotalLength();
    const pathWidthPx   = parseInt(el.dataset.pathWidth || 40);
    if (!scale) return { pixelLength, pathWidthPx, noScale: true };
    const areaInSqFt    = pixelLength * pathWidthPx * scale;
    const bricksPerSqFt = getBricksPerSqFt(placedItem.name);
    const brickCount    = Math.ceil(areaInSqFt * bricksPerSqFt * 1.1);
    return { pixelLength, pathWidthPx, areaInSqFt, bricksPerSqFt, brickCount, cost: brickCount * placedItem.price, noScale: false };
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

// Freehand path drawing mode
let drawingMode       = false;
let drawingProduct    = null;
let drawingPoints     = [];
let isMouseDownDraw   = false;
let drawingOverlay    = null;
let drawingPreviewSvg = null;

// ── Product filter state (per category) ───────────────────────────────────────
const categoryProductsMap = {};  // { catKey: [products] }
const categoryFilterState = {};  // { catKey: { sort: 'default'|'asc'|'desc', color: '' } }

const COLOR_PATTERNS = {
    yellow: /yellow|golden|gold|sunflower|marigold/i,
    red:    /red|rose|scarlet|crimson|coral/i,
    white:  /white|ivory|cream|snow/i,
    blue:   /blue|indigo|cornflower|bluebell/i,
    purple: /purple|lavender|violet|lilac/i,
};

function productMatchesColor(p, color) {
    return (COLOR_PATTERNS[color] || new RegExp(color, 'i')).test(p.name || '');
}

function buildProductItemsHTML(products, esc) {
    if (!products.length) return '<div class="filter-no-results">No products match this filter.</div>';
    return products.map(p => {
        const thumb = p.type === 'image'
            ? `<img src="${esc(p.imageUrl || p.image)}" style="width:40px;height:40px;object-fit:contain;border-radius:8px;">`
            : `<span style="font-size:32px;">${esc(p.image)}</span>`;
        return `<div class="product-item" data-pid="${p._pid}">
            ${thumb}
            <div class="product-info">
                <div class="product-name">${esc(p.name)}${sunBadgeHTML(p.name, p.category)}</div>
                <div class="product-price">$${p.price}</div>
            </div>
        </div>`;
    }).join('');
}

function applyProductFilter(catKey) {
    const state = categoryFilterState[catKey] || { sort: 'default', color: '' };
    let prods = [...(categoryProductsMap[catKey] || [])];
    if (state.color) prods = prods.filter(p => productMatchesColor(p, state.color));
    if (state.sort === 'asc')  prods.sort((a, b) => a.price - b.price);
    if (state.sort === 'desc') prods.sort((a, b) => b.price - a.price);
    const listEl = document.querySelector(`.category-product-list[data-category="${catKey}"]`);
    if (!listEl) return;
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    listEl.innerHTML = buildProductItemsHTML(prods, esc);
    applyPlantRecommendationColors();
}

function setupCategoryFilters() {
    const sidebar = document.querySelector('.design-sidebar');
    if (!sidebar) return;
    sidebar.addEventListener('click', e => {
        const sortBtn  = e.target.closest('.filter-sort-btn');
        const colorBtn = e.target.closest('.filter-color-btn, .filter-color-all');
        if (!sortBtn && !colorBtn) return;
        e.stopPropagation();
        const btn    = sortBtn || colorBtn;
        const catKey = btn.dataset.cat;
        if (!catKey || !categoryFilterState[catKey]) return;
        if (sortBtn) {
            categoryFilterState[catKey].sort = sortBtn.dataset.sort;
            sortBtn.closest('.filter-sort-row').querySelectorAll('.filter-sort-btn')
                .forEach(b => b.classList.toggle('active', b === sortBtn));
        } else {
            categoryFilterState[catKey].color = colorBtn.dataset.color;
            colorBtn.closest('.filter-color-row').querySelectorAll('.filter-color-btn, .filter-color-all')
                .forEach(b => b.classList.toggle('active', b === colorBtn));
        }
        applyProductFilter(catKey);
    });
}

// ── Mock products ─────────────────────────────────────────────────────────────
function getMockProducts() {
    return [
        { id: 1,  name: 'Stone Pathway',   category: 'paths',      type: 'emoji', image: '🛤️', price: 150  },
        { id: 2,  name: 'Wood Chips Path', category: 'paths',      type: 'emoji', image: '🟤', price: 120  },
        { id: 3,  name: 'Brick Path',      category: 'paths',      type: 'emoji', image: '🧱', price: 200  },
        { id: 4,  name: 'Kentucky Bluegrass', category: 'grass', type: 'image', image: 'images/texture-grass-hd.jpg', imageUrl: 'images/texture-grass-hd.jpg', price: 0.50 },
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
        { id: 50, name: 'Pink Petunia',    category: 'flowers',    type: 'image', image: 'images/pink-petunia.png', imageUrl: 'images/pink-petunia.png', price: 15   },
        { id: 16, name: 'Bench',                category: 'furniture',    type: 'emoji', image: '🪑', price: 200   },
        { id: 17, name: 'Table',                category: 'furniture',    type: 'emoji', image: '🛋️', price: 300   },
        { id: 18, name: 'Fountain',             category: 'furniture',    type: 'emoji', image: '⛲', price: 500   },
        { id: 19, name: 'Concrete Paver',       category: 'rocks_pavers', type: 'emoji', image: '⬜', price: 6.00  },
        { id: 20, name: 'Brick Paver',          category: 'rocks_pavers', type: 'emoji', image: '🧱', price: 7.50  },
        { id: 21, name: 'Natural Stone Paver',  category: 'rocks_pavers', type: 'emoji', image: '🪨', price: 12.00 },
        { id: 22, name: 'Flagstone',            category: 'rocks_pavers', type: 'emoji', image: '🟫', price: 8.00  },
        { id: 23, name: 'Pea Gravel',           category: 'rocks_pavers', type: 'emoji', image: '⚫', price: 2.50  },
        { id: 24, name: 'Decomposed Granite',   category: 'rocks_pavers', type: 'emoji', image: '🟡', price: 2.00  },
    ];
}

function supplementWithMockProducts(products) {
    const existingCategories = new Set(products.map(p => (p.category || '').toLowerCase()));
    const missing = getMockProducts().filter(p => !existingCategories.has((p.category || '').toLowerCase()));
    return missing.length ? [...products, ...missing] : products;
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
                if (products?.length) return supplementWithMockProducts(products);
            }
        } catch (e) { console.warn('Backend unavailable, using fallback'); }
    }
    const stored = localStorage.getItem('gardiyProducts');
    if (stored) { try { return supplementWithMockProducts(JSON.parse(stored)); } catch (e) {} }
    return getMockProducts();
}

async function getItemPrices() {
    const products = await getProducts();
    const map = {};
    products.forEach(p => map[p.name] = p.price);
    return map;
}

// ── Sun exposure requirements ────────────────────────────────────────────────
// Returns 'full_sun', 'shade', or 'both' for plants/flowers/trees; null for other categories.
const PLANT_CATEGORIES = new Set(['plants', 'trees', 'flowers']);

function getSunRequirement(name, category) {
    if (!PLANT_CATEGORIES.has((category || '').toLowerCase())) return null;
    const n = (name || '').toLowerCase();

    // Full sun
    if (/cactus|sunflower|palm|lavender|sage|sedum|yucca/.test(n))          return 'full_sun';
    if (/rose/.test(n) && !/primrose/.test(n))                               return 'full_sun';
    if (/grass field/.test(n))                                               return 'full_sun';

    // Shade
    if (/fern|hosta|impatiens|astilbe|begonia|caladium|shade/.test(n))      return 'shade';

    // Both / partial (default for all remaining plants)
    return 'both';
}

function sunBadgeHTML(name, category) {
    const req = getSunRequirement(name, category);
    if (!req) return '';
    const map = { full_sun: '☀️', shade: '☁️', both: '⛅' };
    return `<span class="sun-badge" title="${req === 'full_sun' ? 'Full sun' : req === 'shade' ? 'Shade' : 'Sun or shade'}">${map[req]}</span>`;
}

// ── Category helpers ──────────────────────────────────────────────────────────
function isGrassItem(n, c)       { return (c||'').toLowerCase() === 'grass'; }
function isHardscapeItem(n, c)   { return (c||'').toLowerCase() === 'hardscapes'; }
function isRocksPaversItem(n, c) { return (c||'').toLowerCase() === 'rocks_pavers'; }
function isMeshItem(n, c)        { return isGrassItem(n, c) || isHardscapeItem(n, c); }
// ── Ramer-Douglas-Peucker path simplification ────────────────────────────────
function _perpDist(pt, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(pt.x - a.x, pt.y - a.y);
    return Math.abs(dx * (a.y - pt.y) - (a.x - pt.x) * dy) / len;
}
function rdpSimplify(pts, epsilon) {
    if (pts.length < 3) return pts;
    let maxD = 0, maxI = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = _perpDist(pts[i], pts[0], pts[pts.length - 1]);
        if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > epsilon) {
        const L = rdpSimplify(pts.slice(0, maxI + 1), epsilon);
        const R = rdpSimplify(pts.slice(maxI), epsilon);
        return [...L.slice(0, -1), ...R];
    }
    return [pts[0], pts[pts.length - 1]];
}

function isPathItem(n, c) {
    return (c||'').toLowerCase() === 'paths' ||
        ['path','pathway','walkway'].some(k => (n||'').toLowerCase().includes(k));
}
function isBrickPath(n, c) {
    return (c||'').toLowerCase() === 'paths' && (n||'').toLowerCase().includes('brick');
}

// ── DOM ready ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    checkUserStatus();
    await loadProductCategories();
    applyPlantRecommendationColors();

    const savedImage = window.GarDIYStorage?.getImage();
    const canvasImage = document.getElementById('canvasImage');
    const canvasHint  = document.getElementById('canvasHint');
    if (savedImage && canvasImage) {
        canvasImage.src = savedImage;
        if (canvasHint) canvasHint.style.display = 'none';
    }

    setupCategoryButtons();
    setupCategoryFilters();
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

    // ── Global mousemove: freehand drawing + poly/path dot drag ──
    document.addEventListener('mousemove', e => {
        const canvas = document.getElementById('designCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Freehand path drawing
        if (drawingMode && isMouseDownDraw) {
            const last = drawingPoints[drawingPoints.length - 1];
            if (!last || Math.hypot(mx - last.x, my - last.y) > 4) {
                drawingPoints.push({ x: mx, y: my });
                _updateDrawingPreview();
            }
            return;
        }

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

    document.addEventListener('mouseup', async () => {
        // Finish freehand path drawing
        if (drawingMode && isMouseDownDraw) {
            isMouseDownDraw = false;
            if (drawingPreviewSvg) { drawingPreviewSvg.remove(); drawingPreviewSvg = null; }
            if (drawingPoints.length >= 5) {
                const simplified = rdpSimplify(drawingPoints, 10);
                if (simplified.length >= 2) await _finishDrawingPath(simplified);
            }
            exitPathDrawingMode();
            return;
        }
        if (isDraggingPolyDot || isDraggingDot) updateMaterialsList();
        isDraggingPolyDot = false; draggedPolyDot = null;
        isDraggingDot     = false; draggedDot     = null;
    });
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
// Keyed by numeric index matching data-pid attribute — avoids putting large
// base64 strings or unescaped quotes into HTML data attributes.
const productRegistry = {};

async function loadProductCategories() {
    // Show loading skeleton immediately so sidebar isn't blank while fetching
    const sidebarEarly = document.querySelector('.design-sidebar');
    if (sidebarEarly) sidebarEarly.innerHTML = '<h3>🎨 Products</h3><p style="padding:1rem;color:#6b7280;font-style:italic;">Loading products…</p>';

    const products = await getProducts();
    if (!products.length) {
        const sb = document.querySelector('.design-sidebar');
        if (sb) sb.innerHTML = '<h3>🎨 Products</h3><p style="padding:1rem;color:#ef4444;">No products found.</p>';
        return;
    }

    // Build registry so click handler can look up full product data by index
    products.forEach((p, i) => { productRegistry[i] = p; });

    const categories = {
        paths:        { name: 'Paths',           icon: '🛤️', products: [] },
        grass:        { name: 'Grass',           icon: '🌿', products: [] },
        hardscapes:   { name: 'Hardscapes',      icon: '⛏️', products: [] },
        rocks_pavers: { name: 'Rocks & Pavers',  icon: '🧱', products: [] },
        plants:       { name: 'Plants',          icon: '🌱', products: [] },
        trees:        { name: 'Trees',           icon: '🌳', products: [] },
        flowers:      { name: 'Flowers',         icon: '🌸', products: [] },
        furniture:    { name: 'Furniture',       icon: '🪑', products: [] },
    };

    products.forEach((p, i) => {
        if (categories[p.category]) categories[p.category].products.push({ ...p, _pid: i });
    });

    // Populate filter maps
    Object.keys(categories).forEach(key => {
        categoryProductsMap[key] = categories[key].products;
        categoryFilterState[key] = { sort: 'default', color: '' };
    });

    const sidebar = document.querySelector('.design-sidebar');
    if (!sidebar) return;

    const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const filterBarHTML = key => `
        <div class="category-filter-bar">
            <div class="filter-sort-row">
                <button class="filter-sort-btn active" data-sort="default" data-cat="${key}">Default</button>
                <button class="filter-sort-btn" data-sort="asc"  data-cat="${key}">↑ Low→High</button>
                <button class="filter-sort-btn" data-sort="desc" data-cat="${key}">↓ High→Low</button>
            </div>
            <div class="filter-color-row">
                <button class="filter-color-all active" data-color="" data-cat="${key}">All</button>
                <button class="filter-color-btn" data-color="yellow" data-cat="${key}" title="Yellow" style="background:#fbbf24;"></button>
                <button class="filter-color-btn" data-color="red"    data-cat="${key}" title="Red"    style="background:#ef4444;"></button>
                <button class="filter-color-btn" data-color="white"  data-cat="${key}" title="White"  style="background:#f1f5f9;border:1.5px solid #cbd5e1;"></button>
                <button class="filter-color-btn" data-color="blue"   data-cat="${key}" title="Blue"   style="background:#3b82f6;"></button>
                <button class="filter-color-btn" data-color="purple" data-cat="${key}" title="Purple" style="background:#8b5cf6;"></button>
            </div>
        </div>`;

    let html = `<h3>🎨 Products</h3>
    <button class="auto-design-btn" onclick="openAutoDesignModal()">✨ Auto Design</button>
    <div class="category-list">`;
    Object.keys(categories).forEach(key => {
        const cat = categories[key];
        if (key === 'furniture') {
            html += `<div class="category-section" data-category="${key}">
                <button class="category-btn">
                    <span class="category-icon">${cat.icon}</span>
                    <span>${cat.name}</span>
                    <span class="expand-icon">▼</span>
                </button>
                <div class="category-items" style="display:none;">
                    <div style="padding:1rem;text-align:center;color:#9ca3af;font-style:italic;font-size:0.9rem;">Coming Soon</div>
                </div>
            </div>`;
            return;
        }
        if (!cat.products.length) return;
        html += `<div class="category-section" data-category="${key}">
            <button class="category-btn">
                <span class="category-icon">${cat.icon}</span>
                <span>${cat.name}</span>
                <span class="expand-icon">▼</span>
            </button>
            <div class="category-items" style="display:none;">
                ${filterBarHTML(key)}
                <div class="category-product-list" data-category="${key}">`;
        html += buildProductItemsHTML(cat.products, esc);
        html += '</div></div></div>';
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
        if (!open) applyPlantRecommendationColors();
    });
}

function setupCanvasClick() {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;
    canvas.addEventListener('click', e => {
        if (drawingMode) return;
        if (e.target.closest('.draggable-item') ||
            e.target.closest('.control-panel')  ||
            e.target.classList.contains('poly-dot') ||
            e.target.classList.contains('mesh-dot')) return;
        deselectItem();
    });
}

// ── Product click → add to canvas (paths enter drawing mode) ─────────────────
document.addEventListener('click', async e => {
    const item = e.target.closest('.product-item');
    if (!item) return;
    const pid = item.dataset.pid;
    const p = productRegistry[pid];
    if (!p) return;

    // Grass, hardscape, and path items → brush fill mode
    if (isPathItem(p.name, p.category) || isMeshItem(p.name, p.category)) {
        if (_brushMode && _brushProduct?.name === p.name) {
            exitBrushFillMode();
        } else {
            exitBrushFillMode();
            exitPathDrawingMode();
            enterBrushFillMode(p);
        }
        return;
    }

    const canvas = document.getElementById('designCanvas');
    const rect   = canvas.getBoundingClientRect();
    const data   = {
        name: p.name, image: p.image,
        type: p.type, category: p.category,
        price: parseFloat(p.price),
    };
    await addItemToCanvas(data, rect.width / 2 - 40, rect.height / 2 - 40);
});

// ── Add item to canvas ────────────────────────────────────────────────────────
function _loadImageDims(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve({ w: img.naturalWidth  || 200, h: img.naturalHeight || 200 });
        img.onerror = () => resolve({ w: 200, h: 200 });
        img.src = src;
    });
}

async function addItemToCanvas(itemData, x, y, customW, customH) {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    const isMesh = isMeshItem(itemData.name, itemData.category);
    const isPath = isPathItem(itemData.name, itemData.category);

    let w, h;
    if (customW) {
        w = customW; h = customH || customW;
    } else if (isMesh) {
        w = Math.round(canvas.offsetWidth  * 0.50) || 300;
        h = Math.round(canvas.offsetHeight * 0.50) || 300;
        x = canvas.offsetWidth  / 2 - w / 2;
        y = canvas.offsetHeight / 2 - h / 2;
    } else if (!isPath && itemData.type === 'image') {
        const dims = await _loadImageDims(itemData.imageUrl || itemData.image);
        const maxW = Math.round(canvas.offsetWidth * 0.50) || 400;
        const scale = Math.min(1, maxW / dims.w);
        w = Math.max(80, Math.round(dims.w * scale));
        h = Math.max(80, Math.round(dims.h * scale));
        x = canvas.offsetWidth  / 2 - w / 2;
        y = canvas.offsetHeight / 2 - h / 2;
    } else {
        w = 80; h = 80;
    }

    const item = document.createElement('div');
    item.className        = 'draggable-item';
    item.dataset.id          = itemIdCounter++;
    item.dataset.name        = itemData.name;
    item.dataset.category    = itemData.category;
    item.dataset.type        = itemData.type;
    item.dataset.rotation    = '0';
    item.dataset.imageUrl    = itemData.image;

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
            item.style.backgroundImage    = `url(${itemData.imageUrl || itemData.image})`;
            item.style.backgroundSize     = 'cover';
            item.style.backgroundRepeat   = 'no-repeat';
            item.style.backgroundPosition = 'center';
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
            item.innerHTML = `<img src="${itemData.image}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;">`;
        } else {
            item.innerHTML = `<span style="font-size:48px;pointer-events:none;">${itemData.image}</span>`;
        }
    }

    canvas.appendChild(item);
    if (isMesh) applyPolyShape(item); // apply clip-path immediately on placement

    // _price bypasses the getItemPrices() network call (used by auto-design batch)
    const priceVal = itemData._price !== undefined
        ? itemData._price
        : ((await getItemPrices())[itemData.name] || parseFloat(itemData.price) || 0);
    placedItems.push({
        id: item.dataset.id, element: item,
        name: itemData.name, category: itemData.category,
        type: itemData.type, price: priceVal,
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
        if (e.target.classList.contains('rotate-handle')) return;
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
        } else if (item.dataset.pathPoints) {
            const points = JSON.parse(item.dataset.pathPoints).map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
            item.dataset.pathPoints = JSON.stringify(points);
            applyPathShape(item);
            if (item === selectedItem) {
                meshDots.forEach(dot => {
                    dot.style.left = (parseFloat(dot.style.left) || 0) + dx + 'px';
                    dot.style.top  = (parseFloat(dot.style.top)  || 0) + dy + 'px';
                });
            }
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
    addRotateHandle(item);
}

function deselectItem() {
    if (!selectedItem) return;
    selectedItem.classList.remove('selected');
    removeRotateHandle(selectedItem);
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

// Mirror-tile SVG fill — 4 mirrored copies eliminate visible seams.
// Tile dimensions are multiplied by devicePixelRatio so textures stay crisp
// on retina / high-DPI screens.
function _appendMirrorTileSvg(item, imageUrl, tileW, tileH) {
    item.querySelectorAll('svg.poly-texture').forEach(s => s.remove());
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3× to avoid huge patterns
    tileW = Math.round(tileW * dpr);
    tileH = Math.round(tileH * dpr);

    const NS = 'http://www.w3.org/2000/svg';
    const ns = t => document.createElementNS(NS, t);
    const svg = ns('svg');
    svg.classList.add('poly-texture');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;image-rendering:crisp-edges;image-rendering:pixelated;';
    const patId = `mirrorPat${item.dataset.id}`;
    const defs = ns('defs');
    const pat  = ns('pattern');
    pat.id = patId;
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width',  tileW * 2);
    pat.setAttribute('height', tileH * 2);
    [
        null,
        `translate(${tileW * 2},0) scale(-1,1)`,
        `translate(0,${tileH * 2}) scale(1,-1)`,
        `translate(${tileW * 2},${tileH * 2}) scale(-1,-1)`,
    ].forEach(transform => {
        const img = ns('image');
        img.setAttribute('href', imageUrl);
        img.setAttribute('x', '0'); img.setAttribute('y', '0');
        img.setAttribute('width', tileW); img.setAttribute('height', tileH);
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        if (transform) img.setAttribute('transform', transform);
        pat.appendChild(img);
    });
    defs.appendChild(pat);
    svg.appendChild(defs);
    const bg = ns('rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', '99999'); bg.setAttribute('height', '99999');
    bg.setAttribute('fill', `url(#${patId})`);
    svg.appendChild(bg);
    item.appendChild(svg);
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
        <button class="control-btn" onclick="sendToBack('${item.dataset.id}')"    title="Send to back"    style="font-size:11px;padding:4px 7px;">Back</button>
        <button class="control-btn" onclick="bringToFront('${item.dataset.id}')"  title="Bring to front"  style="font-size:11px;padding:4px 7px;">Front</button>
        <button class="control-btn" onclick="copyItem('${item.dataset.id}')"      title="Copy">⧉</button>
    `;

    if (isMesh) {
        html += `<button class="control-btn" onclick="resetSize('${item.dataset.id}')" title="Reset shape">↻</button>`;
        html += `<span style="font-size:11px;color:#718096;padding:0 4px;" id="dotCountBadge"></span>`;
    }

    const isPathEl = isPathItem(item.dataset.name, item.dataset.category);
    if (isPathEl) {
        html += `
            <button class="control-btn" onclick="changePathWidth('${item.dataset.id}', -8)" title="Narrow path">−</button>
            <button class="control-btn" onclick="changePathWidth('${item.dataset.id}', 8)"  title="Widen path">+</button>
            <button class="control-btn" onclick="resetPath('${item.dataset.id}')" title="Reset path shape">↻</button>
            <span style="font-size:10px;color:#718096;padding:0 2px;">right-click dot → add point</span>
        `;
    }

    html += `
        <button class="control-btn delete-btn" onclick="deleteItem('${item.dataset.id}')">🗑️</button>
    `;

    panel.innerHTML = html;
    canvas.appendChild(panel);
    controlPanel = panel;

    updateControlPanelPosition(item);
    updateDotCount();

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
    } else if (item.dataset.pathPoints) {
        const pts = JSON.parse(item.dataset.pathPoints);
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
// Circular drag around item center — like MS Word's rotate handle.
function startRotation(e) {
    e.stopPropagation(); e.preventDefault();
    isRotating = true;
    const itemId = e.currentTarget.dataset.itemId;
    const item   = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;

    // Remove the current rotation so getBoundingClientRect returns the un-rotated center
    const currentAngle = parseFloat(item.dataset.rotation || 0);
    const rect   = item.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2;
    const cy     = rect.top  + rect.height / 2;

    // The initial offset angle so the item doesn't jump when you first grab
    const startMouseAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const startItemAngle  = currentAngle;

    const onMove = mv => {
        if (!isRotating) return;
        const mouseAngle = Math.atan2(mv.clientY - cy, mv.clientX - cx) * 180 / Math.PI;
        const delta  = mouseAngle - startMouseAngle;
        const angle  = ((startItemAngle + delta) % 360 + 360) % 360;
        item.dataset.rotation = Math.round(angle);
        item.style.transform  = `rotate(${angle}deg)`;
    };
    const onUp = () => {
        isRotating = false;
        saveDesign();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function addRotateHandle(item) {
    removeRotateHandle(item);
    const wrapper = document.createElement('div');
    wrapper.className = 'rotate-handle-wrapper';
    const stem = document.createElement('div');
    stem.className = 'rotate-handle-stem';
    const handle = document.createElement('div');
    handle.className = 'rotate-handle';
    handle.dataset.itemId = item.dataset.id;
    handle.title = 'Drag to rotate';
    handle.innerHTML = '↻';
    wrapper.appendChild(stem);
    wrapper.appendChild(handle);
    item.appendChild(wrapper);
    handle.addEventListener('mousedown', startRotation);
}

function removeRotateHandle(item) {
    if (item) item.querySelectorAll('.rotate-handle-wrapper').forEach(el => el.remove());
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

window.bringToFront = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) { item.style.zIndex = 100; saveDesign(); }
};
window.sendToBack = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) { item.style.zIndex = 1; saveDesign(); }
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

    // coverage: hardscapes ($/ton, sfPerUnit=SF per ton) + grass ($/sqft, sfPerUnit=1)
    const coverage   = {}; // name → { name, price, sfPerUnit, unitType, totalSqFt, noScale }
    const regular    = {}; // name → { name, price, count }
    const brickPaths = {}; // name → { name, price, items[] }

    placedItems.forEach(item => {
        if (isBrickPath(item.name, item.category)) {
            if (!brickPaths[item.name]) brickPaths[item.name] = { name: item.name, price: item.price, items: [] };
            brickPaths[item.name].items.push(item);
            return;
        }
        const sfPerTon    = getCoverageRate(item.name);
        const isPerSqft   = isGrassItem(item.name, item.category);
        if (sfPerTon !== undefined) {
            if (!coverage[item.name]) coverage[item.name] = { name: item.name, price: item.price, sfPerUnit: sfPerTon, unitType: 'ton', totalSqFt: 0, noScale: false };
            const sqFt = getItemSqFt(item);
            if (sqFt === null) coverage[item.name].noScale = true;
            else coverage[item.name].totalSqFt += sqFt;
        } else if (isPerSqft) {
            if (!coverage[item.name]) coverage[item.name] = { name: item.name, price: item.price, sfPerUnit: 1, unitType: 'sqft', totalSqFt: 0, noScale: false };
            const sqFt = getItemSqFt(item);
            if (sqFt === null) coverage[item.name].noScale = true;
            else coverage[item.name].totalSqFt += sqFt;
        } else {
            if (!regular[item.name]) regular[item.name] = { name: item.name, price: item.price, count: 0 };
            regular[item.name].count++;
        }
    });

    let total = 0, html = '';

    // Coverage-based rows (hardscapes + grass)
    Object.values(coverage).forEach(item => {
        const units = item.totalSqFt / item.sfPerUnit;
        const cost  = units * item.price;
        total += cost;
        const hasScale = !item.noScale && item.totalSqFt > 0;
        const detailLine = hasScale
            ? item.unitType === 'ton'
                ? `<div style="font-size:11px;color:#10b981;font-weight:600;margin-top:3px;">📐 ${item.totalSqFt.toFixed(1)} sq ft covered</div>
                   <div style="font-size:11px;color:#718096;">${units.toFixed(2)} tons · $${item.price.toFixed(2)}/ton</div>`
                : `<div style="font-size:11px;color:#10b981;font-weight:600;margin-top:3px;">📐 ${item.totalSqFt.toFixed(1)} sq ft covered</div>
                   <div style="font-size:11px;color:#718096;">$${item.price.toFixed(2)}/sqft</div>`
            : item.noScale
                ? `<div style="font-size:11px;color:#f59e0b;">⚠ Analyze photo to calculate SF</div>`
                : `<div style="font-size:11px;color:#718096;">Shape on canvas to calculate SF</div>`;
        html += `<div class="material-item coverage-item">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${item.name}</div>
                ${detailLine}
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

    // Brick path rows (count bricks from path pixel length)
    Object.values(brickPaths).forEach(group => {
        let totalBricks = 0, hasNoScale = false, anyDrawn = false;
        group.items.forEach(item => {
            const info = getBrickPathInfo(item);
            if (!info) return;
            anyDrawn = true;
            if (info.noScale) { hasNoScale = true; return; }
            totalBricks += info.brickCount || 0;
        });
        const cost = totalBricks * group.price;
        total += cost;
        const detailLine = !anyDrawn
            ? `<div style="font-size:11px;color:#718096;">Draw path to calculate bricks</div>`
            : hasNoScale
                ? `<div style="font-size:11px;color:#f59e0b;">⚠ Enter yard area to calculate bricks</div>`
                : totalBricks > 0
                    ? `<div style="font-size:11px;color:#b5631a;font-weight:600;margin-top:3px;">🧱 ${totalBricks.toLocaleString()} bricks needed (+10% waste)</div>
                       <div style="font-size:11px;color:#718096;">$${group.price.toFixed(2)}/brick</div>`
                    : `<div style="font-size:11px;color:#718096;">Path too short to calculate</div>`;
        html += `<div class="material-item">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${group.name}</div>
                ${detailLine}
            </div>
            <div style="font-weight:700;color:#b5631a;font-size:14px;white-space:nowrap;">$${cost.toFixed(2)}</div>
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
                pathFill:    i.element.dataset.pathFill,
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
            if (d.pathPoints) { item.dataset.pathPoints = d.pathPoints; item.dataset.pathWidth = d.pathWidth || '40'; if (d.pathFill) item.dataset.pathFill = d.pathFill; applyPathShape(item); }
        }
        deselectItem();
        updateMaterialsList(); // recalculate after all polygon shapes are restored
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
    if (isBrickPath(item.dataset.name, item.dataset.category)) { return applyBrickPathShape(item); }
    // Non-brick path in fill mode (freehand drawn area)
    if (item.dataset.pathFill === 'true') {
        const pts = JSON.parse(item.dataset.pathPoints || '[]');
        if (pts.length >= 3) return applyGenericPathFillShape(item);
    }
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

function applyBrickPathShape(item) {
    const points    = JSON.parse(item.dataset.pathPoints || '[]');
    const pathWidth = parseInt(item.dataset.pathWidth || 40);
    const fillMode  = item.dataset.pathFill === 'true' && points.length >= 3;
    if (points.length < 2) return;

    let svg = item.querySelector('svg.path-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('path-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        item.appendChild(svg);
    }

    const xs   = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad  = fillMode ? 4 : pathWidth;
    const W    = Math.max(1, maxX - minX + pad * 2);
    const H    = Math.max(1, maxY - minY + pad * 2);

    item.style.left = (minX - pad) + 'px'; item.style.top  = (minY - pad) + 'px';
    item.style.width = W + 'px';           item.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';

    const NS    = 'http://www.w3.org/2000/svg';
    const ns    = tag => document.createElementNS(NS, tag);
    const patId = `brickPat${item.dataset.id}`;
    const patScale = fillMode ? '1' : (pathWidth / 40).toFixed(3);

    const imageUrl   = item.dataset.imageUrl || '';
    const isRealImage = /^(https?:|\/|data:|blob:)/.test(imageUrl);

    const defs = ns('defs');
    const pat  = ns('pattern');
    pat.id = patId;
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('patternTransform', `scale(${patScale})`);

    if (isRealImage) {
        const tileSize = 80;
        pat.setAttribute('width', tileSize); pat.setAttribute('height', tileSize);
        const imgEl = ns('image');
        imgEl.setAttribute('href', imageUrl);
        imgEl.setAttribute('width', tileSize); imgEl.setAttribute('height', tileSize);
        imgEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        pat.appendChild(imgEl);
    } else {
        // SVG-drawn brick fallback (emoji / no real image)
        const patW = 40, patH = 26;
        pat.setAttribute('width', patW); pat.setAttribute('height', patH);
        const bg = ns('rect');
        bg.setAttribute('width', patW); bg.setAttribute('height', patH);
        bg.setAttribute('fill', '#c8a882');
        pat.appendChild(bg);
        [[2, 2, 16, 11], [22, 2, 16, 11]].forEach(([x, y, w, h]) => {
            const r = ns('rect');
            r.setAttribute('x', x); r.setAttribute('y', y);
            r.setAttribute('width', w); r.setAttribute('height', h);
            r.setAttribute('rx', '1'); r.setAttribute('fill', '#b5631a');
            pat.appendChild(r);
        });
        [[0, 15, 8, 11], [12, 15, 16, 11], [32, 15, 8, 11]].forEach(([x, y, w, h]) => {
            const r = ns('rect');
            r.setAttribute('x', x); r.setAttribute('y', y);
            r.setAttribute('width', w); r.setAttribute('height', h);
            r.setAttribute('rx', '1'); r.setAttribute('fill', '#b5631a');
            pat.appendChild(r);
        });
    }
    defs.appendChild(pat);
    svg.appendChild(defs);

    if (fillMode) {
        // Build smooth CLOSED polygon (catmull-rom via Q beziers)
        const n = points.length;
        const px = i => points[i % n].x - minX + pad;
        const py = i => points[i % n].y - minY + pad;
        const mx0 = (px(n - 1) + px(0)) / 2, my0 = (py(n - 1) + py(0)) / 2;
        let d = `M ${mx0.toFixed(1)} ${my0.toFixed(1)}`;
        for (let i = 0; i < n; i++) {
            const nx_ = (px(i) + px(i + 1)) / 2, ny_ = (py(i) + py(i + 1)) / 2;
            d += ` Q ${px(i).toFixed(1)} ${py(i).toFixed(1)} ${nx_.toFixed(1)} ${ny_.toFixed(1)}`;
        }
        d += ' Z';

        // Shadow
        const shadow = ns('path');
        shadow.setAttribute('d', d); shadow.setAttribute('fill', 'rgba(0,0,0,0.2)');
        shadow.setAttribute('stroke', 'none'); shadow.setAttribute('transform', 'translate(3,3)');
        svg.appendChild(shadow);

        if (isRealImage) {
            // Mirror-tile pattern — 2×2 reflected grid, seamless at any scale
            const tilePatId = `brickMirror${item.dataset.id}`;
            const tileW = 150, tileH = 100;
            const tilePat = ns('pattern');
            tilePat.id = tilePatId;
            tilePat.setAttribute('patternUnits', 'userSpaceOnUse');
            tilePat.setAttribute('width', tileW * 2); tilePat.setAttribute('height', tileH * 2);
            [
                null,
                `translate(${tileW * 2},0) scale(-1,1)`,
                `translate(0,${tileH * 2}) scale(1,-1)`,
                `translate(${tileW * 2},${tileH * 2}) scale(-1,-1)`,
            ].forEach(transform => {
                const img = ns('image');
                img.setAttribute('href', imageUrl);
                img.setAttribute('x', '0'); img.setAttribute('y', '0');
                img.setAttribute('width', tileW); img.setAttribute('height', tileH);
                img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
                if (transform) img.setAttribute('transform', transform);
                tilePat.appendChild(img);
            });
            defs.appendChild(tilePat);

            const fill = ns('path');
            fill.setAttribute('d', d); fill.setAttribute('fill', `url(#${tilePatId})`);
            fill.setAttribute('stroke', 'none');
            svg.appendChild(fill);
        } else {
            // SVG brick pattern fallback
            const fill = ns('path');
            fill.setAttribute('d', d); fill.setAttribute('fill', `url(#${patId})`);
            fill.setAttribute('stroke', 'none');
            svg.appendChild(fill);
        }

        // Border on top
        const border = ns('path');
        border.setAttribute('d', d); border.setAttribute('fill', 'none');
        border.setAttribute('stroke', '#7a3f10'); border.setAttribute('stroke-width', '2.5');
        border.setAttribute('stroke-linejoin', 'round'); border.setAttribute('data-measure', 'true');
        svg.appendChild(border);
    } else {
        // Legacy stroke mode (default 3-point path from sidebar click)
        let d = `M ${points[0].x - minX + pad} ${points[0].y - minY + pad}`;
        for (let i = 1; i < points.length; i++) {
            const cx2 = points[i].x - minX + pad, cy2 = points[i].y - minY + pad;
            if (i === points.length - 1) { d += ` L ${cx2} ${cy2}`; }
            else {
                const nx = points[i+1].x - minX + pad, ny = points[i+1].y - minY + pad;
                d += ` Q ${cx2} ${cy2} ${(cx2+nx)/2} ${(cy2+ny)/2}`;
            }
        }
        const shadow = ns('path');
        shadow.setAttribute('d', d); shadow.setAttribute('stroke', 'rgba(0,0,0,0.28)');
        shadow.setAttribute('stroke-width', pathWidth + 4); shadow.setAttribute('stroke-linecap', 'round');
        shadow.setAttribute('stroke-linejoin', 'round'); shadow.setAttribute('fill', 'none');
        svg.appendChild(shadow);
        const brickPath = ns('path');
        brickPath.setAttribute('d', d); brickPath.setAttribute('stroke', `url(#${patId})`);
        brickPath.setAttribute('stroke-width', pathWidth); brickPath.setAttribute('stroke-linecap', 'round');
        brickPath.setAttribute('stroke-linejoin', 'round'); brickPath.setAttribute('fill', 'none');
        brickPath.setAttribute('opacity', '0.95'); brickPath.setAttribute('data-measure', 'true');
        svg.appendChild(brickPath);
    }
}

// Filled polygon for non-brick path types (stone, gravel, wood chips, etc.)
function applyGenericPathFillShape(item) {
    const points = JSON.parse(item.dataset.pathPoints || '[]');
    if (points.length < 3) return;

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
    const pad = 4;
    const W = Math.max(1, maxX - minX + pad * 2), H = Math.max(1, maxY - minY + pad * 2);

    item.style.left = (minX - pad) + 'px'; item.style.top = (minY - pad) + 'px';
    item.style.width = W + 'px'; item.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';

    const name = (item.dataset.name || '').toLowerCase();
    let fillColor = '#a0826d', strokeColor = '#7a5c3a';
    if (name.includes('stone') || name.includes('cobble') || name.includes('paver')) { fillColor = '#9e9e9e'; strokeColor = '#616161'; }
    else if (name.includes('wood') || name.includes('chip')) { fillColor = '#8d6038'; strokeColor = '#5d3c1e'; }
    else if (name.includes('gravel') || name.includes('pea')) { fillColor = '#bcaaa4'; strokeColor = '#795548'; }

    const imageUrl    = item.dataset.imageUrl || '';
    const isRealImage = /^(https?:|\/|data:|blob:)/.test(imageUrl);

    const NS = 'http://www.w3.org/2000/svg';
    const gns = tag => document.createElementNS(NS, tag);

    const n = points.length;
    const px = i => points[i % n].x - minX + pad;
    const py = i => points[i % n].y - minY + pad;
    const mx0 = (px(n - 1) + px(0)) / 2, my0 = (py(n - 1) + py(0)) / 2;
    let d = `M ${mx0.toFixed(1)} ${my0.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
        const nx_ = (px(i) + px(i + 1)) / 2, ny_ = (py(i) + py(i + 1)) / 2;
        d += ` Q ${px(i).toFixed(1)} ${py(i).toFixed(1)} ${nx_.toFixed(1)} ${ny_.toFixed(1)}`;
    }
    d += ' Z';

    const shadow = gns('path');
    shadow.setAttribute('d', d); shadow.setAttribute('fill', 'rgba(0,0,0,0.15)');
    shadow.setAttribute('transform', 'translate(3,3)');
    svg.appendChild(shadow);

    if (isRealImage) {
        // Mirror-tile pattern — seamless at any scale
        const tilePatId = `genericMirror${item.dataset.id}`;
        const tileSize  = 150;
        const defs      = gns('defs');
        const tilePat   = gns('pattern');
        tilePat.id = tilePatId;
        tilePat.setAttribute('patternUnits', 'userSpaceOnUse');
        tilePat.setAttribute('width', tileSize * 2); tilePat.setAttribute('height', tileSize * 2);
        [
            null,
            `translate(${tileSize * 2},0) scale(-1,1)`,
            `translate(0,${tileSize * 2}) scale(1,-1)`,
            `translate(${tileSize * 2},${tileSize * 2}) scale(-1,-1)`,
        ].forEach(transform => {
            const img = gns('image');
            img.setAttribute('href', imageUrl);
            img.setAttribute('x', '0'); img.setAttribute('y', '0');
            img.setAttribute('width', tileSize); img.setAttribute('height', tileSize);
            img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
            if (transform) img.setAttribute('transform', transform);
            tilePat.appendChild(img);
        });
        defs.appendChild(tilePat);
        svg.appendChild(defs);

        const fill = gns('path');
        fill.setAttribute('d', d); fill.setAttribute('fill', `url(#${tilePatId})`);
        fill.setAttribute('stroke', 'none');
        svg.appendChild(fill);
    } else {
        const fill = gns('path');
        fill.setAttribute('d', d); fill.setAttribute('fill', fillColor);
        fill.setAttribute('fill-opacity', '0.9');
        svg.appendChild(fill);
    }

    // Border on top
    const border = gns('path');
    border.setAttribute('d', d); border.setAttribute('fill', 'none');
    border.setAttribute('stroke', strokeColor); border.setAttribute('stroke-width', '2.5');
    border.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(border);
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
    item.dataset.pathWidth = Math.max(10, Math.min(120, parseInt(item.dataset.pathWidth || 40) + delta));
    applyPathShape(item);
    updateMaterialsList();
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

    const width  = document.getElementById('width')?.value  || 'Not specified';
    const height = document.getElementById('height')?.value || 'Not specified';
    const depth  = document.getElementById('depth')?.value  || 'Not specified';

    // Mirror updateMaterialsList pricing: hardscapes per ton, grass per sqft
    const checkoutItems  = [];
    const coverageGroups = {};
    const regularGroups  = {};
    placedItems.forEach(item => {
        const sfPerTon  = getCoverageRate(item.name);
        const isPerSqft = isGrassItem(item.name, item.category);
        if (sfPerTon !== undefined) {
            if (!coverageGroups[item.name]) coverageGroups[item.name] = { name: item.name, basePricePerUnit: item.price || 0, sfPerUnit: sfPerTon, totalSqFt: 0 };
            const sqFt = getItemSqFt(item);
            if (sqFt) coverageGroups[item.name].totalSqFt += sqFt;
        } else if (isPerSqft) {
            if (!coverageGroups[item.name]) coverageGroups[item.name] = { name: item.name, basePricePerUnit: item.price || 0, sfPerUnit: 1, totalSqFt: 0 };
            const sqFt = getItemSqFt(item);
            if (sqFt) coverageGroups[item.name].totalSqFt += sqFt;
        } else if (isBrickPath(item.name, item.category)) {
            const info = getBrickPathInfo(item);
            const itemCost = (info && !info.noScale && info.cost) ? info.cost : (item.price || 0);
            const bricks   = (info && !info.noScale && info.brickCount) ? info.brickCount : 1;
            checkoutItems.push({ name: `${item.name} (${bricks.toLocaleString()} bricks)`, price: parseFloat(itemCost.toFixed(2)) });
        } else {
            if (!regularGroups[item.name]) regularGroups[item.name] = { name: item.name, price: item.price || 0, count: 0 };
            regularGroups[item.name].count++;
        }
    });

    // Coverage items (hardscapes + grass): area-computed when polygon drawn, unit price fallback
    Object.values(coverageGroups).forEach(g => {
        if (g.sfPerUnit > 0 && g.totalSqFt > 0) {
            const units = g.totalSqFt / g.sfPerUnit;
            checkoutItems.push({ name: g.name, price: parseFloat((units * g.basePricePerUnit).toFixed(2)) });
        } else {
            const count = placedItems.filter(i => i.name === g.name).length;
            const unitPrice = parseFloat(g.basePricePerUnit) || 0;
            for (let c = 0; c < count; c++) checkoutItems.push({ name: g.name, price: unitPrice });
        }
    });
    // Regular items: individual entries so checkout can display qty × unit price
    Object.values(regularGroups).forEach(g => {
        const unitPrice = parseFloat(g.price) || 0;
        for (let c = 0; c < g.count; c++) checkoutItems.push({ name: g.name, price: unitPrice });
    });
    // Compute total directly from checkoutItems so it's always consistent with actual prices
    const total = parseFloat(checkoutItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0).toFixed(2));

    try {
        // Pass items + total to checkout page
        localStorage.setItem('gardiyCheckout', JSON.stringify({ items: checkoutItems, total }));

        // Save submission to MongoDB (fire-and-forget — don't block redirect)
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        fetch('https://gardiy-backend-production.up.railway.app/api/designs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(session.token ? { 'Authorization': `Bearer ${session.token}` } : {})
            },
            body: JSON.stringify({
                userId: session.id || session.email || 'guest',
                designName: `${session.name || 'Customer'} – ${new Date().toLocaleDateString()}`,
                items: checkoutItems,
                totalCost: total,
                landscapeImageData: designScreenshot,
            })
        }).catch(() => {});

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

    .product-item.drawing-active {
        background: #fff7ed !important;
        border: 2px solid #b5631a !important;
        box-shadow: 0 0 0 3px rgba(181,99,26,0.18);
    }

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

    .rotate-handle-wrapper {
        position:absolute; top:-52px; left:50%;
        transform:translateX(-50%);
        display:flex; flex-direction:column; align-items:center;
        pointer-events:none; z-index:9999;
    }
    .rotate-handle-stem {
        width:2px; height:20px;
        background:rgba(102,126,234,0.7);
        pointer-events:none;
    }
    .rotate-handle {
        width:28px; height:28px; border-radius:50%;
        background:linear-gradient(135deg,#667eea,#764ba2);
        cursor:grab; display:flex; align-items:center; justify-content:center;
        color:white; font-size:15px;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        pointer-events:auto; user-select:none;
    }
    .rotate-handle:active { cursor:grabbing; }
` }));

// ── Plant recommendation color coding ─────────────────────────────────────────
// Maps AI-returned plant name keywords → generic product names in the sidebar
const PLANT_KEYWORD_MAP = [
    { keys: ['spruce','pine','oak','maple','elm','birch','willow','ash','fir','cedar','cottonwood','aspen','larch','juniper','conifer','evergreen','deciduous'], products: ['tree','deciduous tree'] },
    { keys: ['palm','tropical','banana','ficus','hibiscus'], products: ['palm tree'] },
    { keys: ['cactus','succulent','agave','yucca','aloe','opuntia'], products: ['cactus'] },
    { keys: ['rose','rosa'], products: ['rose'] },
    { keys: ['sunflower','helianthus'], products: ['sunflower'] },
    { keys: ['tulip','daffodil','crocus','hyacinth','bulb'], products: ['tulip'] },
    { keys: ['cherry','blossom','ornamental cherry','prunus'], products: ['cherry blossom'] },
    { keys: ['lavender','sage','thyme','oregano','herb','perennial','annual','columbine','yarrow','coneflower','echinacea','black-eyed','daisy','zinnia','marigold','petunia','impatiens','salvia','aster','sedum'], products: ['small plant','potted plant'] },
    { keys: ['shrub','bush','boxwood','lilac','forsythia','spirea','viburnum','potentilla'], products: ['small plant','potted plant'] },
    { keys: ['grass','lawn','turf','sod','bluegrass','fescue','buffalo grass','zoysia','bermuda','ryegrass','dropseed'], products: ['lawn','grass field'] },
];

function matchRecsToProducts(recList, productName) {
    const name = productName.toLowerCase();
    return recList.some(r => {
        const rl = r.toLowerCase();
        // direct substring match
        if (name.includes(rl) || rl.includes(name)) return true;
        // keyword map: check if the rec string contains a keyword that maps to this product
        return PLANT_KEYWORD_MAP.some(entry =>
            entry.products.some(p => name.includes(p)) &&
            entry.keys.some(k => rl.includes(k))
        );
    });
}

function applyPlantRecommendationColors() {
    const recs = window.GarDIYStorage?.getRecommendations?.();
    if (!recs) return;

    const recommended    = (recs.recommended    || []);
    const notRecommended = (recs.notRecommended || []);
    if (!recommended.length && !notRecommended.length) return;

    const plantCategories = ['plants', 'trees', 'flowers'];
    let anyColored = false;

    document.querySelectorAll('.product-item').forEach(item => {
        const product = productRegistry[item.dataset.pid];
        if (!product || !plantCategories.includes((product.category || '').toLowerCase())) return;

        const name = product.name;

        const isRec    = matchRecsToProducts(recommended,    name);
        const isNotRec = !isRec && matchRecsToProducts(notRecommended, name);

        item.classList.remove('plant-recommended', 'plant-not-recommended');
        if (isRec) {
            item.classList.add('plant-recommended');
            anyColored = true;
        } else if (isNotRec) {
            item.classList.add('plant-not-recommended');
            anyColored = true;
        }
    });

    // Inject a legend into the sidebar when colors are active
    if (anyColored && !document.getElementById('plantLegend')) {
        const sidebar = document.querySelector('.design-sidebar');
        const h3 = sidebar?.querySelector('h3');
        if (h3) {
            const legend = document.createElement('div');
            legend.id        = 'plantLegend';
            legend.className = 'plant-legend';
            legend.innerHTML = `
                <span class="legend-item"><span class="legend-dot rec-dot"></span>Recommended</span>
                <span class="legend-item"><span class="legend-dot notrec-dot"></span>Not recommended</span>
                <span class="legend-item sun-legend">☀️ Full sun &nbsp; ⛅ Both &nbsp; ☁️ Shade</span>
            `;
            h3.insertAdjacentElement('afterend', legend);
        }
    }
}

// ── Freehand path drawing mode ────────────────────────────────────────────────

function enterPathDrawingMode(product, sidebarItem) {
    document.querySelectorAll('.product-item.drawing-active').forEach(el => el.classList.remove('drawing-active'));
    if (sidebarItem) sidebarItem.classList.add('drawing-active');

    drawingMode    = true;
    drawingProduct = product;
    drawingPoints  = [];
    isMouseDownDraw = false;

    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    deselectItem();

    // Transparent overlay captures all mouse events on the canvas
    drawingOverlay = document.createElement('div');
    drawingOverlay.style.cssText = 'position:absolute;inset:0;z-index:10000;cursor:crosshair;user-select:none;';
    canvas.appendChild(drawingOverlay);

    drawingOverlay.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        isMouseDownDraw = true;
        drawingPoints   = [];
        const rect = canvas.getBoundingClientRect();
        drawingPoints.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });

        // Live preview SVG
        drawingPreviewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        drawingPreviewSvg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10001;overflow:visible;';
        canvas.appendChild(drawingPreviewSvg);
    });

    // Drawing hint banner
    let hint = document.getElementById('drawingModeHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'drawingModeHint';
        hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(181,99,26,0.92);color:white;padding:7px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:10002;pointer-events:none;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        canvas.appendChild(hint);
    }
    hint.textContent = `✏️ Draw ${product.name} — click & drag, release to place  ·  Esc to cancel`;
    hint.style.display = 'block';
}

function exitPathDrawingMode() {
    drawingMode     = false;
    drawingProduct  = null;
    drawingPoints   = [];
    isMouseDownDraw = false;

    if (drawingOverlay)    { drawingOverlay.remove();    drawingOverlay    = null; }
    if (drawingPreviewSvg) { drawingPreviewSvg.remove(); drawingPreviewSvg = null; }

    const hint = document.getElementById('drawingModeHint');
    if (hint) hint.style.display = 'none';

    document.querySelectorAll('.product-item.drawing-active').forEach(el => el.classList.remove('drawing-active'));
}

function _updateDrawingPreview() {
    if (!drawingPreviewSvg || drawingPoints.length < 2) return;
    const pts = drawingPoints;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    drawingPreviewSvg.innerHTML = `
        <path d="${d}" stroke="#b5631a" stroke-width="3" fill="none"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="10 5" opacity="0.75"/>`;
}

async function _finishDrawingPath(simplifiedPts) {
    const p = drawingProduct;
    if (!p) return;
    const data = { name: p.name, image: p.image, type: p.type, category: p.category, price: parseFloat(p.price) };

    await addItemToCanvas(data, simplifiedPts[0].x, simplifiedPts[0].y);

    const newItem = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
    if (!newItem) return;

    // Auto-close: if last point is far from first, connect them to seal the area
    const pts   = [...simplifiedPts];
    const first = pts[0], last = pts[pts.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) > 30) {
        pts.push({ x: first.x, y: first.y });
    }

    newItem.dataset.pathPoints = JSON.stringify(pts.map(pt => ({ id: dotIdCounter++, x: pt.x, y: pt.y })));
    newItem.dataset.pathFill   = 'true'; // render as filled area, not stroke

    applyPathShape(newItem);
    if (newItem === selectedItem) createPathControls(newItem);
    updateMaterialsList();
}

// Escape key cancels drawing mode
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawingMode) exitPathDrawingMode();
});

// ── Auto Design ──────────────────────────────────────────────────────────────

const AUTO_DESIGN_STYLES = {
    california_coastal: {
        key:   'california_coastal',
        icon:  '🌊',
        name:  'California Coastal',
        desc:  'Drought-tolerant plants, ornamental grasses, stone paths',
    },
    mediterranean: {
        key:   'mediterranean',
        icon:  '🫒',
        name:  'Mediterranean',
        desc:  'Lavender, roses, stone pavers, terracotta pots, fountain',
    },
    japanese: {
        key:   'japanese',
        icon:  '⛩️',
        name:  'Japanese Garden',
        desc:  'Cherry blossoms, stone paths, minimalist & serene',
    },
};

let autoDesignSelectedStyle = null;

function openAutoDesignModal() {
    if (document.getElementById('autoDesignModal')) {
        document.getElementById('autoDesignModal').style.display = 'flex';
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'autoDesignModal';
    modal.className = 'ad-overlay';
    modal.innerHTML = `
        <div class="ad-modal">
            <button class="ad-close" onclick="closeAutoDesignModal()">×</button>
            <div class="ad-header">
                <h2>✨ Auto Design</h2>
                <p>Choose a style — AI will design your yard using your available products.</p>
            </div>
            <div class="ad-cards">
                ${Object.values(AUTO_DESIGN_STYLES).map(s => `
                <div class="ad-card" data-style="${s.key}" onclick="selectAutoStyle(this)">
                    <div class="ad-card-icon">${s.icon}</div>
                    <div class="ad-card-name">${s.name}</div>
                    <div class="ad-card-desc">${s.desc}</div>
                </div>`).join('')}
            </div>
            <button class="ad-generate-btn" id="adGenerateBtn" disabled onclick="runAutoDesign()">
                Choose a style to generate
            </button>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeAutoDesignModal(); });
    document.body.appendChild(modal);
}

function closeAutoDesignModal() {
    const m = document.getElementById('autoDesignModal');
    if (m) m.style.display = 'none';
}

function selectAutoStyle(card) {
    document.querySelectorAll('.ad-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    autoDesignSelectedStyle = card.dataset.style;
    const btn = document.getElementById('adGenerateBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = `Generate ${AUTO_DESIGN_STYLES[autoDesignSelectedStyle].name} Design`;
    }
}

async function runAutoDesign() {
    if (!autoDesignSelectedStyle) return;
    const btn = document.getElementById('adGenerateBtn');
    if (btn) { btn.disabled = true; btn.textContent = '🎨 Generating…'; }

    const imageData = window.GarDIYStorage?.getImage();
    if (!imageData) {
        alert('No landscape photo found — please upload a photo first.');
        if (btn) { btn.disabled = false; btn.textContent = 'Generate Design'; }
        return;
    }

    // Only send plant/tree/flower/rocks/path categories to the AI
    const ALLOWED_FOR_AD = new Set(['plants', 'trees', 'flowers', 'rocks_pavers', 'paths']);
    const products = Object.values(productRegistry)
        .filter(p => ALLOWED_FOR_AD.has((p.category || '').toLowerCase()))
        .map(p => ({ name: p.name, category: p.category }));

    try {
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const headers = { 'Content-Type': 'application/json' };
        if (session.token) headers['Authorization'] = 'Bearer ' + session.token;

        const res = await fetch('https://gardiy-backend-production.up.railway.app/api/auto-design', {
            method: 'POST',
            headers,
            body: JSON.stringify({ imageData, style: autoDesignSelectedStyle, products }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Auto-design failed');

        closeAutoDesignModal();
        await placeAutoDesignItems(data.items, AUTO_DESIGN_STYLES[autoDesignSelectedStyle].name);

    } catch (err) {
        alert('Auto-design error: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Generate Design'; }
    }
}

async function placeAutoDesignItems(items, styleName) {
    // Clear current design first
    deselectItem();
    [...placedItems].forEach(pi => pi.element.remove());
    placedItems = [];
    removePolyDots();
    removeMeshDots();
    removeCornerHandles();
    removeControlPanel();

    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    // Canvas loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'adCanvasOverlay';
    overlay.innerHTML = `<span style="font-size:2rem;">✨</span><span style="margin-top:0.4rem;font-size:0.95rem;font-weight:600;color:#065f46;">Designing your ${styleName} garden…</span>`;
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.82);backdrop-filter:blur(2px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;border-radius:inherit;gap:0.25rem;';
    canvas.appendChild(overlay);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const allProducts = Object.values(productRegistry);

    for (const item of items) {
        const product = allProducts.find(p => p.name.toLowerCase() === (item.name || '').toLowerCase());
        if (!product) { console.warn('Auto-design: product not found:', item.name); continue; }

        const itemW = Math.round(Math.max(40, (item.w || 0.08) * W));
        const itemH = Math.round(Math.max(40, (item.h || 0.08) * H));
        // x/y from AI is the item center; convert to top-left for canvas
        const x = Math.max(0, Math.min(W - itemW, ((item.x || 0.5) * W) - itemW / 2));
        const y = Math.max(0, Math.min(H - itemH, ((item.y || 0.5) * H) - itemH / 2));

        await addItemToCanvas({
            name:     product.name,
            image:    product.image,
            type:     product.type,
            category: product.category,
            price:    parseFloat(product.price) || 0,
            _price:   parseFloat(product.price) || 0,
        }, x, y, itemW, itemH);

        await new Promise(r => setTimeout(r, 120)); // progressive reveal
    }

    overlay.remove();
    deselectItem();
    updateMaterialsList();
}

// ══════════════════════════════════════════════════════════════════════════════
// POLYGON FILL MODE
// Click to place corner points around any area, close the shape, then approve
// before sending to Gemini. Much easier than freehand drag.
// ══════════════════════════════════════════════════════════════════════════════

let _brushMode    = false;
let _brushProduct = null;
let _brushPts     = [];      // placed polygon corner points
let _brushCanvas  = null;

// Inject CSS once
(function() {
    const s = document.createElement('style');
    s.textContent = `.product-item.brush-active{outline:2px solid #16a34a;background:#f0fdf4;}`;
    document.head.appendChild(s);
})();

function enterBrushFillMode(productData) {
    if (_brushMode) exitBrushFillMode();
    _brushMode     = true;
    _brushProduct  = productData;
    _brushPts      = [];
    _brushApproved = false;

    const dc = document.getElementById('designCanvas');
    if (!dc) return;

    document.querySelectorAll('.product-item').forEach(el => el.classList.remove('brush-active'));
    document.querySelector(`.product-item[data-pid="${productData.id}"]`)?.classList.add('brush-active');

    // Overlay canvas
    _brushCanvas = document.createElement('canvas');
    _brushCanvas.id = 'brushOverlay';
    const dpr = window.devicePixelRatio || 1;
    _brushCanvas.width  = Math.round(dc.offsetWidth  * dpr);
    _brushCanvas.height = Math.round(dc.offsetHeight * dpr);
    _brushCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9500;cursor:crosshair;pointer-events:auto;';
    dc.appendChild(_brushCanvas);

    // Hint bar
    const hint = document.createElement('div');
    hint.id = 'brushHint';
    hint.innerHTML = `<b>📍 ${productData.name}</b> — click to place corners around your area &nbsp;·&nbsp; double-click last point to finish &nbsp;<span style="opacity:0.55;font-size:11px;">Esc to cancel</span>`;
    hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(15,15,15,0.80);color:#fff;padding:7px 18px;border-radius:22px;font-size:13px;z-index:9600;pointer-events:none;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,0.3);';
    dc.appendChild(hint);

    _brushCanvas.addEventListener('click',     _bClick);
    _brushCanvas.addEventListener('dblclick',  _bDblClick);
    _brushCanvas.addEventListener('mousemove', _bHover);
    document.addEventListener('keydown', _bKey);
}

function exitBrushFillMode() {
    _brushMode    = false;
    _brushProduct = null;
    _brushPts     = [];
    _brushCanvas  = null;
    document.getElementById('brushOverlay')?.remove();
    document.getElementById('brushHint')?.remove();
    document.getElementById('brushApproval')?.remove();
    document.querySelectorAll('.product-item').forEach(el => el.classList.remove('brush-active'));
    document.removeEventListener('keydown', _bKey);
}

function _bKey(e) {
    if (e.key === 'Escape') { exitBrushFillMode(); return; }
    // Backspace removes last placed point
    if ((e.key === 'Backspace' || e.key === 'Delete') && _brushPts.length > 0) {
        _brushPts.pop();
        _bDraw(null, null);
    }
}

// Track mouse position for rubber-band line
let _bMouseX = 0, _bMouseY = 0;
function _bHover(e) {
    const r = _brushCanvas.getBoundingClientRect();
    _bMouseX = e.clientX - r.left;
    _bMouseY = e.clientY - r.top;
    _bDraw(_bMouseX, _bMouseY);
}

function _bClick(e) {
    if (e.detail >= 2) return; // ignore — dblclick fires click twice
    const r = _brushCanvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // Snap-close: clicking near the first point (within 18px) closes the shape
    if (_brushPts.length >= 3) {
        const first = _brushPts[0];
        if (Math.hypot(x - first.x, y - first.y) < 18) { _bClose(); return; }
    }
    _brushPts.push({ x, y });
    _bDraw(x, y);
}

function _bDblClick(e) {
    if (_brushPts.length < 3) return;
    _bClose();
}

function _bDraw(mouseX, mouseY) {
    if (!_brushCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx  = _brushCanvas.getContext('2d');
    const w    = _brushCanvas.width  / dpr;
    const h    = _brushCanvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (_brushPts.length === 0) return;

    // Filled polygon (closed)
    ctx.beginPath();
    ctx.moveTo(_brushPts[0].x, _brushPts[0].y);
    _brushPts.forEach(p => ctx.lineTo(p.x, p.y));
    if (mouseX !== null) ctx.lineTo(mouseX, mouseY);
    ctx.closePath();
    ctx.fillStyle   = 'rgba(80,200,80,0.20)';
    ctx.strokeStyle = 'rgba(30,140,60,0.90)';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();

    // Placed corner dots
    _brushPts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle   = i === 0 ? '#16a34a' : '#fff';
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth   = 2;
        ctx.fill(); ctx.stroke();
    });

    // "Close" hint on first dot when near it
    if (_brushPts.length >= 3 && mouseX !== null) {
        const first = _brushPts[0];
        if (Math.hypot(mouseX - first.x, mouseY - first.y) < 18) {
            ctx.beginPath();
            ctx.arc(first.x, first.y, 12, 0, Math.PI * 2);
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth   = 2.5;
            ctx.stroke();
        }
    }
}

function _bClose() {
    if (_brushPts.length < 3) return;
    // Remove live-drawing mouse events, keep canvas visible for approval
    _brushCanvas.removeEventListener('click',     _bClick);
    _brushCanvas.removeEventListener('dblclick',  _bDblClick);
    _brushCanvas.removeEventListener('mousemove', _bHover);

    // Draw final closed shape, no rubber-band
    _bDraw(null, null);

    // Show approval panel
    const dc = document.getElementById('designCanvas');
    document.getElementById('brushHint')?.remove();

    const panel = document.createElement('div');
    panel.id = 'brushApproval';
    panel.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:9600;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.96);border:1px solid #e5e7eb;border-radius:28px;padding:8px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.15);font-size:13px;white-space:nowrap;';
    panel.innerHTML = `
        <span style="color:#374151;">Fill this area with <b>${_brushProduct?.name}</b>?</span>
        <button id="bApproveBtn" style="background:#16a34a;color:#fff;border:none;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer;">✨ Yes, fill it</button>
        <button id="bCancelBtn"  style="background:none;color:#6b7280;border:1px solid #d1d5db;border-radius:20px;padding:6px 14px;font-size:13px;cursor:pointer;">✗ Cancel</button>
    `;
    dc.appendChild(panel);

    document.getElementById('bApproveBtn').onclick = () => { panel.remove(); _bFinalize(); };
    document.getElementById('bCancelBtn').onclick  = () => exitBrushFillMode();
}

function _getProductPrompt(product) {
    const name = (product.name || '').toLowerCase();
    const cat  = (product.category || '').toLowerCase();
    if (cat === 'grass' || name.includes('grass') || name.includes('lawn'))
        return 'lush ' + product.name + ' lawn — dense, healthy green grass blades viewed from directly above, natural lighting';
    if (name.includes('brick'))
        return 'red brick paving in herringbone pattern, viewed from directly above';
    if (name.includes('stone') || name.includes('flagstone'))
        return 'natural flagstone pavers with sand joints, viewed from directly above';
    if (name.includes('gravel') || name.includes('pea'))
        return 'decorative pea gravel ground cover, viewed from directly above';
    if (name.includes('concrete') || name.includes('paver'))
        return 'smooth concrete pavers, viewed from directly above';
    if (cat === 'hardscapes' || cat === 'rocks_pavers')
        return product.name + ' hardscape surface, viewed from directly above';
    if (cat === 'paths')
        return product.name + ' garden pathway material, viewed from directly above';
    return product.name + ', garden landscaping material, viewed from directly above';
}

async function _bFinalize() {
    const product = _brushProduct;
    const pts     = _brushPts.slice();
    exitBrushFillMode();

    console.log('[AI Fill] Starting. Product:', product?.name, '| Points:', pts.length);

    const dc = document.getElementById('designCanvas');
    if (!dc)      { console.warn('[AI Fill] No designCanvas'); return; }
    if (!product) { console.warn('[AI Fill] No product');      return; }
    if (pts.length < 3) { console.warn('[AI Fill] Not enough points:', pts.length); return; }

    // ── 1. Bounding box + aspect ratio ───────────────────────────────────────────
    const minX = Math.min(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxX = Math.max(...pts.map(p => p.x));
    const maxY = Math.max(...pts.map(p => p.y));
    const bW   = Math.max(10, Math.ceil(maxX - minX));
    const bH   = Math.max(10, Math.ceil(maxY - minY));
    const ratio = bW / bH;
    // Pick closest Imagen aspect ratio
    const aspectRatio = ratio > 3    ? '16:9'
                      : ratio > 1.2  ? '4:3'
                      : ratio > 0.83 ? '1:1'
                      : ratio > 0.5  ? '3:4'
                      :                '9:16';
    console.log('[AI Fill] Bbox:', bW, 'x', bH, '| aspectRatio:', aspectRatio);

    // ── 2. Loading overlay ───────────────────────────────────────────────────────
    const loader = document.createElement('div');
    loader.id = 'aiFillLoader';
    loader.innerHTML = `<div style="font-size:2rem;">✨</div><div style="margin-top:8px;font-size:14px;font-weight:600;color:#065f46;">AI is filling your area…</div><div style="margin-top:4px;font-size:12px;color:#6b7280;">Usually takes 10–20 seconds</div>`;
    loader.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.82);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9800;border-radius:inherit;';
    dc.appendChild(loader);

    // ── 3. Call backend ──────────────────────────────────────────────────────────
    const prompt = _getProductPrompt(product);
    console.log('[AI Fill] Sending to backend. Prompt:', prompt);

    try {
        const resp = await fetch('https://gardiy-backend-production.up.railway.app/api/fill-area', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productPrompt: prompt, aspectRatio })
        });

        console.log('[AI Fill] Backend response status:', resp.status);
        const data = await resp.json();
        console.log('[AI Fill] Backend response:', { success: data.success, message: data.message, hasImage: !!data.image });
        loader.remove();

        if (!resp.ok || !data.success) {
            alert('AI fill failed: ' + (data.message || 'Unknown error'));
            return;
        }

        // ── 4. Mask the Imagen result to the drawn polygon shape ─────────────────
        const aiImg = await new Promise(res => {
            const i = new Image();
            i.onload = () => res(i); i.onerror = () => res(null); i.src = data.image;
        });
        if (!aiImg) { alert('Could not load the generated image.'); return; }

        const off = document.createElement('canvas');
        off.width = bW; off.height = bH;
        const octx = off.getContext('2d');

        // Draw Imagen result scaled to bounding box
        octx.drawImage(aiImg, 0, 0, bW, bH);

        // Mask to the drawn polygon
        octx.globalCompositeOperation = 'destination-in';
        octx.beginPath();
        octx.moveTo(pts[0].x - minX, pts[0].y - minY);
        pts.forEach(p => octx.lineTo(p.x - minX, p.y - minY));
        octx.closePath();
        octx.fill();
        octx.globalCompositeOperation = 'source-over';

        const maskedUrl = off.toDataURL('image/png');

        // Place as overlay item on canvas
        const item = document.createElement('div');
        item.className        = 'draggable-item';
        item.dataset.id       = itemIdCounter++;
        item.dataset.name     = product.name;
        item.dataset.category = product.category;
        item.dataset.type     = 'brush-fill';
        item.dataset.rotation = '0';
        item.style.cssText = `
            position:absolute; left:${minX}px; top:${minY}px;
            width:${bW}px; height:${bH}px;
            cursor:move; user-select:none; pointer-events:auto;
            z-index:${Math.min(itemIdCounter, 100)};
            background-image:url(${maskedUrl});
            background-size:100% 100%; background-repeat:no-repeat;
        `;
        dc.appendChild(item);

        const priceVal = ((await getItemPrices())[product.name]) || parseFloat(product.price) || 0;
        placedItems.push({ id: item.dataset.id, element: item, name: product.name, category: product.category, type: 'brush-fill', price: priceVal });
        makeDraggable(item);
        updateMaterialsList();
        selectItem(item);
        console.log('[AI Fill] Done — AI fill placed on canvas.');

    } catch (err) {
        loader.remove();
        console.error('[AI Fill] Fetch error:', err);
        alert('AI fill failed: ' + err.message);
    }
}

function _showAiUndoBtn(bgImg, origSrc) {
    document.getElementById('aiFillUndoBtn')?.remove();
    const dc = document.getElementById('designCanvas');
    if (!dc) return;
    const btn = document.createElement('button');
    btn.id = 'aiFillUndoBtn';
    btn.textContent = '↩ Undo AI fill';
    btn.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:9700;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:6px 16px;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.12);';
    btn.onclick = () => { bgImg.src = origSrc; btn.remove(); };
    dc.appendChild(btn);
}

console.log('✅ Design page ready');
