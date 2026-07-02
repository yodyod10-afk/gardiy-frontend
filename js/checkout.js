// Checkout Page — Stripe Payment Element integration
console.log('🛒 Checkout page loaded');

const STRIPE_PK = 'pk_test_51TZMBP2Sfh1vcsbbA39uNHoEAB83SeqyMyqdz0X8oaCxK5mIqNeJ7HrEoXJfu09733l95IJBO2rNqS8qYtY4fqOa00Jfpw9s0t';
const deliveryFeeAmount = 50;
const taxRate = 0.08;

let stripeInstance = null;
let stripeElements = null;
let _idPhotoBase64 = null; // base64 of uploaded ID photo

document.addEventListener('DOMContentLoaded', function () {
    checkUserLogin();
    loadOrderSummary();
    setupAddressAutocomplete();
    setupFulfillmentMethod();
    setupServiceSelection();
    setupDeliveryDate();
    setupPhoneFormatting();
    setupIdPhotoUpload();
    initStripePaymentElement(); // background — no await, page stays responsive
    setupPlaceOrder();
});

// ── Auth ──────────────────────────────────────────────────────────────────────
function checkUserLogin() {
    const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!user.loggedIn) {
        alert('⚠️ Please sign in to proceed with checkout.');
        window.location.href = 'login.html';
        return false;
    }
    if (user.name)  { const el = document.getElementById('fullName'); if (el) el.value = user.name; }
    if (user.email) { const el = document.getElementById('email');    if (el) el.value = user.email; }
    return true;
}

// ── Order summary ─────────────────────────────────────────────────────────────
function loadOrderSummary() {
    const checkoutRaw = localStorage.getItem('gardiyCheckout');
    const designRaw   = localStorage.getItem('gardiyDesign');
    const savedDesignStr = checkoutRaw || designRaw;

    if (!savedDesignStr) { showEmptySummary(); return; }

    let savedDesign, storedTotal;
    try {
        const d = JSON.parse(savedDesignStr);
        savedDesign = d.items && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
        storedTotal = typeof d.total === 'number' ? d.total : null;
    } catch (e) { showEmptySummary(); return; }

    const summaryContainer = document.getElementById('summaryItems');
    if (!savedDesign.length) { showEmptySummary(); return; }

    const itemCounts = {};
    let totalTons = 0;
    savedDesign.forEach(item => {
        const name = item.name;
        const price = parseFloat(item.price) || 0;
        if (!itemCounts[name]) itemCounts[name] = { count: 1, price, name, size: item.size || '' };
        else itemCounts[name].count++;
        totalTons += parseFloat(item.tons) || 0;
    });

    const bulkDelivery = totalTons > 0.5;

    let html = '';
    for (const [name, data] of Object.entries(itemCounts)) {
        const unitPrice = parseFloat(data.price) || 0;
        const itemTotal = unitPrice * data.count;
        html += `
            <div class="summary-item">
                <div>
                    <div class="summary-item-name">${name}</div>
                    ${data.size ? `<div style="font-size:0.8rem;color:#10b981;font-weight:600;">${data.size}</div>` : ''}
                    <div style="font-size:0.85rem;color:#6b7280;">Qty: ${data.count} × $${unitPrice.toFixed(2)}</div>
                </div>
                <span class="summary-item-price">$${itemTotal.toFixed(2)}</span>
            </div>`;
    }

    if (bulkDelivery) {
        html += `
            <div class="summary-item" style="border-top:1px dashed #d1d5db;margin-top:0.5rem;padding-top:0.75rem;">
                <div>
                    <div class="summary-item-name">Bulk Delivery Fee</div>
                    <div style="font-size:0.8rem;color:#6b7280;">${totalTons.toFixed(2)} tons of gravel/mulch</div>
                </div>
                <span class="summary-item-price">$250.00</span>
            </div>`;
        // Inject delivery fee into stored total
        if (storedTotal != null) storedTotal = parseFloat((storedTotal + 250).toFixed(2));
    }

    summaryContainer.innerHTML = html;
    updateTotals(storedTotal);
}

