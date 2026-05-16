// Mobile: hamburger nav + design page tabs
(function () {

    // ── Hamburger nav drawer ────────────────────────────────────────────
    function initHamburger() {
        const hamburger = document.querySelector('.hamburger');
        if (!hamburger) return;

        const overlay = document.createElement('div');
        overlay.className = 'mobile-nav-overlay';
        overlay.id = 'mobileNavOverlay';

        const drawer = document.createElement('div');
        drawer.className = 'mobile-nav-drawer';
        drawer.id = 'mobileNavDrawer';

        // Copy nav links into drawer
        document.querySelectorAll('.nav-links a').forEach(a => {
            const link = a.cloneNode(true);
            drawer.appendChild(link);
        });

        // Divider + CTA button
        const cta = document.querySelector('.nav-actions a, .nav-actions button');
        if (cta) {
            const hr = document.createElement('div');
            hr.className = 'drawer-divider';
            drawer.appendChild(hr);
            const ctaLink = document.createElement('a');
            ctaLink.href   = cta.href || '#';
            ctaLink.textContent = cta.textContent.trim();
            ctaLink.className = 'drawer-cta';
            drawer.appendChild(ctaLink);
        }

        // back-btn (login page) as CTA
        const backBtn = document.querySelector('.back-btn');
        if (backBtn && !cta) {
            const hr = document.createElement('div');
            hr.className = 'drawer-divider';
            drawer.appendChild(hr);
            const bl = document.createElement('a');
            bl.href = backBtn.href || 'index.html';
            bl.textContent = backBtn.textContent.trim();
            bl.className = 'drawer-cta';
            drawer.appendChild(bl);
        }

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        function openMenu() {
            hamburger.classList.add('open');
            overlay.style.display = 'block';
            requestAnimationFrame(() => overlay.classList.add('open'));
            drawer.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function closeMenu() {
            hamburger.classList.remove('open');
            overlay.classList.remove('open');
            drawer.classList.remove('open');
            setTimeout(() => { overlay.style.display = 'none'; }, 280);
            document.body.style.overflow = '';
        }

        hamburger.addEventListener('click', () =>
            hamburger.classList.contains('open') ? closeMenu() : openMenu()
        );
        overlay.addEventListener('click', closeMenu);
        drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    }

    // ── Design page tab bar ─────────────────────────────────────────────
    function initDesignTabs() {
        const tabBar = document.getElementById('mobileDesignTabs');
        if (!tabBar) return;

        const panels = {
            products:  document.querySelector('.design-sidebar'),
            canvas:    document.querySelector('.design-canvas'),
            materials: document.querySelector('.materials-panel'),
        };

        function showTab(name) {
            Object.entries(panels).forEach(([key, el]) => {
                if (!el) return;
                el.classList.toggle('mobile-active', key === name);
            });
            tabBar.querySelectorAll('button').forEach(btn =>
                btn.classList.toggle('active', btn.dataset.tab === name)
            );
        }

        tabBar.querySelectorAll('button').forEach(btn =>
            btn.addEventListener('click', () => showTab(btn.dataset.tab))
        );

        // Start on canvas so user sees their design immediately
        showTab('canvas');
    }

    // ── Design canvas: forward touch events → synthetic mouse events ────────────
    // All drag/select/resize/rotate handlers in design.js use mouse events only.
    // This lets them work on touchscreens without any changes to design.js.
    function initDesignTouchForwarding() {
        const canvas = document.getElementById('designCanvas');
        if (!canvas) return;

        let touchInCanvas = false;
        let lastTouchTarget = null;

        function syntheticMouse(type, touch, target) {
            const el = target || document.elementFromPoint(touch.clientX, touch.clientY);
            if (!el) return;
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: touch.clientX, clientY: touch.clientY,
            }));
        }

        canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            touchInCanvas = true;
            const t = e.touches[0];
            lastTouchTarget = document.elementFromPoint(t.clientX, t.clientY);
            syntheticMouse('mousedown', t, lastTouchTarget);
        }, { passive: false });

        document.addEventListener('touchmove', e => {
            if (!touchInCanvas) return;
            e.preventDefault();
            if (e.touches.length === 1) syntheticMouse('mousemove', e.touches[0]);
        }, { passive: false });

        document.addEventListener('touchend', e => {
            if (!touchInCanvas) return;
            touchInCanvas = false;
            const t = e.changedTouches[0];
            syntheticMouse('mouseup', t);
            // Fire click for tap interactions (control panel buttons, deselect)
            const el = document.elementFromPoint(t.clientX, t.clientY) || lastTouchTarget;
            if (el) syntheticMouse('click', t, el);
            lastTouchTarget = null;
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initHamburger();
        initDesignTabs();
        initDesignTouchForwarding();
    });
})();
