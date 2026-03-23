import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Leaf, Heart, MapPin, MessageCircle } from 'lucide-react'
import { useApp } from '../lib/store'
import { getPlantById } from '../lib/plants'
import { assessGrowability, getPlacementAdvice } from '../lib/climate'
import CompatBadge from '../components/CompatBadge'
import FactorList from '../components/FactorList'

export default function PlantDetail() {
  const { plantId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()

  const plant = getPlantById(plantId)
  const assessment = useMemo(
    () => plant && state.homeClimate ? assessGrowability(plant, state.homeClimate) : null,
    [plant, state.homeClimate]
  )
  const placement = useMemo(
    () => assessment && plant ? getPlacementAdvice(assessment, plant) : null,
    [assessment, plant]
  )

  const isSaved = state.discoveries.some(d => d.plantId === plantId)

  if (!plant) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-slate-500">Plant not found.</p>
        <button onClick={() => navigate(-1)} className="text-green-700 text-sm mt-4">Go back</button>
      </div>
    )
  }

  function handleSave() {
    if (isSaved) {
      dispatch({ type: 'REMOVE_DISCOVERY', payload: plantId })
    } else {
      dispatch({
        type: 'ADD_DISCOVERY',
        payload: {
          id: plantId,
          plantId: plant.id,
          commonName: plant.commonName,
          scientificName: plant.scientificName,
          description: plant.description,
          rating: assessment?.rating || 'unknown',
          savedAt: new Date().toISOString(),
          trip: state.currentTrip?.name || null,
        },
      })
    }
  }

  return (
    <div className="pb-8">
      {/* Hero / Top bar */}
      <div className="bg-green-700 text-white px-5 pt-4 pb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-green-200 text-sm mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">{plant.commonName}</h1>
            <p className="text-green-200 text-sm italic">{plant.scientificName}</p>
            <p className="text-green-300 text-xs mt-1">Family: {plant.family}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center">
            <Leaf size={24} />
          </div>
        </div>
      </div>

      <div className="px-5 -mt-4">
        {/* Compatibility card */}
        {assessment && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">Compatibility</span>
                <div className="flex items-center gap-2 mt-1">
                  <CompatBadge rating={assessment.rating} size="lg" />
                  <span className="text-sm text-slate-500">{assessment.scorePct}% match</span>
                </div>
              </div>
              {state.homeClimate && (
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <MapPin size={10} />
                    {state.homeClimate.label}
                  </div>
                  <p className="text-xs text-slate-400">Zone {state.homeClimate.zone}</p>
                </div>
              )}
            </div>

            {/* Zone gotcha */}
            {assessment.zoneGotcha && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-800 font-medium mb-1">Zone Gotcha</p>
                <p className="text-xs text-amber-700 leading-relaxed">{assessment.zoneGotcha}</p>
              </div>
            )}

            {/* Partial data warning */}
            {assessment.partialData && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700 leading-relaxed">
                  Limited climate data for your location — only USDA zone is available.
                  Select a known city in Home Setup for a complete multi-factor analysis.
                </p>
              </div>
            )}

            {/* Factor breakdown */}
            <FactorList factors={assessment.factors} />
          </div>
        )}

        {/* Placement advice */}
        {placement && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Where to Grow It</h3>
            <p className="text-sm text-green-700 font-medium">{placement.placement}</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{placement.advice}</p>
          </div>
        )}

        {/* Plant info */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">About This Plant</h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">{plant.description}</p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">Sun</span>
              <p className="text-slate-700 font-medium capitalize">{plant.sunNeeds}</p>
            </div>
            <div>
              <span className="text-slate-400">Water</span>
              <p className="text-slate-700 font-medium capitalize">{plant.waterNeeds}</p>
            </div>
            <div>
              <span className="text-slate-400">Zones</span>
              <p className="text-slate-700 font-medium">{plant.hardinessRange.join('–')}</p>
            </div>
            <div>
              <span className="text-slate-400">Size</span>
              <p className="text-slate-700 font-medium capitalize">{plant.size}</p>
            </div>
          </div>

          {plant.careNotes && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">Care Notes</span>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{plant.careNotes}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${
              isSaved
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-green-700 text-white'
            }`}
          >
            <Heart size={16} fill={isSaved ? 'currentColor' : 'none'} />
            {isSaved ? 'Remove from Wishlist' : 'Save to Wishlist'}
          </button>
          <button
            onClick={() => navigate('/travel', { state: { plantId: plant.id } })}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all active:scale-[0.98]"
          >
            <MessageCircle size={16} />
            Chat
          </button>
        </div>
      </div>
    </div>
  )
}