function showEmptySummary() {
    const el = document.getElementById('summaryItems');
    if (el) el.innerHTML = '<p class="empty-message" style="color:#9ca3af;text-align:center;padding:2rem;">No items in cart</p>';
    updateTotals();
}

function updateTotals(storedTotal) {
    const savedDesignStr = localStorage.getItem('gardiyCheckout') || localStorage.getItem('gardiyDesign');
    let savedDesign = [], fallbackTotal = storedTotal;
    if (savedDesignStr) {
        try {
            const d = JSON.parse(savedDesignStr);
            savedDesign = d.items && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
            if (fallbackTotal == null && typeof d.total === 'number') fallbackTotal = d.total;
        } catch (e) {}
    }

    const calcSubtotal = savedDesign.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
    const subtotal = (typeof fallbackTotal === 'number' && fallbackTotal > 0) ? fallbackTotal : calcSubtotal;
    const deliveryFee = isPickup() ? 0 : deliveryFeeAmount;
    const installationRequested = document.getElementById('installRadio')?.checked;
    const tax = (subtotal + deliveryFee) * taxRate;
    const total = subtotal + deliveryFee + tax;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('subtotal',   '$' + subtotal.toFixed(2));
    set('deliveryFee', isPickup() ? 'Free' : '$' + deliveryFee.toFixed(2));
    set('tax',        '$' + tax.toFixed(2));
    set('grandTotal', '$' + total.toFixed(2));

    const installationRow = document.getElementById('installationRow');
    if (installationRow) {
        if (installationRequested) {
            installationRow.style.display = 'flex';
            const fee = document.getElementById('installationFee');
            if (fee) { fee.textContent = 'Quote Required'; fee.style.fontStyle = 'italic'; fee.style.color = '#667eea'; }
        } else {
            installationRow.style.display = 'none';
        }
    }
}

// Returns the order total in cents for Stripe
function getOrderTotalCents() {
    const savedDesignStr = localStorage.getItem('gardiyCheckout') || localStorage.getItem('gardiyDesign');
    if (!savedDesignStr) return 0;
    try {
        const d = JSON.parse(savedDesignStr);
        const items = d.items && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
        const calcSubtotal = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
        const subtotal = (typeof d.total === 'number' && d.total > 0) ? d.total : calcSubtotal;
        const fee = isPickup() ? 0 : deliveryFeeAmount;
        const tax = (subtotal + fee) * taxRate;
        return Math.round((subtotal + fee + tax) * 100);
    } catch (e) { return 0; }
}

// ── Stripe Payment Element ────────────────────────────────────────────────────
async function initStripePaymentElement() {
    const amountCents = getOrderTotalCents();
    const paymentDiv  = document.getElementById('payment-element');
    const errDiv      = document.getElementById('payment-errors');

    if (amountCents <= 0) {
        if (paymentDiv) paymentDiv.innerHTML = '<p style="color:#9ca3af;font-style:italic;">Add items to your cart first.</p>';
        return;
    }

    try {
        stripeInstance = Stripe(STRIPE_PK);

        // Send the itemized cart + fulfillment method. The backend recomputes the
        // charge from authoritative catalog prices — it does not trust any amount
        // sent from the client.
        const savedDesignStr = localStorage.getItem('gardiyCheckout') || localStorage.getItem('gardiyDesign');
        let items = [];
        try {
            const d = JSON.parse(savedDesignStr);
            items = d.items && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
        } catch (e) { items = []; }

        // Ask backend to create a PaymentIntent and return the client secret
        const res = await fetch('https://gardiy-backend-production.up.railway.app/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({
                items,
                fulfillment: isPickup() ? 'pickup' : 'delivery',
                currency: 'usd',
            }),
        });

        if (!res.ok) throw new Error('Backend error: ' + res.status);
        const data = await res.json();
        if (!data.clientSecret) throw new Error('No client secret returned');

        stripeElements = stripeInstance.elements({
            clientSecret: data.clientSecret,
            appearance: {
                theme: 'stripe',
                variables: { colorPrimary: '#10b981', borderRadius: '8px' },
            },
        });

        if (paymentDiv) paymentDiv.innerHTML = ''; // clear placeholder before Stripe mounts
        const paymentElement = stripeElements.create('payment');
        paymentElement.mount('#payment-element');

    } catch (err) {
        console.error('Stripe init error:', err);
        if (errDiv) errDiv.textContent = 'Payment system unavailable. Please refresh or contact support.';
        if (paymentDiv) paymentDiv.innerHTML = '';
    }
}



