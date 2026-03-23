/**
 * Plant Chat Engine — LLM-like conversational experience for travel mode.
 *
 * In a production app, this would call the Claude API with a system prompt
 * that includes the plant data + climate profile. For the MVP, we simulate
 * intelligent responses based on the identified plant and user's home climate.
 */

import { assessGrowability, getPlacementAdvice } from './climate'

/**
 * Generate a chat response based on the conversation context.
 * Simulates an LLM with plant + climate awareness.
 */
export function generateChatResponse(message, context) {
  const { plant, homeClimate, identificationResult } = context
  const msg = message.toLowerCase()

  // Simulate typing delay
  return new Promise(resolve => {
    const delay = 800 + Math.random() * 1200
    setTimeout(() => {
      resolve(pickResponse(msg, plant, homeClimate, identificationResult))
    }, delay)
  })
}

function pickResponse(msg, plant, homeClimate, idResult) {
  if (!plant) {
    return "I don't have a plant identified yet. Take a photo or select a plant first, and then I can answer your questions!"
  }

  // Identification questions
  if (msg.match(/what (is|plant|kind|species|type)|identify|tell me about/)) {
    return formatIdentification(plant, idResult)
  }

  // Growability / can I grow it
  if (msg.match(/can i grow|will it (grow|work|survive)|grow.*(home|my|yard|garden|patio|balcon)/)) {
    if (!homeClimate) {
      return "I'd love to tell you! Set your home location first so I can check your climate conditions."
    }
    return formatGrowability(plant, homeClimate)
  }

  // Where to plant / placement
  if (msg.match(/where.*(put|plant|place|grow)|indoor|outdoor|container|pot|planter/)) {
    if (!homeClimate) {
      return "Set your home location and I can give you specific placement advice for your conditions."
    }
    const assessment = assessGrowability(plant, homeClimate)
    const placement = getPlacementAdvice(assessment, plant)
    return `**Recommended placement:** ${placement.placement}\n\n${placement.advice}\n\n**Sun needs:** ${plant.sunNeeds}`
  }

  // Care / how to care for it
  if (msg.match(/care|water|sun|soil|fertiliz|prun|maintain/)) {
    return formatCare(plant, homeClimate)
  }

  // Alternative / substitute suggestions
  if (msg.match(/alternative|substitute|similar|instead|native|replace/)) {
    return formatAlternatives(plant, homeClimate)
  }

  // Zone specific
  if (msg.match(/zone|hardiness|cold|winter|frost|freeze/)) {
    return formatZoneInfo(plant, homeClimate)
  }

  // Poisonous / toxic / pets / children
  if (msg.match(/toxic|poison|pet|dog|cat|child|safe|edible/)) {
    return `I don't have toxicity data for ${plant.commonName} in my current database. For pet and child safety, always check the ASPCA toxic plant database or consult your local poison control center before bringing any new plant home.`
  }

  // Season / when to plant
  if (msg.match(/when|season|time|month|spring|fall|winter|summer/)) {
    if (!homeClimate) {
      return "Set your home location so I can give you timing specific to your area."
    }
    return formatTiming(plant, homeClimate)
  }

  // Cost / buy
  if (msg.match(/cost|price|buy|where.*(get|find|purchase)|nursery|store/)) {
    return `Pricing and nursery search is coming in a future update. For now, try searching for "${plant.scientificName}" at your local nurseries or online retailers like Monrovia, Proven Winners, or Logee's.`
  }

  // Generic follow-up
  return formatGenericResponse(plant, homeClimate)
}

function formatIdentification(plant, idResult) {
  let msg = `**${plant.commonName}** (*${plant.scientificName}*)\n`
  msg += `Family: ${plant.family}\n\n`
  msg += `${plant.description}\n\n`
  if (idResult?.topMatch?.confidence) {
    msg += `Confidence: ${Math.round(idResult.topMatch.confidence * 100)}%`
    if (idResult.topMatch.confidence < 0.85) {
      msg += ` — I'm not fully certain. Multiple photos of the leaves, flowers, and bark would help me narrow it down.`
    }
  }
  return msg
}

function formatGrowability(plant, homeClimate) {
  const assessment = assessGrowability(plant, homeClimate)
  const placement = getPlacementAdvice(assessment, plant)

  let msg = ''

  // Lead with the verdict
  if (assessment.rating === 'perfect') {
    msg += `**Great news!** ${plant.commonName} is a perfect match for ${homeClimate.label}.\n\n`
  } else if (assessment.rating === 'possible') {
    msg += `**It can work** in ${homeClimate.label}, but it'll need some extra attention.\n\n`
  } else if (assessment.rating === 'indoor_only') {
    msg += `**Outdoors won't work** in ${homeClimate.label}, but you can grow it as a houseplant.\n\n`
  } else {
    msg += `**Unfortunately, no.** ${plant.commonName} isn't a good fit for ${homeClimate.label}.\n\n`
  }

  // The zone gotcha — the real insight
  if (assessment.zoneGotcha) {
    msg += `> **Zone gotcha:** ${assessment.zoneGotcha}\n\n`
  }

  // Factor breakdown
  msg += `**Climate check (${assessment.scorePct}% match):**\n`
  for (const f of assessment.factors) {
    const icon = f.status === 'pass' ? '+' : f.status === 'warn' ? '~' : 'x'
    msg += `${icon} **${f.name}:** ${f.detail}\n`
  }

  msg += `\n**Placement:** ${placement.placement}\n${placement.advice}`

  return msg
}

