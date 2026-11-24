const SESSION_KEY = 'gpmapcomp.toolsSidebarCollapsed';
const SIDEBAR_LABELS = {
    collapsed: 'Show Tools & Properties',
    expanded: 'Hide Tools & Properties'
};

function getCollapsedState() {
    try { return window.sessionStorage.getItem(SESSION_KEY) === 'true'; } catch (error) { return false; }
}

function saveCollapsedState(collapsed) {
    try { window.sessionStorage.setItem(SESSION_KEY, String(collapsed)); } catch (error) { /* Storage can be unavailable. */ }
}

function setCollapsed(sidebar, collapsed, persist = true) {
    sidebar.classList.toggle('is-collapsed', collapsed);
    const handle = sidebar.querySelector('.right-sidebar-layout-handle');
    const icon = handle?.querySelector('i');
    const label = collapsed ? SIDEBAR_LABELS.collapsed : SIDEBAR_LABELS.expanded;
    handle?.setAttribute('aria-expanded', String(!collapsed));
    handle?.setAttribute('aria-label', label);
    if (handle) handle.title = label;
    icon?.classList.toggle('fa-chevron-right', !collapsed);
    icon?.classList.toggle('fa-chevron-left', collapsed);
    if (persist) saveCollapsedState(collapsed);
}

export function initializeToolsSidebar() {
    const sidebar = document.querySelector('.sidebar-right');
    if (!sidebar) return;
    const handle = sidebar.querySelector('.right-sidebar-layout-handle');
    const flip = () => setCollapsed(sidebar, !sidebar.classList.contains('is-collapsed'));
    handle?.addEventListener('click', flip);
    setCollapsed(sidebar, getCollapsedState(), false);
}