// ── Address autocomplete (OpenStreetMap Nominatim — no API key required) ──────
function setupAddressAutocomplete() {
    const addressInput = document.getElementById('addressSearch');
    if (!addressInput) return;

    let suggestionBox = null;
    let debounceTimer = null;

    function removeSuggestions() {
        if (suggestionBox) { suggestionBox.remove(); suggestionBox = null; }
    }

    function showLoading() {
        removeSuggestions();
        suggestionBox = document.createElement('div');
        suggestionBox.className = 'address-suggestions-box';
        suggestionBox.style.cssText = BOX_STYLE;
        addressInput.parentElement.style.position = 'relative';
        addressInput.parentElement.appendChild(suggestionBox);
        suggestionBox.innerHTML = '<div style="padding:1rem;color:#6b7280;font-size:.9rem;">Searching…</div>';
    }

    async function fetchSuggestions(query) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?` +
                `q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=6&countrycodes=us`;
            const res  = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GarDIY/1.0' } });
            const data = await res.json();
            return data;
        } catch (e) { return []; }
    }

    function renderSuggestions(results) {
        removeSuggestions();
        if (!results.length) return;

        suggestionBox = document.createElement('div');
        suggestionBox.className = 'address-suggestions-box';
        suggestionBox.style.cssText = BOX_STYLE;
        addressInput.parentElement.style.position = 'relative';
        addressInput.parentElement.appendChild(suggestionBox);

        suggestionBox.innerHTML = results.map((r, i) => {
            const a    = r.address || {};
            const num  = a.house_number || '';
            const road = a.road || a.pedestrian || a.footway || '';
            const street = (num + ' ' + road).trim() || r.display_name.split(',')[0];
            const city  = a.city || a.town || a.village || a.hamlet || a.county || '';
            const state = a.state || '';
            const zip   = a.postcode || '';
            const stateAbbr = STATE_ABBR[state] || state.slice(0, 2).toUpperCase();
            return `<div class="addr-suggestion-row" data-idx="${i}"
                style="padding:.85rem 1rem;cursor:pointer;border-bottom:1px solid #f3f4f6;transition:background .15s;">
                <div style="font-weight:600;color:#1a202c;font-size:.9rem;">${street}</div>
                <div style="color:#6b7280;font-size:.8rem;margin-top:2px;">${city}${city && stateAbbr ? ', ' : ''}${stateAbbr}${zip ? ' ' + zip : ''}</div>
            </div>`;
        }).join('');

        suggestionBox.querySelectorAll('.addr-suggestion-row').forEach(row => {
            row.addEventListener('mouseover', () => row.style.background = '#f0fdf4');
            row.addEventListener('mouseout',  () => row.style.background = '');
            row.addEventListener('mousedown', e => {
                e.preventDefault();
                const r = results[parseInt(row.dataset.idx)];
                const a = r.address || {};
                const num    = a.house_number || '';
                const road   = a.road || a.pedestrian || a.footway || '';
                const street = (num + ' ' + road).trim() || r.display_name.split(',')[0];
                const city   = a.city || a.town || a.village || a.hamlet || a.county || '';
                const state  = a.state || '';
                const zip    = a.postcode || '';
                const stateAbbr = STATE_ABBR[state] || state;
                document.getElementById('addressSearch').value = street;
                document.getElementById('city').value   = city;
                document.getElementById('state').value  = stateAbbr;
                document.getElementById('zip').value    = zip;
                removeSuggestions();
            });
        });
    }

    addressInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const val = addressInput.value.trim();
        if (val.length < 4) { removeSuggestions(); return; }
        showLoading();
        debounceTimer = setTimeout(async () => {
            const results = await fetchSuggestions(val);
            renderSuggestions(results);
        }, 350);
    });

    addressInput.addEventListener('blur', () => setTimeout(removeSuggestions, 150));
    document.addEventListener('click', e => { if (!e.target.closest('#addressSearch')) removeSuggestions(); });
}

const BOX_STYLE = 'position:absolute;background:white;border:2px solid #10b981;border-radius:10px;margin-top:4px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:1000;width:100%;max-height:280px;overflow-y:auto;top:100%;left:0;';

const STATE_ABBR = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
    'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
    'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
    'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
    'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'District of Columbia':'DC',
};

// ── Fulfillment method (Delivery vs Self Pickup) ──────────────────────────────
function isPickup() {
    return document.getElementById('pickupMethodRadio')?.checked || false;
}

function applyFulfillmentUI() {
    const pickup = isPickup();
    const addressCard  = document.getElementById('addressCard');
    const dateTitle    = document.getElementById('dateCardTitle');
    const dateLabel    = document.getElementById('dateLabel');
    const dateHint     = document.getElementById('dateHint');
    const feeLabel     = document.getElementById('deliveryFeeLabel');

    if (addressCard) addressCard.style.display = pickup ? 'none' : '';

    // Make address fields required only when delivery is selected
    addressCard?.querySelectorAll('[required]').forEach(el => {
        el.required = !pickup;
    });

    if (dateTitle) dateTitle.textContent  = pickup ? '📅 Pickup Date'              : '📅 Delivery Date';
    if (dateLabel) dateLabel.textContent  = pickup ? 'Preferred Pickup Date *'     : 'Preferred Delivery Date *';
    if (dateHint)  dateHint.textContent   = pickup ? 'Select your preferred pickup date (3-5 business days from today)' : 'Select your preferred date (3-5 business days from today)';
    if (feeLabel)  feeLabel.textContent   = pickup ? 'Delivery Fee'                : 'Delivery Fee';

    updateTotals();
}

function setupFulfillmentMethod() {
    const deliveryCard = document.getElementById('deliveryMethodCard');
    const pickupCard   = document.getElementById('pickupMethodCard');
    const deliveryRadio = document.getElementById('deliveryMethodRadio');
    const pickupRadio   = document.getElementById('pickupMethodRadio');
    if (!deliveryCard || !pickupCard) return;

    deliveryCard.addEventListener('click', () => {
        deliveryRadio.checked = true;
        deliveryCard.classList.add('selected');
        pickupCard.classList.remove('selected');
        applyFulfillmentUI();
    });
    pickupCard.addEventListener('click', () => {
        pickupRadio.checked = true;
        pickupCard.classList.add('selected');
        deliveryCard.classList.remove('selected');
        applyFulfillmentUI();
    });

    applyFulfillmentUI(); // apply initial state
}

// ── Service selection ─────────────────────────────────────────────────────────
function isInstall() {
    return document.getElementById('installRadio')?.checked || false;
}

function applyServiceUI() {
    const install         = isInstall();
    const paymentSection  = document.getElementById('paymentSection');
    const installQuoteCard= document.getElementById('installQuoteCard');
    const dateCard        = document.getElementById('dateCard');
    const deliveryDate    = document.getElementById('deliveryDate');
    const orderLabel      = document.getElementById('placeOrderLabel');
    const idSection       = document.getElementById('idVerificationSection');

    if (paymentSection)   paymentSection.style.display    = install ? 'none' : '';
    if (installQuoteCard) installQuoteCard.style.display   = install ? '' : 'none';
    if (dateCard)         dateCard.style.display           = install ? 'none' : '';
    if (deliveryDate)     deliveryDate.required            = !install;
    if (orderLabel)       orderLabel.textContent           = install ? 'Request Installation Quote' : 'Complete Order';
    if (idSection)        idSection.style.display          = install ? 'none' : '';
    updateTotals();
}

function setupServiceSelection() {
    const diyCard      = document.getElementById('diyCard');
    const installCard  = document.getElementById('installCard');
    const diyRadio     = document.getElementById('diyRadio');
    const installRadio = document.getElementById('installRadio');
    if (!diyCard || !installCard) return;
    diyCard.addEventListener('click', () => {
        diyRadio.checked = true;
        diyCard.classList.add('selected');
        installCard.classList.remove('selected');
        applyServiceUI();
    });
    installCard.addEventListener('click', () => {
        installRadio.checked = true;
        installCard.classList.add('selected');
        diyCard.classList.remove('selected');
        applyServiceUI();
    });
    applyServiceUI();
}

// ── Delivery date ─────────────────────────────────────────────────────────────
function setupDeliveryDate() {
    const dateInput = document.getElementById('deliveryDate');
    if (!dateInput) return;
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    dateInput.min = minDate.toISOString().split('T')[0];
}

// ── Phone formatting ──────────────────────────────────────────────────────────
function setupPhoneFormatting() {
    const phone = document.getElementById('phone');
    if (!phone) return;
    phone.addEventListener('input', e => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length >= 10) v = '(' + v.slice(0,3) + ') ' + v.slice(3,6) + '-' + v.slice(6,10);
        e.target.value = v;
    });
}

// ── ID photo upload ───────────────────────────────────────────────────────────
function setupIdPhotoUpload() {
    const input   = document.getElementById('idPhotoInput');
    const preview = document.getElementById('idPhotoPreview');
    const previewImg = document.getElementById('idPreviewImg');
    const label   = document.getElementById('idUploadLabel');
    const btn     = document.getElementById('idUploadBtn');
    if (!input) return;

    // Clicking the styled button opens the file picker
    if (btn) {
        btn.addEventListener('click', () => input.click());
    }

    input.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        // Show filename and green border on the button
        if (label) label.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
        if (btn) btn.style.borderColor = '#16a34a';

        // Convert to base64 for backend storage
        const reader = new FileReader();
        reader.onload = function (ev) {
            _idPhotoBase64 = ev.target.result; // data:image/...;base64,...
            if (previewImg) previewImg.src = _idPhotoBase64;
            if (preview)    preview.style.display = 'block';
            // Hide error if it was showing
            const err = document.getElementById('idError');
            if (err) err.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

// ── Place order ───────────────────────────────────────────────────────────────
function setupPlaceOrder() {
    const btn = document.getElementById('placeOrderBtn');
    if (!btn) return;

    btn.addEventListener('click', async function (e) {
        e.preventDefault();

        const addressForm = document.getElementById('addressForm');
        if (!isPickup() && !addressForm.checkValidity()) { addressForm.reportValidity(); return; }

        const deliveryDate = document.getElementById('deliveryDate').value;
        if (!isInstall() && !deliveryDate) {
            alert('⚠️ Please select a delivery date');
            document.getElementById('deliveryDate').scrollIntoView({ behavior: 'smooth' });
            return;
        }

        // Validate terms checkbox
        const termsChecked = document.getElementById('termsCheckbox')?.checked;
        const termsErr     = document.getElementById('termsError');
        if (!termsChecked) {
            if (termsErr) { termsErr.style.display = 'block'; termsErr.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            return;
        }
        if (termsErr) termsErr.style.display = 'none';

        // Validate ID photo (not required for installation quotes)
        const idErr = document.getElementById('idError');
        if (!isInstall() && !_idPhotoBase64) {
            if (idErr) { idErr.style.display = 'block'; idErr.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            return;
        }
        if (idErr) idErr.style.display = 'none';

        if (window.GarDIYSubscriptions) {
            const check = GarDIYSubscriptions.checkOrderLimit();
            if (!check.allowed) {
                GarDIYSubscriptions.showUpgradeModal(
                    `You've used all ${check.limit} order${check.limit === 1 ? '' : 's'} this month on your <strong>${check.planLabel}</strong> plan. Upgrade to place more orders.`
                );
                return;
            }
        }

        // ── Installation quote path ───────────────────────────────────────────
        if (isInstall()) {
            btn.innerHTML = '<span>Sending request…</span> ⏳';
            btn.disabled = true;
            try {
                await sendInstallQuoteRequest();
                showQuoteConfirmation();
            } catch (err) {
                alert('Failed to send quote request: ' + err.message);
                btn.innerHTML = '<span>Request Installation Quote</span><span class="btn-arrow">→</span>';
                btn.disabled = false;
            }
            return;
        }

        // ── DIY payment path ──────────────────────────────────────────────────
        if (!stripeInstance || !stripeElements) {
            const errDiv = document.getElementById('payment-errors');
            errDiv.textContent = 'Loading payment form… please wait a moment and try again.';
            if (!stripeInstance) initStripePaymentElement();
            document.getElementById('paymentSection')?.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        btn.innerHTML = '<span>Processing…</span> ⏳';
        btn.disabled = true;
        document.getElementById('payment-errors').textContent = '';

        const { error, paymentIntent } = await stripeInstance.confirmPayment({
            elements: stripeElements,
            confirmParams: {
                return_url:    window.location.origin + '/checkout.html',
                receipt_email: document.getElementById('email').value,
            },
            redirect: 'if_required',
        });

        if (error) {
            document.getElementById('payment-errors').textContent = error.message;
            btn.innerHTML = '<span>Complete Order</span><span class="btn-arrow">→</span>';
            btn.disabled = false;
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            if (window.GarDIYSubscriptions) GarDIYSubscriptions.incrementOrders();
            await saveOrderToBackend(paymentIntent.id);
            showOrderConfirmation(paymentIntent.id);
        }
    });
}

