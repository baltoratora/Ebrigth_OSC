'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CrmSidebar } from './sidebar'
import { CrmTopbar } from './topbar'
import type { SessionUser } from './providers'

interface CrmShellProps {
  children: React.ReactNode
  session: { user: SessionUser }
}

const SIDEBAR_EXPANDED_W = 240
const SIDEBAR_COLLAPSED_W = 64

const sidebarVariants = {
  expanded: { width: SIDEBAR_EXPANDED_W },
  collapsed: { width: SIDEBAR_COLLAPSED_W },
}

export function CrmShell({ children, session }: CrmShellProps) {
  // Collapsed by default — keeps the kanban + dashboards roomy on first
  // paint. Users can expand via the topbar toggle and the state persists
  // for the session through React state (not localStorage — intentional;
  // the next reload starts collapsed too).
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden bg-[#e8eef9] dark:bg-slate-950">
      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={collapsed ? 'collapsed' : 'expanded'}
        variants={sidebarVariants}
        transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
        className="relative z-20 shrink-0 overflow-hidden"
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
      >
        <div
          className="h-full"
          style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
        >
          <CrmSidebar collapsed={collapsed} session={session} />
        </div>
      </motion.div>

      {/* Main area: topbar + content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <CrmTopbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          session={session}
        />

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.main
            key="main-content"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="flex-1 overflow-y-auto p-6"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