function formatCare(plant, homeClimate) {
  let msg = `**Caring for ${plant.commonName}:**\n\n`
  msg += `**Sun:** ${plant.sunNeeds}\n`
  msg += `**Water:** ${plant.waterNeeds} — `
  if (plant.waterNeeds === 'low') msg += `let soil dry between waterings.\n`
  else if (plant.waterNeeds === 'high') msg += `keep soil consistently moist.\n`
  else msg += `water when top inch of soil is dry.\n`

  msg += `**Soil:** prefers ${plant.soilPref.join(' or ')}`
  if (homeClimate?.soilType && !plant.soilPref.includes(homeClimate.soilType)) {
    msg += ` (your area tends toward ${homeClimate.soilType} — amend with compost)`
  }
  msg += '\n\n'

  if (plant.careNotes) {
    msg += `**Tips:** ${plant.careNotes}`
  }

  return msg
}

function formatAlternatives(plant, homeClimate) {
  // Hardcoded alternative suggestions for common plants
  const alternatives = {
    'bougainvillea': 'Trumpet Vine (Campsis radicans) — similar vibrant flowers, handles cold zones. Or try Mandevilla in a container.',
    'bird-of-paradise': 'Red Hot Poker (Kniphofia) for a similar dramatic look. Hardy to Zone 5.',
    'plumeria': 'Gardenia for fragrance, or Crape Myrtle for tropical-looking blooms in cold zones.',
    'fiddle-leaf-fig': 'Rubber Plant (Ficus elastica) is similar but much more forgiving indoors.',
    'monstera': 'Pothos (Epipremnum) for a similar trailing/climbing look, way easier to keep alive.',
  }

  const alt = alternatives[plant.id]
  if (alt) {
    return `**Alternatives to ${plant.commonName}:**\n\n${alt}\n\nThese will give you a similar vibe while being better adapted to your conditions.`
  }

  return `${plant.commonName} is already fairly adaptable! If you want something similar but native to your area, check with your local native plant society or extension office — they'll know the best lookalikes for your specific region.`
}

function formatZoneInfo(plant, homeClimate) {
  let msg = `**${plant.commonName} zone info:**\n\n`
  msg += `Hardy in USDA Zones ${plant.hardinessRange[0]} through ${plant.hardinessRange[1]}\n`
  msg += `Max heat zone: ${plant.maxHeatZone}\n`
  msg += `Minimum frost-free days needed: ${plant.minFrostFreeDays}\n\n`

  if (homeClimate) {
    msg += `Your home (${homeClimate.label}) is Zone ${homeClimate.zone}`
    if (homeClimate.heatZone) msg += `, heat zone ${homeClimate.heatZone}`
    msg += `.\n\n`
    msg += `**But remember:** zone is only one factor. ${homeClimate.description || 'Your local humidity, rainfall, soil, and summer heat all matter too.'}`
  }

  return msg
}

function formatTiming(plant, homeClimate) {
  const ffDays = homeClimate.frostFreeDays || 200
  const lastFrostApprox = ffDays > 280 ? 'rarely freezes' :
    ffDays > 240 ? 'late February' :
    ffDays > 200 ? 'mid March' :
    ffDays > 170 ? 'mid April' :
    'early May'

  let msg = `**When to plant ${plant.commonName} in ${homeClimate.label}:**\n\n`
  msg += `Your last frost is approximately ${lastFrostApprox} (${ffDays} frost-free days/year).\n\n`

  if (plant.hardinessRange && plant.size === 'large') {
    msg += `For trees/large shrubs, fall planting (September-October) often works best — roots establish over winter.\n`
  } else {
    msg += `Plant after your last frost date. Spring is ideal for most establishing plants.\n`
  }

  if (homeClimate.avgSummerHighF > 90) {
    msg += `\n**Hot summer warning:** Avoid planting in June-August in ${homeClimate.label}. The heat stress makes it hard for new plants to establish.`
  }

  return msg
}

function formatGenericResponse(plant, homeClimate) {
  const prompts = [
    `I can tell you more about **${plant.commonName}**. Try asking:\n- "Can I grow this at home?"\n- "How do I care for it?"\n- "What are some alternatives?"\n- "When should I plant it?"`,
    `Want to know if **${plant.commonName}** will thrive in your garden? Ask me about growability, care tips, or alternatives!`,
    `**${plant.commonName}** — ${plant.description}\n\nWhat would you like to know? I can help with growing conditions, care, placement, or suggest alternatives.`,
  ]
  return prompts[Math.floor(Math.random() * prompts.length)]
}
