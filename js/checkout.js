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
    savedDesign.forEach(item => {
        const name = item.name;
        const price = parseFloat(item.price) || 0;
        if (!itemCounts[name]) itemCounts[name] = { count: 1, price, name, size: item.size || '' };
        else itemCounts[name].count++;
    });

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
    const deliveryFee = deliveryFeeAmount;
    const installationRequested = document.getElementById('installRadio')?.checked;
    const tax = (subtotal + deliveryFee) * taxRate;
    const total = subtotal + deliveryFee + tax;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('subtotal',   '$' + subtotal.toFixed(2));
    set('deliveryFee','$' + deliveryFee.toFixed(2));
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
        const tax = (subtotal + deliveryFeeAmount) * taxRate;
        return Math.round((subtotal + deliveryFeeAmount + tax) * 100);
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

        // Ask backend to create a PaymentIntent and return the client secret
        const res = await fetch('https://gardiy-backend-production.up.railway.app/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ amount: amountCents, currency: 'usd' }),
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

        const paymentElement = stripeElements.create('payment');
        paymentElement.mount('#payment-element');

    } catch (err) {
        console.error('Stripe init error:', err);
        if (errDiv) errDiv.textContent = 'Payment system unavailable. Please refresh or contact support.';
        if (paymentDiv) paymentDiv.innerHTML = '';
    }
}



// ── Address autocomplete ──────────────────────────────────────────────────────
function setupAddressAutocomplete() {
    const addressInput = document.getElementById('addressSearch');
    if (!addressInput) return;

    const sampleAddresses = [
        { street: '123 Main Street',        city: 'Springfield',  state: 'CA', zip: '94102' },
        { street: '456 Maple Avenue',        city: 'Portland',     state: 'OR', zip: '97201' },
        { street: '789 Oak Boulevard',       city: 'Seattle',      state: 'WA', zip: '98101' },
        { street: '321 Pine Drive',          city: 'Denver',       state: 'CO', zip: '80202' },
        { street: '654 Elm Lane',            city: 'Austin',       state: 'TX', zip: '78701' },
        { street: '111 Garden Street',       city: 'Boston',       state: 'MA', zip: '02101' },
        { street: '222 Park Avenue',         city: 'New York',     state: 'NY', zip: '10001' },
        { street: '333 Beach Road',          city: 'Miami',        state: 'FL', zip: '33101' },
        { street: '444 Hill Street',         city: 'San Francisco',state: 'CA', zip: '94103' },
        { street: '555 Lake Drive',          city: 'Chicago',      state: 'IL', zip: '60601' },
        { street: '7403 Newton Street West', city: 'Westminster',  state: 'CO', zip: '80030' },
    ];

    let suggestionBox = null;

    function showSuggestions() {
        if (suggestionBox) { suggestionBox.remove(); suggestionBox = null; }
        const value = addressInput.value.trim();
        if (!value.length) return;

        suggestionBox = document.createElement('div');
        suggestionBox.className = 'address-suggestions-box';
        suggestionBox.style.cssText = 'position:absolute;background:white;border:2px solid #10b981;border-radius:10px;margin-top:5px;box-shadow:0 4px 15px rgba(0,0,0,.2);z-index:1000;width:100%;max-height:300px;overflow-y:auto;top:100%;left:0;';
        addressInput.parentElement.style.position = 'relative';
        addressInput.parentElement.appendChild(suggestionBox);

        const lv = value.toLowerCase();
        let matches = sampleAddresses.filter(a => `${a.street} ${a.city} ${a.state} ${a.zip}`.toLowerCase().includes(lv));
        if (!matches.length) matches = sampleAddresses.slice(0, 5);

        suggestionBox.innerHTML = matches.map(addr => `
            <div style="padding:1rem;cursor:pointer;border-bottom:1px solid #e5e7eb;transition:background .2s;"
                 onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='white'"
                 onclick="selectAddress('${addr.street}','${addr.city}','${addr.state}','${addr.zip}')">
                <strong style="color:#065f46;">${addr.street}</strong><br>
                <span style="color:#6b7280;font-size:.9rem;">${addr.city}, ${addr.state} ${addr.zip}</span>
            </div>`).join('');
    }

    addressInput.addEventListener('input', showSuggestions);
    addressInput.addEventListener('focus', showSuggestions);
    document.addEventListener('click', e => {
        if (!e.target.closest('.form-group') && suggestionBox) { suggestionBox.remove(); suggestionBox = null; }
    });
}

window.selectAddress = function (street, city, state, zip) {
    document.getElementById('addressSearch').value = street;
    document.getElementById('city').value  = city;
    document.getElementById('state').value = state;
    document.getElementById('zip').value   = zip;
    document.querySelector('.address-suggestions-box')?.remove();
};

// ── Service selection ─────────────────────────────────────────────────────────
function setupServiceSelection() {
    const diyCard     = document.getElementById('diyCard');
    const installCard = document.getElementById('installCard');
    const diyRadio    = document.getElementById('diyRadio');
    const installRadio= document.getElementById('installRadio');
    if (!diyCard || !installCard) return;
    diyCard.addEventListener('click', () => { diyRadio.checked = true; diyCard.classList.add('selected'); installCard.classList.remove('selected'); updateTotals(); });
    installCard.addEventListener('click', () => { installRadio.checked = true; installCard.classList.add('selected'); diyCard.classList.remove('selected'); updateTotals(); });
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
        if (!addressForm.checkValidity()) { addressForm.reportValidity(); return; }

        const deliveryDate = document.getElementById('deliveryDate').value;
        if (!deliveryDate) {
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

        // Validate ID photo
        const idErr = document.getElementById('idError');
        if (!_idPhotoBase64) {
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

        const body = {
            paymentIntentId,
            agreedToTerms: true,
            idPhotoUrl: _idPhotoBase64,
            designScreenshot,
            items,
            total,
            deliveryFee: deliveryFeeAmount,
            tax: parseFloat(((total + deliveryFeeAmount) * taxRate).toFixed(2)),
            grandTotal: parseFloat(((total + deliveryFeeAmount) * (1 + taxRate)).toFixed(2)),
            customerName:  document.getElementById('fullName')?.value || '',
            email:         document.getElementById('email')?.value    || '',
            phone:         document.getElementById('phone')?.value    || '',
            address:       document.getElementById('addressSearch')?.value || '',
            city:          document.getElementById('city')?.value     || '',
            state:         document.getElementById('state')?.value    || '',
            zip:           document.getElementById('zip')?.value      || '',
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
