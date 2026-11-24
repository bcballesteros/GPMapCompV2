import { dismissLayerPanelOverlays } from './layers-panel.js';
import { dismissColorPickerWithin } from './vector-color-picker.js';
import { closeActiveModal } from './modal.js';

// Keep in sync with the responsive workspace query in main.css.
const DRAWER_LAYOUT = '(max-width: 1024px), (max-height: 480px)';
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

export function initializeResponsiveWorkspace() {
    const layout = window.matchMedia(DRAWER_LAYOUT);
    const orientation = window.matchMedia('(orientation: portrait)');
    const navbar = document.querySelector('.navbar');
    const canvas = document.querySelector('.canvas-area');
    const toasts = document.getElementById('toastContainer');
    const search = document.getElementById('locationSearchInput');
    const desktopPlaceholder = search.placeholder;
    const backdrop = document.querySelector('.drawer-backdrop');
    const annotation = document.getElementById('annotationPopup');
    const drawers = [...navbar.querySelectorAll('.drawer-trigger')].map(trigger => {
        const panel = document.getElementById(trigger.getAttribute('aria-controls'));
        return { trigger, panel, close: panel.querySelector('.drawer-close') };
    });
    let openDrawer;
    let activeModal;
    const modalOrigins = new WeakMap();

    const scope = () => activeModal || openDrawer?.panel;
    const entry = () => activeModal?.querySelector('.modal-close') || openDrawer?.close;
    const focus = element => element?.focus({ preventScroll: true });
    const topModal = () => [...document.querySelectorAll('.modal-overlay.active')].at(-1);

    function syncInteraction() {
        const responsive = layout.matches;
        const blocked = Boolean(responsive && scope());
        navbar.inert = canvas.inert = annotation.inert = blocked;
        const toastHost = responsive && scope() ? scope() : canvas;
        if (toasts.parentElement !== toastHost) toastHost.appendChild(toasts);
        backdrop.hidden = !openDrawer;
        for (const drawer of drawers) {
            const open = drawer === openDrawer;
            drawer.panel.classList.toggle('is-drawer-open', open);
            drawer.panel.inert = responsive && (!open || Boolean(activeModal));
            drawer.trigger.setAttribute('aria-expanded', String(open));
            if (responsive) drawer.panel.setAttribute('role', 'dialog');
            else drawer.panel.removeAttribute('role');
            if (open && !activeModal) drawer.panel.setAttribute('aria-modal', 'true');
            else drawer.panel.removeAttribute('aria-modal');
        }
        for (const modal of document.querySelectorAll('.modal-overlay.active')) {
            modal.inert = responsive && modal !== activeModal;
            const dialog = modal.querySelector('.modal');
            if (responsive && !dialog.hasAttribute('role')) {
                dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-label', dialog.querySelector('.modal-title').textContent.trim());
            }
            if (modal === activeModal) dialog.setAttribute('aria-modal', 'true');
            else if (modal.id !== 'confirmationModal') dialog.removeAttribute('aria-modal');
        }
    }

    function setDrawer(next, restore = true) {
        const previous = openDrawer;
        if (previous) {
            if (previous === drawers[0]) dismissLayerPanelOverlays();
            dismissColorPickerWithin(previous.panel);
        }
        openDrawer = next;
        syncInteraction();
        if (activeModal) return;
        if (next) focus(next.close);
        else if (restore) focus(previous?.trigger);
    }

    function syncLayout() {
        const focused = document.activeElement;
        const fromDrawer = openDrawer;
        const fromHiddenPanel = drawers.find(({ panel }) => panel.contains(focused));
        search.placeholder = layout.matches ? 'Search' : desktopPlaceholder;
        if (layout.matches) {
            dismissLayerPanelOverlays();
            for (const { panel } of drawers) dismissColorPickerWithin(panel);
        }
        activeModal = layout.matches ? topModal() : null;
        setDrawer(null, false);
        if (activeModal && !activeModal.contains(focused)) focus(entry());
        else if (layout.matches && fromHiddenPanel) focus(fromHiddenPanel.trigger);
        else if (!layout.matches && fromDrawer?.panel.contains(focused)) {
            focus(fromDrawer.panel.querySelector('.sidebar-layout-handle'));
        } else if (!layout.matches && drawers.some(({ trigger }) => trigger === focused)) {
            focus(navbar.querySelector('.app-brand'));
        }
        updateVisibleViewport();
    }

    const viewport = window.visualViewport;
    function updateVisibleViewport() {
        // Keep the layout steady during page pinch zoom. OpenLayers handles its own map gestures.
        if (viewport && viewport.scale !== 1) return;
        const style = document.documentElement.style;
        if (layout.matches && viewport && viewport.height < window.innerHeight - 1) {
            style.setProperty('--visible-height', `${viewport.height}px`);
            style.setProperty('--visible-top', `${viewport.offsetTop}px`);
        } else {
            style.removeProperty('--visible-height');
            style.removeProperty('--visible-top');
        }
    }

    for (const drawer of drawers) {
        drawer.trigger.addEventListener('click', () => {
            if (layout.matches && !activeModal) setDrawer(drawer === openDrawer ? null : drawer);
        });
        drawer.close.addEventListener('click', () => setDrawer(null));
    }
    backdrop.addEventListener('click', () => setDrawer(null));
    layout.addEventListener('change', syncLayout);
    orientation.addEventListener('change', () => {
        if (layout.matches && openDrawer) setDrawer(null);
    });
    viewport?.addEventListener('resize', updateVisibleViewport);
    viewport?.addEventListener('scroll', updateVisibleViewport);
    window.addEventListener('gpmap:annotationeditoropen', ({ detail: editor }) => {
        if (!layout.matches) return;
        // This existing map editor has its own backdrop and placement.
        if (openDrawer) setDrawer(null, false);
        focus(editor.querySelector('textarea'));
    });

    window.addEventListener('gpmap:modalchange', ({ detail: { modalId, isOpen } }) => {
        const changed = document.getElementById(modalId);
        if (!isOpen) changed.inert = false;
        if (!layout.matches) return;
        if (isOpen) {
            modalOrigins.set(changed, document.activeElement);
            if (openDrawer) dismissColorPickerWithin(openDrawer.panel);
            if (openDrawer === drawers[0]) dismissLayerPanelOverlays();
        }
        activeModal = topModal();
        syncInteraction();
        const origin = modalOrigins.get(changed);
        if (isOpen) {
            const target = entry();
            // Let Chrome finish the initiating tap and clear focus from the inert background.
            window.setTimeout(() => {
                if (activeModal === changed && !changed.contains(document.activeElement)) focus(target);
            }, 50);
        } else {
            if (activeModal && !activeModal.contains(origin)) focus(entry());
            else if (origin?.getClientRects().length && !origin.closest('[inert]')) focus(origin);
            else focus(entry() || drawers.find(({ panel }) => panel.contains(origin))?.trigger);
            modalOrigins.delete(changed);
        }
    });

    document.addEventListener('focusin', event => {
        if (scope() && !scope().contains(event.target)) focus(entry());
    });
    window.addEventListener('keydown', event => {
        const current = scope();
        if (!current || event.defaultPrevented) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (activeModal) closeActiveModal();
            else setDrawer(null);
            return;
        }
        if (event.key !== 'Tab' || current.querySelector('dialog[open]')) return;
        const stops = [...current.querySelectorAll(FOCUSABLE)].filter(element =>
            element.tabIndex >= 0 && !element.matches(':disabled') &&
            element.getClientRects().length && getComputedStyle(element).visibility === 'visible'
        );
        const boundary = event.shiftKey ? stops[0] : stops.at(-1);
        if (event.target === boundary) {
            event.preventDefault();
            focus(event.shiftKey ? stops.at(-1) : stops[0]);
        }
    });
    syncLayout();
}
