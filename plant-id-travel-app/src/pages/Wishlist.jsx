import { useNavigate } from 'react-router-dom'
import { Heart, Trash2, Leaf } from 'lucide-react'
import { useApp } from '../lib/store'
import CompatBadge from '../components/CompatBadge'

export default function Wishlist() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()

  if (state.discoveries.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Heart size={24} className="text-slate-300" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">No saved plants yet</h2>
        <p className="text-sm text-slate-400 mb-6">
          Discover plants and save them to your wishlist to track what you want to grow at home.
        </p>
        <button
          onClick={() => navigate('/discover')}
          className="px-6 py-2.5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition-colors"
        >
          Explore Plants
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 py-6">
      <h1 className="text-xl font-bold text-slate-900 mb-1">My Wishlist</h1>
      <p className="text-sm text-slate-500 mb-5">{state.discoveries.length} plant{state.discoveries.length !== 1 ? 's' : ''} saved</p>

      <div className="space-y-3">
        {state.discoveries.map(d => (
          <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/plant/${d.plantId}`)}
                className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center shrink-0"
              >
                <Leaf size={20} className="text-green-600" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => navigate(`/plant/${d.plantId}`)} className="text-left">
                    <h3 className="font-semibold text-slate-800 text-sm">{d.commonName}</h3>
                    <p className="text-xs text-slate-400 italic">{d.scientificName}</p>
                  </button>
                  <CompatBadge rating={d.rating} />
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-1">{d.description}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-300">
                    {new Date(d.savedAt).toLocaleDateString()}
                    {d.trip && ` — ${d.trip}`}
                  </span>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_DISCOVERY', payload: d.id })}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
