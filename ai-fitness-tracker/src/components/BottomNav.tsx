import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Camera, MessageCircle, User, UtensilsCrossed } from 'lucide-react';

const tabs = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/eat-out', icon: UtensilsCrossed, label: 'Eat Out' },
  { path: '/snap', icon: Camera, label: 'Snap', accent: true },
  { path: '/chat', icon: MessageCircle, label: 'Coach' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10">
      <div className="max-w-lg mx-auto flex items-center justify-around py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ path, icon: Icon, label, accent }) => {
          const active = location.pathname === path;
          if (accent) {
            return (
              <button key={path} onClick={() => navigate(path)}
                className="relative -mt-6 flex flex-col items-center"
              >
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center shadow-lg shadow-neon-teal/25">
                  <Icon size={24} className="text-white" />
                </div>
                <span className="text-[10px] mt-0.5 font-ui uppercase text-neon-teal">{label}</span>
              </button>
            );
          }
          return (
            <button key={path} onClick={() => navigate(path)}
              className="flex flex-col items-center py-2 px-3 min-w-[60px]"
            >
              <Icon size={20} className={active ? 'text-neon-teal' : 'text-chrome/30'} />
              <span className={`text-[10px] mt-0.5 font-ui uppercase ${active ? 'text-neon-teal' : 'text-chrome/30'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
