import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Home, Trees, Flower2, Building2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { getClimateProfile, getAvailableCities } from '../lib/climate'
import { updateProfile } from '../lib/db'

const spaceOptions = [
  { value: 'yard', icon: Trees, label: 'Big Yard', desc: 'Room for trees & beds' },
  { value: 'mixed', icon: Home, label: 'Some Outdoor', desc: 'Patio, small yard' },
  { value: 'balcony', icon: Flower2, label: 'Balcony', desc: 'Containers only' },
  { value: 'indoor_only', icon: Building2, label: 'Indoor', desc: 'Houseplants' },
]

export default function HomeSetup() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const cities = getAvailableCities()

  const [selected, setSelected] = useState(state.homeLocation?.value || '')
  const [spaceType, setSpaceType] = useState(state.spaceType || 'mixed')
  const [customInput, setCustomInput] = useState('')
  const [error, setError] = useState(null)

  function handleSave() {
    const location = selected || customInput.trim().toLowerCase()
    if (!location) {
      setError('Pick a city or enter a zip code')
      return
    }

    const climate = getClimateProfile(location)
    if (!climate) {
      setError("Couldn't find climate data for that location. Try one of the listed cities or a US zip code.")
      return
    }

    dispatch({
      type: 'SET_HOME',
      payload: { location: { label: climate.label, value: location }, climate },
    })
    dispatch({ type: 'SET_SPACE_TYPE', payload: spaceType })

    // Persist to Supabase
    if (state.profileId) {
      updateProfile(state.profileId, {
        home_city: climate.label,
        home_zip: customInput.trim() || null,
        space_type: spaceType,
      })
    }

    navigate('/discover')
  }

  return (
    <div className="px-5 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
          <MapPin size={28} className="text-green-700" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Set Your Home Base</h1>
        <p className="text-sm text-slate-500 mt-2">
          We use more than just your USDA zone — humidity, heat, rainfall, and soil all matter.
        </p>
      </div>

      {/* City Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Select your city</label>
        <div className="grid grid-cols-2 gap-2">
          {cities.map(city => (
            <button
              key={city.value}
              onClick={() => { setSelected(city.value); setCustomInput(''); setError(null) }}
              className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                selected === city.value
                  ? 'border-green-600 bg-green-50 text-green-800 font-medium'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {city.label}
            </button>
          ))}
        </div>
      </div>

      {/* Or enter zip */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Or enter a zip code</label>
        <input
          type="text"
          placeholder="e.g. 38103"
          value={customInput}
          onChange={e => { setCustomInput(e.target.value); setSelected(''); setError(null) }}
          className="w-full px-4 py-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
        />
      </div>

      {/* Space type */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-slate-700 mb-2">What space do you have?</label>
        <div className="grid grid-cols-2 gap-2">
          {spaceOptions.map(opt => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                onClick={() => setSpaceType(opt.value)}
                className={`text-left px-3 py-3 rounded-lg border transition-all ${
                  spaceType === opt.value
                    ? 'border-green-600 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon size={18} className={spaceType === opt.value ? 'text-green-600' : 'text-slate-400'} />
                <div className="mt-1.5">
                  <span className={`text-sm font-medium ${spaceType === opt.value ? 'text-green-800' : 'text-slate-700'}`}>
                    {opt.label}
                  </span>
                  <p className="text-xs text-slate-400">{opt.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 mb-4 text-center">{error}</p>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3.5 rounded-xl bg-green-700 text-white font-semibold text-sm hover:bg-green-800 active:scale-[0.98] transition-all"
      >
        Set Home Base
      </button>

      {/* Climate preview */}
      {(selected || customInput) && (() => {
        const preview = getClimateProfile(selected || customInput)
        if (!preview) return null
        return (
          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">{preview.label}</h3>
            <p className="text-xs text-slate-500 mb-3">{preview.description}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded-lg p-2 border border-slate-100">
                <span className="text-slate-400">Zone</span>
                <p className="font-semibold text-slate-700">{preview.zone}</p>
              </div>
              {preview.heatZone && (
                <div className="bg-white rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-400">Heat Zone</span>
                  <p className="font-semibold text-slate-700">{preview.heatZone}</p>
                </div>
              )}
              {preview.annualRainfallIn && (
                <div className="bg-white rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-400">Rainfall</span>
                  <p className="font-semibold text-slate-700">{preview.annualRainfallIn}"/yr</p>
                </div>
              )}
              {preview.humidity && (
                <div className="bg-white rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-400">Humidity</span>
                  <p className="font-semibold text-slate-700 capitalize">{preview.humidity.replace('_', ' ')}</p>
                </div>
              )}
              {preview.soilType && (
                <div className="bg-white rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-400">Soil</span>
                  <p className="font-semibold text-slate-700 capitalize">{preview.soilType}</p>
                </div>
              )}
              {preview.frostFreeDays && (
                <div className="bg-white rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-400">Frost-Free</span>
                  <p className="font-semibold text-slate-700">{preview.frostFreeDays} days</p>
                </div>
              )}
            </div>
            {preview.partialData && (
              <p className="text-xs text-amber-600 mt-3">
                Limited data for this zip — only USDA zone available. Select a city above for full multi-factor analysis.
              </p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