// ── Save order with dispute-protection data ───────────────────────────────────
async function saveOrderToBackend(paymentIntentId) {
    try {
        const savedDesignStr = localStorage.getItem('gardiyCheckout') || localStorage.getItem('gardiyDesign');
        let items = [], total = 0;
        if (savedDesignStr) {
            const d = JSON.parse(savedDesignStr);
            items = d.items && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
            total = typeof d.total === 'number' && d.total > 0
                ? d.total
                : items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
        }

        const designScreenshot = localStorage.getItem('gardiyDesignScreenshot') || null;

        const pickup = isPickup();
        const fee = pickup ? 0 : deliveryFeeAmount;
        const body = {
            paymentIntentId,
            agreedToTerms: true,
            idPhotoUrl: _idPhotoBase64,
            designScreenshot,
            items,
            total,
            fulfillmentMethod: pickup ? 'pickup' : 'delivery',
            deliveryFee: fee,
            tax: parseFloat(((total + fee) * taxRate).toFixed(2)),
            grandTotal: parseFloat(((total + fee) * (1 + taxRate)).toFixed(2)),
            customerName:  document.getElementById('fullName')?.value || '',
            email:         document.getElementById('email')?.value    || '',
            phone:         document.getElementById('phone')?.value    || '',
            address:       pickup ? '' : (document.getElementById('addressSearch')?.value || ''),
            city:          pickup ? '' : (document.getElementById('city')?.value     || ''),
            state:         pickup ? '' : (document.getElementById('state')?.value    || ''),
            zip:           pickup ? '' : (document.getElementById('zip')?.value      || ''),
            deliveryDate:  document.getElementById('deliveryDate')?.value || '',
            serviceType:   document.getElementById('installRadio')?.checked ? 'install' : 'diy',
            notes:         document.getElementById('notes')?.value    || '',
        };

        const res = await fetch('https://gardiy-backend-production.up.railway.app/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(body),
        });
        if (!res.ok) console.warn('Order save returned', res.status);
    } catch (err) {
        console.error('saveOrderToBackend error:', err);
        // Non-fatal — payment already succeeded, just log the failure
    }
}

