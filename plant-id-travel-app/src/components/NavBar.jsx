import { NavLink } from 'react-router-dom'
import { Search, Camera, Heart, Settings } from 'lucide-react'

const tabs = [
  { to: '/discover', icon: Search, label: 'Discover' },
  { to: '/travel', icon: Camera, label: 'Travel' },
  { to: '/wishlist', icon: Heart, label: 'Wishlist' },
  { to: '/setup', icon: Settings, label: 'Home' },
]

export default function NavBar() {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 flex z-50">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 pt-3 text-xs transition-colors ${
              isActive ? 'text-green-700 font-semibold' : 'text-slate-400'
            }`
          }
        >
          <Icon size={20} strokeWidth={1.5} />
          <span className="mt-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
