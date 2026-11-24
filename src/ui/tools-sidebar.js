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
    const main = sidebar.querySelector('.right-sidebar-main');
    const scrollport = sidebar.querySelector('.right-sidebar-scroll');
    const header = main.querySelector('.right-sidebar-header');
    const inspector = main.querySelector('.contextual-inspector');
    const help = main.querySelector('.smart-help-panel');
    const toolsContent = scrollport.querySelector('.right-sidebar-content');
    const firstTool = toolsContent.querySelector('.tool-section-header');

    const layoutObserver = new ResizeObserver(() => {
        if (!main.clientHeight || sidebar.classList.contains('is-drawer-open')) return;

        // Keep room for a complete tool header before using the whole sidebar as the scrollport.
        const toolHeight = firstTool.offsetHeight + parseFloat(getComputedStyle(toolsContent).paddingTop);
        const helpStyle = getComputedStyle(help);
        const helpHeight = help.parentElement === main
            ? help.offsetHeight + parseFloat(helpStyle.marginTop) + parseFloat(helpStyle.marginBottom)
            : 0;
        const requiredHeight = header.offsetHeight + inspector.offsetHeight + helpHeight + toolHeight;
        const wasConstrained = main.classList.contains('is-height-constrained');
        const isConstrained = main.classList.toggle('is-height-constrained', requiredHeight > main.clientHeight);
        // The browser can restore a previous scroll offset when overflow changes from clip to auto.
        if (isConstrained && !wasConstrained) main.scrollTop = 0;
    });
    [main, header, inspector, help, scrollport, firstTool].forEach(element => layoutObserver.observe(element));

    let revealSelection = false;
    const revealInspector = () => {
        // On mobile, a hidden drawer cannot be scrolled until it opens.
        if (!revealSelection || !main.getClientRects().length) return;
        main.scrollTop = 0;
        scrollport.scrollTop = 0;
        revealSelection = false;
    };
    window.addEventListener('gpmap:statechange', ({ detail: { key, value } }) => {
        if (key !== 'selectedFeature') return;
        revealSelection = Boolean(value);
        queueMicrotask(revealInspector);
    });
    window.addEventListener('gpmap:drawerchange', ({ detail: { drawerId } }) => {
        if (!drawerId || drawerId === sidebar.id) revealInspector();
    });
    const handle = sidebar.querySelector('.right-sidebar-layout-handle');
    const flip = () => {
        setCollapsed(sidebar, !sidebar.classList.contains('is-collapsed'));
        revealInspector();
    };
    handle?.addEventListener('click', flip);
    setCollapsed(sidebar, getCollapsedState(), false);
}
