import { useState, useMemo, useEffect } from 'react'
import { Search, MapPin, Sparkles, Loader2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { getAllPlants, searchPlants } from '../lib/plants'
import { assessGrowability } from '../lib/climate'
import { getRecommendations } from '../lib/api'
import PlantCard from '../components/PlantCard'

const RECS_CACHE_KEY = 'plantscout_recommendations'

export default function Discover() {
  const { state } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [recommendations, setRecommendations] = useState([])
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [recsError, setRecsError] = useState(null)

  // Load cached recommendations on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(RECS_CACHE_KEY)
      if (cached) {
        const { recs, climateLabel } = JSON.parse(cached)
        // Only use cache if climate hasn't changed
        if (climateLabel === state.homeClimate?.label) {
          setRecommendations(recs)
        }
      }
    } catch (e) {
      // ignore
    }
  }, [state.homeClimate?.label])

  async function fetchRecommendations() {
    if (!state.homeClimate) return
    setLoadingRecs(true)
    setRecsError(null)
    try {
      const recs = await getRecommendations(state.homeClimate, state.spaceType)
      setRecommendations(recs)
      // Cache
      localStorage.setItem(RECS_CACHE_KEY, JSON.stringify({
        recs,
        climateLabel: state.homeClimate.label,
      }))
    } catch (err) {
      console.error('Recommendations error:', err)
      setRecsError('Could not load AI recommendations. The catalog below still works!')
    }
    setLoadingRecs(false)
  }

  const recsWithAssessments = useMemo(() => {
    return recommendations.map(plant => ({
      plant,
      assessment: state.homeClimate ? assessGrowability(plant, state.homeClimate) : null,
    }))
  }, [recommendations, state.homeClimate])

  const plantsWithAssessments = useMemo(() => {
    const plants = query ? searchPlants(query) : getAllPlants()
    return plants.map(plant => ({
      plant,
      assessment: state.homeClimate ? assessGrowability(plant, state.homeClimate) : null,
    }))
  }, [query, state.homeClimate])

  const allItems = useMemo(() => {
    return [...recsWithAssessments, ...plantsWithAssessments]
  }, [recsWithAssessments, plantsWithAssessments])

  const filtered = useMemo(() => {
    if (filter === 'all') return allItems
    return allItems.filter(({ assessment }) => assessment?.rating === filter)
  }, [allItems, filter])

  const counts = useMemo(() => {
    const c = { all: allItems.length, perfect: 0, possible: 0, indoor_only: 0 }
    for (const { assessment } of allItems) {
      if (assessment?.rating) c[assessment.rating] = (c[assessment.rating] || 0) + 1
    }
    return c
  }, [allItems])

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

      {/* AI Recommendations section */}
      {state.homeClimate && recommendations.length === 0 && !loadingRecs && (
        <button
          onClick={fetchRecommendations}
          className="w-full mb-5 py-3 px-4 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:from-green-700 hover:to-green-800 active:scale-[0.98] transition-all"
        >
          <Sparkles size={16} />
          Get AI Recommendations for Your Climate
        </button>
      )}

      {loadingRecs && (
        <div className="mb-5 py-6 flex flex-col items-center gap-2 text-slate-500">
          <Loader2 size={20} className="animate-spin text-green-600" />
          <p className="text-xs">Finding perfect plants for {state.homeClimate?.label}...</p>
        </div>
      )}

      {recsError && (
        <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-700">{recsError}</p>
        </div>
      )}

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

      {/* AI Recommendations */}
      {recsWithAssessments.length > 0 && filter === 'all' && !query && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-green-600" />
            <h2 className="text-sm font-semibold text-slate-800">AI Picks for You</h2>
          </div>
          <div className="space-y-3">
            {recsWithAssessments.map(({ plant, assessment }) => (
              <PlantCard key={`rec-${plant.id}`} plant={plant} assessment={assessment} isRecommendation />
            ))}
          </div>
          <div className="mt-4 mb-2 border-t border-slate-200" />
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Plant Catalog</h2>
        </div>
      )}

      {/* Plant list */}
      <div className="space-y-3">
        {(filter === 'all' && !query ? plantsWithAssessments : filtered.filter(item => !recommendations.some(r => r.id === item.plant.id))).map(({ plant, assessment }) => (
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
