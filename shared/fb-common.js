/* fb-common.js — Shared JS for Favela Brass staff sites */

/**
 * Highlight the current page in the nav bar.
 * Matches on filename (e.g. "horarios.html" matches href containing "horarios").
 */
function fbInitNav() {
    var path = window.location.pathname;
    var page = path.split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.fb-nav a');
    links.forEach(function(a) {
        var href = a.getAttribute('href') || '';
        if (page === 'index.html' && (href === 'index.html' || href === '.' || href === './')) {
            a.classList.add('active');
        } else if (href === page) {
            a.classList.add('active');
        }
    });
}

/**
 * Tab switching with URL hash support.
 */
function fbInitTabs() {
    var btns = document.querySelectorAll('.fb-tab-btn');
    if (!btns.length) return;

    btns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            btns.forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.fb-tab-panel').forEach(function(p) { p.classList.remove('active'); });

            btn.classList.add('active');
            var panel = document.getElementById('tab-' + btn.dataset.tab);
            if (panel) panel.classList.add('active');

            history.replaceState(null, null, '#' + btn.dataset.tab);
        });
    });

    // Load from hash
    var hash = window.location.hash.slice(1);
    if (hash) {
        var target = document.querySelector('.fb-tab-btn[data-tab="' + hash + '"]');
        if (target) target.click();
    }
}

/**
 * Staggered fade-in for elements with .fb-fade-in.
 * Uses IntersectionObserver if available, falls back to immediate show.
 */
function fbInitFadeIn() {
    var els = document.querySelectorAll('.fb-fade-in');
    if (!els.length) return;

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.style.animationPlayState = 'running';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        els.forEach(function(el) {
            el.style.animationPlayState = 'paused';
            observer.observe(el);
        });
    }
}

/**
 * Password gate — shows overlay until correct password entered.
 * Uses localStorage so you only enter it once per browser.
 * @param {string} password - The required password
 * @param {string} storageKey - localStorage key (different per access tier)
 */
function fbInitPasswordGate(password, storageKey) {
    storageKey = storageKey || 'fb-portal-auth';
    if (localStorage.getItem(storageKey) === 'true') {
        var overlay = document.querySelector('.fb-password-overlay');
        if (overlay) overlay.classList.add('hidden');
        return;
    }

    var overlay = document.querySelector('.fb-password-overlay');
    if (!overlay) return;

    var input = overlay.querySelector('input');
    var error = overlay.querySelector('.error');
    var main = document.querySelector('.fb-main-content');
    if (main) main.style.display = 'none';

    function tryPassword() {
        if (input.value === password) {
            localStorage.setItem(storageKey, 'true');
            overlay.classList.add('hidden');
            if (main) main.style.display = '';
        } else if (input.value) {
            error.textContent = 'Senha incorreta';
            input.value = '';
            input.focus();
        }
    }

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') tryPassword();
        else if (error) error.textContent = '';
    });
}

/* Auto-init on DOM ready */
document.addEventListener('DOMContentLoaded', function() {
    fbInitNav();
    fbInitTabs();
    fbInitFadeIn();
});
