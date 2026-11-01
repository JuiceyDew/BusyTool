import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import {
  BarChart3,
  Clapperboard,
  FileText,
  FolderKanban,
  Receipt,
  Settings as SettingsIcon,
  Users
} from 'lucide-react'
import { useToastMessage, clearError } from './lib/toast'
import { ErrorBanner } from './components/ui/PageHeader'
import { DashboardPage } from './pages/Dashboard'
import { ClientsPage } from './pages/Clients'
import { ClientDetailPage } from './pages/ClientDetail'
import { ProjectsPage } from './pages/Projects'
import { VideosPage } from './pages/Videos'
import { InvoicesPage } from './pages/Invoices'
import { InvoiceNewPage } from './pages/InvoiceNew'
import { InvoiceDetailPage } from './pages/InvoiceDetail'
import { PrintInvoicePage } from './pages/PrintInvoice'
import { ExpensesPage } from './pages/Expenses'
import { SettingsPage } from './pages/Settings'

const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/clients', label: 'Clients', icon: Users, end: false },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/videos', label: 'Videos', icon: Clapperboard, end: false },
  { to: '/invoices', label: 'Invoices', icon: FileText, end: false },
  { to: '/expenses', label: 'Expenses', icon: Receipt, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false }
]

function Layout() {
  const message = useToastMessage()
  return (
    <div className="flex h-full bg-zinc-50">
      <aside className="print-hide flex w-[232px] shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-base font-semibold tracking-tight text-zinc-900">BusyTool</p>
          <p className="text-xs text-zinc-400">Clients · invoices · stats</p>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-zinc-100 font-medium text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          {message ? <ErrorBanner message={message} onDismiss={clearError} /> : null}
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/invoices/:id/print" element={<PrintInvoicePage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<InvoiceNewPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