// ── Installation quote request ────────────────────────────────────────────────
async function sendInstallQuoteRequest() {
    const savedDesignStr = localStorage.getItem('gardiyCheckout') || localStorage.getItem('gardiyDesign');
    let items = [], subtotal = 0;
    if (savedDesignStr) {
        try {
            const d = JSON.parse(savedDesignStr);
            items = d.items && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
            subtotal = typeof d.total === 'number' && d.total > 0
                ? d.total
                : items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
        } catch (e) {}
    }

    // Aggregate items into quantities for a clean email
    const aggregated = {};
    items.forEach(i => {
        const key = i.name;
        if (!aggregated[key]) aggregated[key] = { name: i.name, unitPrice: parseFloat(i.price) || 0, qty: 0, total: 0, size: i.size || '' };
        aggregated[key].qty++;
        aggregated[key].total = parseFloat((aggregated[key].total + (parseFloat(i.price) || 0)).toFixed(2));
    });
    const aggregatedItems = Object.values(aggregated);

    const body = {
        customerName:    document.getElementById('fullName')?.value   || '',
        email:           document.getElementById('email')?.value      || '',
        phone:           document.getElementById('phone')?.value      || '',
        address:         document.getElementById('addressSearch')?.value || '',
        city:            document.getElementById('city')?.value       || '',
        state:           document.getElementById('state')?.value      || '',
        zip:             document.getElementById('zip')?.value        || '',
        preferredDate:   document.getElementById('deliveryDate')?.value || '',
        installNotes:    document.getElementById('installNotes')?.value || '',
        deliveryNotes:   document.getElementById('notes')?.value      || '',
        items: aggregatedItems,
        subtotal,
        designScreenshot: localStorage.getItem('gardiyDesignScreenshot') || null,
    };

    const res = await fetch('https://gardiy-backend-production.up.railway.app/api/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to send quote request');
}

