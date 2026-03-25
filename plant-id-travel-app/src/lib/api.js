/**
 * API client for Netlify Functions.
 * Abstracts the function URLs from UI components.
 */

const BASE = '/api'

/** Identify a plant from a photo */
export async function identifyPlantAI(base64Image, mimeType, homeClimate) {
  const res = await fetch(`${BASE}/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image, mimeType, homeClimate }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Identify failed: ${res.status}`)
  }
  return res.json()
}

/** Send a chat message and get AI response */
export async function chatWithAI(message, history, plantContext, homeClimate) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, plantContext, homeClimate }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Chat failed: ${res.status}`)
  }
  const data = await res.json()
  return data.response
}

/** Get AI plant recommendations for a climate profile */
export async function getRecommendations(homeClimate, spaceType) {
  const res = await fetch(`${BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homeClimate, spaceType }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Recommendations failed: ${res.status}`)
  }
  const data = await res.json()
  return data.recommendations
}

/** Resize an image file to max dimension and return base64 */
export function resizeImage(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      // Get base64 without the data:image/jpeg;base64, prefix
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const base64 = dataUrl.split(',')[1]
      resolve({ base64, mimeType: 'image/jpeg' })
    }
    img.onerror = reject
    img.src = url
  })
}
