'use strict';

// The sidebar: collapsing it to a narrow rail on desktop, and the menu button that opens it as a panel
// under the top bar on phones (at or below the 700px breakpoint in styles/layout.css).
// Loaded in <head> without defer (after storage.js), so html[data-sidebar] is set before the page is drawn.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const root = document.documentElement;
  const phone = window.matchMedia('(max-width: 700px)');
  const byId = id => document.getElementById(id);

  const setCollapsed = collapsed => {
    root.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    const button = byId('sidebar-toggle');
    if (!button) return;
    const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', label);
    button.title = label;
  };

  ui.menuOpen = () => byId('sidebar').classList.contains('menu-open');

  ui.openMenu = function () {
    byId('sidebar').classList.add('menu-open');
    byId('menu-toggle').setAttribute('aria-expanded', 'true');
  };

  // focus: return focus to the menu button (Escape, or after choosing a subject, whose button then disappears).
  ui.closeMenu = function (focus) {
    if (!ui.menuOpen()) return;
    byId('sidebar').classList.remove('menu-open');
    byId('menu-toggle').setAttribute('aria-expanded', 'false');
    if (focus) byId('menu-toggle').focus();
  };

  // Called by main.js once the markup is there.
  ui.wireSidebar = function () {
    setCollapsed(root.dataset.sidebar === 'collapsed');
    byId('sidebar-toggle').addEventListener('click', () => {
      const collapsed = root.dataset.sidebar !== 'collapsed';
      Quizy.storage.setSidebarCollapsed(collapsed);
      setCollapsed(collapsed);
    });
    byId('menu-toggle').addEventListener('click', () => { if (ui.menuOpen()) ui.closeMenu(false); else ui.openMenu(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && ui.menuOpen()) ui.closeMenu(true);
    });
    // The panel only exists on phones: leaving the breakpoint closes it.
    phone.addEventListener('change', () => { if (!phone.matches) ui.closeMenu(false); });
  };

  setCollapsed(Quizy.storage.sidebarCollapsed());
})(window.Quizy = window.Quizy || {});
