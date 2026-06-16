// Paste this entire script into the browser console while logged in as admin.
// Tags every product in the catalog with its best-planting-season(s) (US/Colorado
// calendar): spring, summer, fall, winter. Empty array = year-round / not seasonal
// (evergreens, hardscapes, rocks, paths). Safe to re-run — it's idempotent.

(async () => {
  const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
  const token = session.token;
  if (!token) { console.error('❌ Not logged in. Open the site, log in as admin, then run this script.'); return; }

  const API = 'https://gardiy-backend-production.up.railway.app/api/products';
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // Default best-planting season(s) per category.
  const CATEGORY_DEFAULT = {
    flowers:      ['spring', 'fall'],
    grass:        ['spring', 'fall'],
    groundcovers: ['spring', 'fall'],
    ornamental:   ['spring', 'fall'],
    shrubs:       ['spring', 'fall'],
    trees:        ['spring', 'fall'],
    hardscapes:   [],
    paths:        [],
    rocks_pavers: [],
  };

  // Evergreens (and evergreen-ish groundcovers) establish fine almost any time of
  // year and don't follow the deciduous spring/fall window — treat as year-round.
  const YEAR_ROUND_OVERRIDE = new Set([
    // evergreen shrubs
    'Boxwood, Green Mountain',
    'Boxwood, Green Velvet',
    'Juliana Jane Boxwood',
    'Juniper, Blue Star',
    'Juniper, Calgary Carpet',
    'Juniper, Old Gold',
    'Juniper, Sea Green',
    'Yew, Dense Spreading',
    'Holly, Prince/Princess',
    'Mahonia, Creeping',
    'Euonymus, Manhattan',
    'Manzanita, Panchito',
    // evergreen/conifer trees
    'Austrian Pine',
    'Colorado Spruce',
    'Columnar Norway Spruce',
    'Compact Gem Bosnian Pine',
    'Fastigiata Spruce',
    'Fat Albert Spruce',
    'Juniper, Blue Arrow',
    'Juniper, Skyrocket',
    'Limber Pine',
    'Picea Pungens, Baby Blue',
    'Pinyon Pine',
    'Tannenbaum Mugo Pine',
    'Thuja, Emerald Green',
    'Thuja, Green Giant',
    "Well's Deer Run Oriental Spruce",
    'Woodward Columnar Juniper',
    'scotch puddle pine',
    // evergreen groundcovers
    'Euonymus, Purple Winter Creeper',
    'Vinca, Bowles',
  ]);

  console.log('📡 Fetching existing products...');
  const resp = await fetch(API).then(r => r.json()).catch(() => []);
  const existing = Array.isArray(resp) ? resp : (resp.products || []);
  console.log(`📋 ${existing.length} products found in database`);

  let updated = 0, skipped = 0, failed = [];

  for (const p of existing) {
    const cat = (p.category || '').toLowerCase();
    const seasons = YEAR_ROUND_OVERRIDE.has(p.name) ? [] : (CATEGORY_DEFAULT[cat] ?? []);

    const id = p.id || p._id;
    if (!id) { skipped++; continue; }

    const r = await fetch(`${API}/${id}`, {
      method: 'PUT', headers, body: JSON.stringify({ seasons }),
    });
    const d = await r.json().catch(() => ({}));
    await new Promise(res => setTimeout(res, 400));

    if (r.ok) {
      updated++;
      console.log(`✅ ${p.name.padEnd(40)} → [${seasons.join(', ') || 'year-round'}]`);
    } else {
      failed.push(p.name);
      console.warn(`⚠️  FAILED: ${p.name} — ${d.message || r.status}`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📦  Updated : ${updated}`);
  console.log(`⏭️  Skipped : ${skipped} (no id)`);
  console.log(`❌  Failed  : ${failed.length}${failed.length ? ' — ' + failed.join(', ') : ''}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
})();
