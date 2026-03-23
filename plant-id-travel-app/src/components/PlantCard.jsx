import { useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import CompatBadge from './CompatBadge'

export default function PlantCard({ plant, assessment }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/plant/${plant.id}`)}
      className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-green-300 hover:shadow-sm transition-all active:scale-[0.98]"
    >
      <div className="flex gap-3">
        <div className="w-14 h-14 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
          <Leaf size={24} className="text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">{plant.commonName}</h3>
              <p className="text-xs text-slate-400 italic">{plant.scientificName}</p>
            </div>
            {assessment && <CompatBadge rating={assessment.rating} />}
          </div>
          <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{plant.description}</p>
        </div>
      </div>
    </button>
  )
}
