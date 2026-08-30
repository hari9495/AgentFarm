'use client';

import { createContext, useContext } from 'react';

/**
 * Shares the internal dashboard sidebar's collapsed state between the layout
 * shell (which owns the grid column width + resize handle) and the sidebar
 * content (which renders the icon rail). Desktop only; the mobile drawer is
 * always full-width.
 */
export const SidebarCollapseContext = createContext<{ collapsed: boolean; toggle: () => void }>({
    collapsed: false,
    toggle: () => {},
});

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);
