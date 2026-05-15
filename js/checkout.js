// Checkout Page JavaScript - COMPLETELY FIXED VERSION
console.log('🛒 Checkout page loaded - COMPLETELY FIXED VERSION');

const deliveryFeeAmount = 50;
const taxRate = 0.08;

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Checkout DOM loaded');
    
    // Check if user is logged in
    checkUserLogin();
    
    // Load saved design
    loadOrderSummary();
    
    // Setup address autocomplete (simulated)
    setupAddressAutocomplete();
    
    // Setup service selection
    setupServiceSelection();
    
    // Setup delivery date
    setupDeliveryDate();
    
    // Setup card formatting
    setupCardFormatting();
    
    // Setup place order button
    setupPlaceOrder();
    
    console.log('✅ All checkout functions initialized');
});

// FIXED: Check if user is logged in
function checkUserLogin() {
    const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    console.log('👤 User status:', user);
    
    if (!user.loggedIn) {
        console.warn('⚠️ User not logged in on checkout page!');
        // Redirect back to design page
        alert('⚠️ Please sign in to proceed with checkout.');
        window.location.href = 'login.html';
        return false;
    }
    
    // Pre-fill user information if available
    if (user.name) {
        const nameInput = document.getElementById('fullName');
        if (nameInput) nameInput.value = user.name;
    }
    if (user.email) {
        const emailInput = document.getElementById('email');
        if (emailInput) emailInput.value = user.email;
    }
    
    return true;
}

// FIXED: Load order summary from saved design in localStorage
function loadOrderSummary() {
    console.log('📦 Loading order summary...');
    
    // FIXED: Get design from localStorage correctly
    const savedDesignStr = localStorage.getItem('gardiyDesign');
    console.log('💾 Raw design data:', savedDesignStr ? 'Found' : 'Not found');
    
    if (!savedDesignStr) {
        console.error('❌ No design found in localStorage');
        showEmptySummary();
        return;
    }
    
    let savedDesign;
    try {
        const designData = JSON.parse(savedDesignStr);
        console.log('📋 Parsed design data structure:', Object.keys(designData));
        
        // Design is stored as { items: [...] } or just [...]
        if (designData.items && Array.isArray(designData.items)) {
            savedDesign = designData.items;
        } else if (Array.isArray(designData)) {
            savedDesign = designData;
        } else {
            console.error('❌ Unexpected design data format');
            savedDesign = [];
        }
        
        console.log('📦 Design items:', savedDesign.length, 'items found');
    } catch (e) {
        console.error('❌ Error parsing design:', e);
        showEmptySummary();
        return;
    }
    
    const summaryContainer = document.getElementById('summaryItems');
    
    if (!savedDesign || savedDesign.length === 0) {
        console.warn('⚠️ No items in design');
        showEmptySummary();
        return;
    }
    
    console.log('✅ Found', savedDesign.length, 'items in cart');
    
    // Count items by name
    const itemCounts = {};
    savedDesign.forEach(item => {
        const name = item.name;
        if (!itemCounts[name]) {
            itemCounts[name] = {
                count: 0,
                price: item.price || 0,
                name: name
            };
        }
        itemCounts[name].count++;
    });
    
    console.log('📊 Item counts:', itemCounts);
    
    // Generate HTML
    let html = '';
    for (const [name, data] of Object.entries(itemCounts)) {
        const itemTotal = data.price * data.count;
        
        html += `
            <div class="summary-item">
                <div>
                    <div class="summary-item-name">${name}</div>
                    <div style="font-size: 0.85rem; color: #6b7280;">Qty: ${data.count} × $${data.price.toFixed(2)}</div>
                </div>
                <span class="summary-item-price">$${itemTotal.toFixed(2)}</span>
            </div>
        `;
    }
    
    summaryContainer.innerHTML = html;
    console.log('✅ Order summary HTML generated');
    
    updateTotals();
}

function showEmptySummary() {
    const summaryContainer = document.getElementById('summaryItems');
    if (summaryContainer) {
        summaryContainer.innerHTML = '<p class="empty-message" style="color: #9ca3af; text-align: center; padding: 2rem;">No items in cart</p>';
    }
    updateTotals();
}

