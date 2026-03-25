/**
 * State management using React context + localStorage + Supabase persistence.
 * localStorage is the fast primary store; Supabase is the durable cross-device backup.
 */

import { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { getDeviceId, getOrCreateProfile, getWishlist } from './db'

const AppContext = createContext(null)

const STORAGE_KEY = 'plantscout_state'

const initialState = {
  homeLocation: null,     // { label, value } — selected city
  homeClimate: null,      // full climate profile from climate.js
  spaceType: 'mixed',     // 'yard' | 'balcony' | 'indoor_only' | 'mixed'
  discoveries: [],        // saved plant discoveries with assessments
  currentTrip: null,      // { name, location, date }
  profileId: null,        // Supabase profile UUID
  deviceId: null,         // local device UUID
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_HOME':
      return { ...state, homeLocation: action.payload.location, homeClimate: action.payload.climate }
    case 'SET_SPACE_TYPE':
      return { ...state, spaceType: action.payload }
    case 'ADD_DISCOVERY':
      // Prevent duplicates by plant name
      if (state.discoveries.some(d => d.commonName === action.payload.commonName)) return state
      return { ...state, discoveries: [action.payload, ...state.discoveries] }
    case 'REMOVE_DISCOVERY':
      return { ...state, discoveries: state.discoveries.filter(d => d.id !== action.payload) }
    case 'SET_TRIP':
      return { ...state, currentTrip: action.payload }
    case 'SET_PROFILE':
      return { ...state, profileId: action.payload.profileId, deviceId: action.payload.deviceId }
    case 'MERGE_WISHLIST':
      // Merge Supabase wishlist items that aren't already local
      const existing = new Set(state.discoveries.map(d => d.commonName))
      const newItems = action.payload.filter(item => !existing.has(item.plant_name)).map(item => ({
        id: item.id,
        commonName: item.plant_name,
        scientificName: item.scientific_name,
        rating: item.rating,
        assessment: item.climate_assessment,
        supabaseId: item.id,
        savedAt: item.created_at,
      }))
      return { ...state, discoveries: [...state.discoveries, ...newItems] }
    case 'HYDRATE':
      return { ...state, ...action.payload }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const hydrated = useRef(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Don't hydrate profileId/deviceId from localStorage — we regenerate them
        const { profileId, deviceId, ...rest } = parsed
        dispatch({ type: 'HYDRATE', payload: rest })
      }
    } catch (e) {
      // ignore parse errors
    }
    hydrated.current = true
  }, [])

  // Initialize Supabase profile after hydration
  useEffect(() => {
    if (!hydrated.current) return
    async function initProfile() {
      try {
        const deviceId = getDeviceId()
        const profile = await getOrCreateProfile(deviceId)
        if (profile) {
          dispatch({ type: 'SET_PROFILE', payload: { profileId: profile.id, deviceId } })
          // Merge wishlist from Supabase
          const wishlist = await getWishlist(profile.id)
          if (wishlist.length > 0) {
            dispatch({ type: 'MERGE_WISHLIST', payload: wishlist })
          }
        } else {
          dispatch({ type: 'SET_PROFILE', payload: { profileId: null, deviceId } })
        }
      } catch (err) {
        console.warn('Supabase init failed, using localStorage only:', err.message)
      }
    }
    initProfile()
  }, [hydrated.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on change (exclude profileId/deviceId)
  useEffect(() => {
    try {
      const { profileId, deviceId, ...persistable } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
    } catch (e) {
      // ignore quota errors
    }
  }, [state])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
