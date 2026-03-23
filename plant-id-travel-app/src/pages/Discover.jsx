import { useState, useMemo } from 'react'
import { Search, MapPin } from 'lucide-react'
import { useApp } from '../lib/store'
import { getAllPlants, searchPlants } from '../lib/plants'
import { assessGrowability } from '../lib/climate'
import PlantCard from '../components/PlantCard'

export default function Discover() {
  const { state } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all') // all | perfect | possible | indoor_only

  const plantsWithAssessments = useMemo(() => {
    const plants = query ? searchPlants(query) : getAllPlants()
    return plants.map(plant => ({
      plant,
      assessment: state.homeClimate ? assessGrowability(plant, state.homeClimate) : null,
    }))
  }, [query, state.homeClimate])

  const filtered = useMemo(() => {
    if (filter === 'all') return plantsWithAssessments
    return plantsWithAssessments.filter(({ assessment }) => assessment?.rating === filter)
  }, [plantsWithAssessments, filter])

  const counts = useMemo(() => {
    const c = { all: plantsWithAssessments.length, perfect: 0, possible: 0, indoor_only: 0 }
    for (const { assessment } of plantsWithAssessments) {
      if (assessment?.rating) c[assessment.rating] = (c[assessment.rating] || 0) + 1
    }
    return c
  }, [plantsWithAssessments])

  return (
    <div className="px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Discover Plants</h1>
          {state.homeClimate && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
              <MapPin size={12} />
              <span>{state.homeClimate.label} — Zone {state.homeClimate.zone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search plants..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
        />
      </div>

      {/* Filter pills */}
      {state.homeClimate && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'perfect', label: 'Perfect' },
            { key: 'possible', label: 'With Care' },
            { key: 'indoor_only', label: 'Indoor' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === f.key
                  ? 'border-green-600 bg-green-50 text-green-800'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {f.label} ({counts[f.key] || 0})
            </button>
          ))}
        </div>
      )}

      {/* Zone gotcha callout */}
      {state.homeClimate && filter === 'all' && (
        <div className="mb-5 p-3 rounded-lg bg-amber-100/60 border border-amber-200">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Why not just use USDA zones?</strong> Your zone ({state.homeClimate.zone}) only measures winter lows.
            We also check heat tolerance, humidity, rainfall, soil, and growing season length.
            {' '}Plants that are "zone compatible" can still fail for other reasons.
          </p>
        </div>
      )}

      {/* Plant list */}
      <div className="space-y-3">
        {filtered.map(({ plant, assessment }) => (
          <PlantCard key={plant.id} plant={plant} assessment={assessment} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-slate-400">No plants found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  )
}