// FIXED: Update totals correctly
function updateTotals() {
    console.log('💰 Updating totals...');
    
    // Get design items
    const savedDesignStr = localStorage.getItem('gardiyDesign');
    let savedDesign = [];
    
    if (savedDesignStr) {
        try {
            const designData = JSON.parse(savedDesignStr);
            // Handle both { items: [...] } and [...] formats
            if (designData.items && Array.isArray(designData.items)) {
                savedDesign = designData.items;
            } else if (Array.isArray(designData)) {
                savedDesign = designData;
            }
        } catch (e) {
            console.error('Error parsing design for totals:', e);
        }
    }
    
    // Calculate subtotal
    const subtotal = savedDesign.reduce((sum, item) => sum + (item.price || 0), 0);
    console.log('💵 Subtotal:', subtotal);
    
    const deliveryFee = deliveryFeeAmount;
    
    // CHANGED: Installation is now "Quote Required" - no fee calculated
    const installationRequested = document.getElementById('installRadio')?.checked;
    
    // Don't add installation fee to total - it requires a quote
    const tax = (subtotal + deliveryFee) * taxRate;
    const total = subtotal + deliveryFee + tax;
    
    console.log('📊 Totals:', { subtotal, deliveryFee, installationRequested, tax, total });
    
    // Update DOM
    const elements = {
        subtotal: document.getElementById('subtotal'),
        deliveryFee: document.getElementById('deliveryFee'),
        tax: document.getElementById('tax'),
        grandTotal: document.getElementById('grandTotal'),
        installationFee: document.getElementById('installationFee')
    };
    
    if (elements.subtotal) elements.subtotal.textContent = '$' + subtotal.toFixed(2);
    if (elements.deliveryFee) elements.deliveryFee.textContent = '$' + deliveryFee.toFixed(2);
    if (elements.tax) elements.tax.textContent = '$' + tax.toFixed(2);
    if (elements.grandTotal) elements.grandTotal.textContent = '$' + total.toFixed(2);
    
    // Show/hide installation row and set text to "Quote Required"
    const installationRow = document.getElementById('installationRow');
    if (installationRow) {
        if (installationRequested) {
            installationRow.style.display = 'flex';
            if (elements.installationFee) {
                elements.installationFee.textContent = 'Quote Required';
                elements.installationFee.style.fontStyle = 'italic';
                elements.installationFee.style.color = '#667eea';
            }
        } else {
            installationRow.style.display = 'none';
        }
    }
    
    console.log('✅ Totals updated in DOM');
}