function showQuoteConfirmation() {
    const email = document.getElementById('email')?.value || '';
    const modal = document.getElementById('successModal');
    document.getElementById('confirmEmail').textContent  = email;
    document.getElementById('orderNumber').textContent   = 'Pending quote';
    document.getElementById('confirmDate').textContent   = 'We\'ll confirm once you approve the quote';
    document.getElementById('confirmTotal').textContent  = 'Quote will be provided';
    // Swap the title and message
    const h2  = modal?.querySelector('h2');
    const p   = modal?.querySelector('p');
    if (h2) h2.textContent = 'Quote Request Sent!';
    if (p)  p.innerHTML    = `Thanks! We\'ve received your installation request and will email <strong>${email}</strong> within 24 hours with a custom quote.`;
    if (modal) modal.style.display = 'flex';
}

// ── Success modal ─────────────────────────────────────────────────────────────
function showOrderConfirmation(paymentId) {
    const orderNumber  = 'GARDIY-' + (paymentId ? paymentId.slice(-8).toUpperCase() : Date.now().toString().slice(-8));
    const email        = document.getElementById('email').value;
    const deliveryDate = document.getElementById('deliveryDate').value;
    const total        = document.getElementById('grandTotal').textContent;

    const formattedDate = new Date(deliveryDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    document.getElementById('confirmEmail').textContent = email;
    document.getElementById('orderNumber').textContent  = orderNumber;
    document.getElementById('confirmDate').textContent  = formattedDate;
    document.getElementById('confirmTotal').textContent = total;
    document.getElementById('successModal').style.display = 'flex';

    localStorage.removeItem('gardiyCheckout');
    localStorage.removeItem('gardiyDesign');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('successModal');
        if (modal?.style.display === 'flex') { modal.style.display = 'none'; window.location.href = 'index.html'; }
    }
});

console.log('✅ Checkout script loaded');
