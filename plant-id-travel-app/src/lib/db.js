/**
 * Supabase CRUD helpers with device-ID-based anonymous auth.
 * Falls back gracefully if Supabase is not configured.
 */

import { supabase } from './supabase'

const DEVICE_ID_KEY = 'plantscout_device_id'

/** Get or generate a stable device ID */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Get or create a profile for this device */
export async function getOrCreateProfile(deviceId) {
  if (!supabase) return null
  try {
    // Try to find existing
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('device_id', deviceId)
      .single()

    if (existing) return existing

    // Create new
    const { data: created, error } = await supabase
      .from('profiles')
      .insert({ device_id: deviceId })
      .select()
      .single()

    if (error) throw error
    return created
  } catch (err) {
    console.warn('Profile sync failed:', err.message)
    return null
  }
}

/** Update profile fields */
export async function updateProfile(profileId, updates) {
  if (!supabase || !profileId) return null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profileId)
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    console.warn('Profile update failed:', err.message)
    return null
  }
}

// --- Wishlist ---

export async function addToWishlist(profileId, item) {
  if (!supabase || !profileId) return null
  try {
    const { data, error } = await supabase
      .from('wishlist')
      .insert({
        profile_id: profileId,
        plant_name: item.commonName,
        scientific_name: item.scientificName,
        rating: item.rating,
        climate_assessment: item.assessment || null,
        notes: item.notes || null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    console.warn('Wishlist add failed:', err.message)
    return null
  }
}

export async function removeFromWishlist(wishlistId) {
  if (!supabase || !wishlistId) return
  try {
    await supabase.from('wishlist').delete().eq('id', wishlistId)
  } catch (err) {
    console.warn('Wishlist remove failed:', err.message)
  }
}

export async function getWishlist(profileId) {
  if (!supabase || !profileId) return []
  try {
    const { data, error } = await supabase
      .from('wishlist')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('Wishlist fetch failed:', err.message)
    return []
  }
}

// --- Identifications ---

export async function saveIdentification(profileId, data) {
  if (!supabase || !profileId) return null
  try {
    const { data: row, error } = await supabase
      .from('identifications')
      .insert({
        profile_id: profileId,
        plant_name: data.plantName,
        scientific_name: data.scientificName,
        confidence: data.confidence,
        image_url: data.imageUrl || null,
        climate_assessment: data.assessment || null,
        ai_response: data.aiResponse || null,
      })
      .select()
      .single()
    if (error) throw error
    return row
  } catch (err) {
    console.warn('Identification save failed:', err.message)
    return null
  }
}

// --- Chat Messages ---

export async function saveChatMessage(profileId, msg) {
  if (!supabase || !profileId) return null
  try {
    const { error } = await supabase
      .from('chat_messages')
      .insert({
        profile_id: profileId,
        role: msg.role,
        content: msg.content,
        image_url: msg.imageUrl || null,
        plant_context: msg.plantContext || null,
      })
    if (error) throw error
  } catch (err) {
    console.warn('Chat message save failed:', err.message)
  }
}

export async function getChatHistory(profileId, limit = 20) {
  if (!supabase || !profileId) return []
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('Chat history fetch failed:', err.message)
    return []
  }
}