// Simulated address autocomplete
function setupAddressAutocomplete() {
    const addressInput = document.getElementById('addressSearch');
    if (!addressInput) return;
    
    let suggestionBox = null;
    
    // Sample addresses for autocomplete
    const sampleAddresses = [
        { street: '123 Main Street', city: 'Springfield', state: 'CA', zip: '94102' },
        { street: '456 Maple Avenue', city: 'Portland', state: 'OR', zip: '97201' },
        { street: '789 Oak Boulevard', city: 'Seattle', state: 'WA', zip: '98101' },
        { street: '321 Pine Drive', city: 'Denver', state: 'CO', zip: '80202' },
        { street: '654 Elm Lane', city: 'Austin', state: 'TX', zip: '78701' },
        { street: '111 Garden Street', city: 'Boston', state: 'MA', zip: '02101' },
        { street: '222 Park Avenue', city: 'New York', state: 'NY', zip: '10001' },
        { street: '333 Beach Road', city: 'Miami', state: 'FL', zip: '33101' },
        { street: '444 Hill Street', city: 'San Francisco', state: 'CA', zip: '94103' },
        { street: '555 Lake Drive', city: 'Chicago', state: 'IL', zip: '60601' },
        { street: '7403 Newton Street West', city: 'Westminster', state: 'CO', zip: '80030' }
    ];
    
    function showSuggestions() {
        const value = addressInput.value.trim();
        
        // Remove old suggestion box
        if (suggestionBox) {
            suggestionBox.remove();
            suggestionBox = null;
        }
        
        // Don't show if empty
        if (value.length === 0) {
            return;
        }
        
        // Create suggestion box
        suggestionBox = document.createElement('div');
        suggestionBox.className = 'address-suggestions-box';
        suggestionBox.style.cssText = `
            position: absolute;
            background: white;
            border: 2px solid #10b981;
            border-radius: 10px;
            margin-top: 5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1000;
            width: 100%;
            max-height: 300px;
            overflow-y: auto;
            top: 100%;
            left: 0;
        `;
        addressInput.parentElement.style.position = 'relative';
        addressInput.parentElement.appendChild(suggestionBox);
        
        // Filter addresses - be very lenient
        const lowerValue = value.toLowerCase();
        let matches = sampleAddresses.filter(addr => {
            const fullAddress = `${addr.street} ${addr.city} ${addr.state} ${addr.zip}`.toLowerCase();
            return fullAddress.includes(lowerValue);
        });
        
        // If no matches, show all addresses as suggestions
        if (matches.length === 0) {
            matches = sampleAddresses.slice(0, 5); // Show first 5 as examples
            suggestionBox.innerHTML = `
                <div style="padding: 0.75rem; background: #fffbeb; border-bottom: 2px solid #fbbf24; color: #92400e;">
                    <strong>💡 Try one of these addresses:</strong>
                </div>
            ` + matches.map(addr => `
                <div class="address-suggestion" style="padding: 1rem; cursor: pointer; border-bottom: 1px solid #e5e7eb; transition: background 0.2s;"
                     onmouseover="this.style.background='#f0fdf4'"
                     onmouseout="this.style.background='white'"
                     onclick="selectAddress('${addr.street}', '${addr.city}', '${addr.state}', '${addr.zip}')">
                    <strong style="color: #065f46;">${addr.street}</strong><br>
                    <span style="color: #6b7280; font-size: 0.9rem;">${addr.city}, ${addr.state} ${addr.zip}</span>
                </div>
            `).join('');
            return;
        }
        
        // Show matching suggestions
        suggestionBox.innerHTML = matches.map(addr => `
            <div class="address-suggestion" style="padding: 1rem; cursor: pointer; border-bottom: 1px solid #e5e7eb; transition: background 0.2s;"
                 onmouseover="this.style.background='#f0fdf4'"
                 onmouseout="this.style.background='white'"
                 onclick="selectAddress('${addr.street}', '${addr.city}', '${addr.state}', '${addr.zip}')">
                <strong style="color: #065f46;">${addr.street}</strong><br>
                <span style="color: #6b7280; font-size: 0.9rem;">${addr.city}, ${addr.state} ${addr.zip}</span>
            </div>
        `).join('');
    }
    
    addressInput.addEventListener('input', showSuggestions);
    addressInput.addEventListener('focus', showSuggestions);
    
    // Close suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.form-group') && suggestionBox) {
            suggestionBox.remove();
            suggestionBox = null;
        }
    });
}

// Select address from autocomplete
window.selectAddress = function(street, city, state, zip) {
    document.getElementById('addressSearch').value = street;
    document.getElementById('city').value = city;
    document.getElementById('state').value = state;
    document.getElementById('zip').value = zip;
    
    // Remove suggestion box
    const suggestionBox = document.querySelector('.address-suggestions-box');
    if (suggestionBox) suggestionBox.remove();
};

// Service selection
function setupServiceSelection() {
    const diyCard = document.getElementById('diyCard');
    const installCard = document.getElementById('installCard');
    const diyRadio = document.getElementById('diyRadio');
    const installRadio = document.getElementById('installRadio');
    
    if (!diyCard || !installCard) return;
    
    diyCard.addEventListener('click', function() {
        diyRadio.checked = true;
        diyCard.classList.add('selected');
        installCard.classList.remove('selected');
        updateTotals();
    });
    
    installCard.addEventListener('click', function() {
        installRadio.checked = true;
        installCard.classList.add('selected');
        diyCard.classList.remove('selected');
        updateTotals();
    });
}

// Setup delivery date
function setupDeliveryDate() {
    const dateInput = document.getElementById('deliveryDate');
    if (!dateInput) return;
    
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 3);
    
    dateInput.min = minDate.toISOString().split('T')[0];
}

