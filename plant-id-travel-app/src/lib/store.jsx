/**
 * Simple state management using React context + localStorage persistence.
 */

import { createContext, useContext, useReducer, useEffect } from 'react'

const AppContext = createContext(null)

const STORAGE_KEY = 'plantscout_state'

const initialState = {
  homeLocation: null,     // { label, value } — selected city
  homeClimate: null,      // full climate profile from climate.js
  spaceType: 'mixed',     // 'yard' | 'balcony' | 'indoor_only' | 'mixed'
  discoveries: [],        // saved plant discoveries with assessments
  currentTrip: null,      // { name, location, date }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_HOME':
      return { ...state, homeLocation: action.payload.location, homeClimate: action.payload.climate }
    case 'SET_SPACE_TYPE':
      return { ...state, spaceType: action.payload }
    case 'ADD_DISCOVERY':
      return { ...state, discoveries: [action.payload, ...state.discoveries] }
    case 'REMOVE_DISCOVERY':
      return { ...state, discoveries: state.discoveries.filter(d => d.id !== action.payload) }
    case 'SET_TRIP':
      return { ...state, currentTrip: action.payload }
    case 'HYDRATE':
      return { ...state, ...action.payload }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        dispatch({ type: 'HYDRATE', payload: JSON.parse(saved) })
      }
    } catch (e) {
      // ignore parse errors
    }
  }, [])

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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