// Card formatting
function setupCardFormatting() {
    const cardNumber = document.getElementById('cardNumber');
    const expiry = document.getElementById('expiry');
    const cvv = document.getElementById('cvv');
    
    if (!cardNumber || !expiry || !cvv) return;
    
    // Format card number (1234 5678 9012 3456)
    cardNumber.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
        
        // Detect card type (simplified)
        const firstDigit = value[0];
        const cardIcon = document.querySelector('.card-icon');
        if (cardIcon) {
            if (firstDigit === '4') {
                cardIcon.textContent = '💳'; // Visa
            } else if (firstDigit === '5') {
                cardIcon.textContent = '💳'; // Mastercard
            } else if (firstDigit === '3') {
                cardIcon.textContent = '💳'; // Amex
            } else {
                cardIcon.textContent = '💳';
            }
        }
    });
    
    // Format expiry (MM/YY)
    expiry.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
    });
    
    // CVV - numbers only
    cvv.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
    
    // Phone formatting
    const phone = document.getElementById('phone');
    if (phone) {
        phone.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 10) {
                value = '(' + value.slice(0, 3) + ') ' + value.slice(3, 6) + '-' + value.slice(6, 10);
            }
            e.target.value = value;
        });
    }
}

// Place order
function setupPlaceOrder() {
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    
    if (!placeOrderBtn) {
        console.error('❌ Place order button not found!');
        return;
    }
    
    console.log('✅ Place order button connected');
    
    placeOrderBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('🚀 Place order button clicked');
        
        // Validate forms
        const addressForm = document.getElementById('addressForm');
        const paymentForm = document.getElementById('paymentForm');
        
        // Check address form
        if (!addressForm.checkValidity()) {
            addressForm.reportValidity();
            return;
        }
        
        // Check delivery date
        const deliveryDate = document.getElementById('deliveryDate').value;
        if (!deliveryDate) {
            alert('⚠️ Please select a delivery date');
            document.getElementById('deliveryDate').scrollIntoView({ behavior: 'smooth' });
            return;
        }
        
        // Check payment form
        if (!paymentForm.checkValidity()) {
            paymentForm.reportValidity();
            return;
        }
        
        // Validate card number (basic check)
        const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
        if (cardNumber.length < 15) {
            alert('⚠️ Please enter a valid card number');
            return;
        }
        
        // Validate expiry
        const expiry = document.getElementById('expiry').value;
        if (!expiry.includes('/') || expiry.length < 5) {
            alert('⚠️ Please enter a valid expiry date (MM/YY)');
            return;
        }
        
        console.log('✅ All validations passed, processing payment...');
        
        // Process payment (simulated)
        processPayment();
    });
}

// Process payment (demo mode)
function processPayment() {
    console.log('💳 Processing payment...');
    
    // Show loading
    const btn = document.getElementById('placeOrderBtn');
    btn.innerHTML = '<span>Processing...</span> ⏳';
    btn.disabled = true;
    
    // Simulate payment processing
    setTimeout(function() {
        console.log('✅ Payment processed successfully');
        
        // Generate order number
        const orderNumber = 'GARDIY-' + Date.now().toString().slice(-8);
        
        // Get values
        const email = document.getElementById('email').value;
        const deliveryDate = document.getElementById('deliveryDate').value;
        const total = document.getElementById('grandTotal').textContent;
        
        // Format date
        const date = new Date(deliveryDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        console.log('📧 Order details:', { orderNumber, email, formattedDate, total });
        
        // Show success modal
        document.getElementById('confirmEmail').textContent = email;
        document.getElementById('orderNumber').textContent = orderNumber;
        document.getElementById('confirmDate').textContent = formattedDate;
        document.getElementById('confirmTotal').textContent = total;
        
        document.getElementById('successModal').style.display = 'flex';
        
        // Clear saved design data
        localStorage.removeItem('gardiyDesign');
        console.log('✅ Design data cleared from localStorage');
        
    }, 2000);
}

// Close modal on ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('successModal');
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
            window.location.href = 'index.html';
        }
    }
});

console.log('✅ Checkout script fully loaded');
