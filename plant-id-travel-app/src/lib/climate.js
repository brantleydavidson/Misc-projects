/**
 * Multi-Factor Climate Engine
 *
 * The core insight: USDA Hardiness Zones alone are dangerously misleading.
 * Juneau AK, Boston MA, and Santa Fe NM are ALL Zone 7a — but they have
 * completely different growing conditions. A plant that thrives in Boston
 * might die in Santa Fe (arid) or Juneau (low light, short season).
 *
 * This engine combines 6 factors to produce an honest growability assessment:
 *   1. USDA Hardiness Zone (minimum winter temp)
 *   2. AHS Heat Zone (days above 86°F / 30°C)
 *   3. Annual rainfall
 *   4. Humidity regime
 *   5. Soil type tendency
 *   6. Growing season length (frost-free days)
 */

// --- USDA Zone lookup by zip prefix (first 3 digits) ---
// This is a simplified dataset. A real app would use the full USDA shapefile
// or a geocoded API. The USDA's own API is CAPTCHA-gated with no bulk download.
const ZIP_TO_ZONE = {
  // Tennessee / Memphis area
  '380': '7b', '381': '7b', '382': '7b', '383': '7a',
  // New York City area
  '100': '7a', '101': '7a', '102': '7a', '103': '7a', '104': '7a',
  // Boston area
  '021': '6b', '022': '6b', '023': '6b',
  // Chicago area
  '606': '5b', '607': '5b', '608': '5b',
  // Miami area
  '331': '10b', '332': '10b', '333': '10b',
  // Phoenix area
  '850': '9b', '851': '9b', '852': '9a',
  // Seattle area
  '981': '8b', '980': '8b',
  // Denver area
  '802': '5b', '803': '6a',
  // Portland OR area
  '972': '8b', '973': '8b',
  // Los Angeles area
  '900': '10a', '901': '10a', '902': '10a',
  // San Francisco
  '941': '10a', '940': '9b',
  // Houston
  '770': '9a', '771': '9a',
  // Atlanta
  '303': '7b', '304': '7b',
  // Santa Fe
  '875': '7a',
  // Juneau
  '998': '7a',
  // Minneapolis
  '554': '4b', '553': '4b',
  // Savannah
  '314': '8b',
  // Austin
  '787': '8b',
  // Nashville
  '372': '7a',
}

// --- Multi-factor climate profiles for known cities ---
// This is what makes the engine real. Same zone, wildly different climates.
const CITY_CLIMATE_PROFILES = {
  'memphis, tn': {
    zone: '7b', heatZone: 8, annualRainfallIn: 54, humidity: 'high',
    soilType: 'clay', frostFreeDays: 220, avgSummerHighF: 92,
    avgWinterLowF: 31, label: 'Memphis, TN',
    description: 'Humid subtropical — hot sticky summers, mild winters, clay soil',
  },
  'boston, ma': {
    zone: '6b', heatZone: 5, annualRainfallIn: 44, humidity: 'moderate',
    soilType: 'loam', frostFreeDays: 170, avgSummerHighF: 82,
    avgWinterLowF: 22, label: 'Boston, MA',
    description: 'Cool maritime — defined seasons, moderate moisture, loamy soil',
  },
  'santa fe, nm': {
    zone: '7a', heatZone: 6, annualRainfallIn: 14, humidity: 'very_low',
    soilType: 'sandy', frostFreeDays: 165, avgSummerHighF: 87,
    avgWinterLowF: 18, label: 'Santa Fe, NM',
    description: 'High desert — dry air, intense sun, alkaline sandy soil, huge temperature swings',
  },
  'juneau, ak': {
    zone: '7a', heatZone: 1, annualRainfallIn: 62, humidity: 'high',
    soilType: 'peat', frostFreeDays: 133, avgSummerHighF: 64,
    avgWinterLowF: 24, label: 'Juneau, AK',
    description: 'Maritime subarctic — cool summers, tons of rain, very short growing season',
  },
  'miami, fl': {
    zone: '10b', heatZone: 11, annualRainfallIn: 62, humidity: 'very_high',
    soilType: 'limestone', frostFreeDays: 365, avgSummerHighF: 91,
    avgWinterLowF: 60, label: 'Miami, FL',
    description: 'Tropical — year-round warmth, wet season, limestone-based soil',
  },
  'phoenix, az': {
    zone: '9b', heatZone: 12, annualRainfallIn: 8, humidity: 'very_low',
    soilType: 'caite', frostFreeDays: 300, avgSummerHighF: 106,
    avgWinterLowF: 43, label: 'Phoenix, AZ',
    description: 'Desert — extreme heat, almost no rain, caliche soil',
  },
  'seattle, wa': {
    zone: '8b', heatZone: 3, annualRainfallIn: 37, humidity: 'moderate',
    soilType: 'loam', frostFreeDays: 250, avgSummerHighF: 76,
    avgWinterLowF: 37, label: 'Seattle, WA',
    description: 'Marine west coast — mild year-round, dry summers, wet winters',
  },
  'chicago, il': {
    zone: '5b', heatZone: 6, annualRainfallIn: 38, humidity: 'moderate',
    soilType: 'clay', frostFreeDays: 175, avgSummerHighF: 84,
    avgWinterLowF: 16, label: 'Chicago, IL',
    description: 'Continental — hot summers, brutal winters, lake effect',
  },
  'denver, co': {
    zone: '5b', heatZone: 5, annualRainfallIn: 15, humidity: 'low',
    soilType: 'clay', frostFreeDays: 157, avgSummerHighF: 88,
    avgWinterLowF: 16, label: 'Denver, CO',
    description: 'Semi-arid steppe — intense sun, low humidity, alkaline clay',
  },
  'houston, tx': {
    zone: '9a', heatZone: 10, annualRainfallIn: 50, humidity: 'very_high',
    soilType: 'clay', frostFreeDays: 290, avgSummerHighF: 94,
    avgWinterLowF: 42, label: 'Houston, TX',
    description: 'Humid subtropical — extreme heat and humidity, clay soil, flooding risk',
  },
  'atlanta, ga': {
    zone: '7b', heatZone: 7, annualRainfallIn: 50, humidity: 'high',
    soilType: 'clay', frostFreeDays: 225, avgSummerHighF: 89,
    avgWinterLowF: 33, label: 'Atlanta, GA',
    description: 'Humid subtropical — hot summers, mild winters, red clay',
  },
  'portland, or': {
    zone: '8b', heatZone: 3, annualRainfallIn: 43, humidity: 'moderate',
    soilType: 'loam', frostFreeDays: 240, avgSummerHighF: 81,
    avgWinterLowF: 36, label: 'Portland, OR',
    description: 'Marine — mild temps, dry summer, wet winter, rich volcanic soil',
  },
  'los angeles, ca': {
    zone: '10a', heatZone: 7, annualRainfallIn: 15, humidity: 'low',
    soilType: 'sandy', frostFreeDays: 330, avgSummerHighF: 84,
    avgWinterLowF: 48, label: 'Los Angeles, CA',
    description: 'Mediterranean — mild and dry, low rainfall, sandy soil',
  },
  'san francisco, ca': {
    zone: '10a', heatZone: 2, annualRainfallIn: 24, humidity: 'moderate',
    soilType: 'sandy', frostFreeDays: 310, avgSummerHighF: 68,
    avgWinterLowF: 46, label: 'San Francisco, CA',
    description: 'Cool Mediterranean — fog-cooled summers, very mild winters',
  },
  'minneapolis, mn': {
    zone: '4b', heatZone: 5, annualRainfallIn: 31, humidity: 'moderate',
    soilType: 'loam', frostFreeDays: 155, avgSummerHighF: 83,
    avgWinterLowF: 3, label: 'Minneapolis, MN',
    description: 'Continental — extreme cold winters, pleasant summers, good soil',
  },
  'savannah, ga': {
    zone: '8b', heatZone: 9, annualRainfallIn: 49, humidity: 'high',
    soilType: 'sandy', frostFreeDays: 270, avgSummerHighF: 92,
    avgWinterLowF: 39, label: 'Savannah, GA',
    description: 'Humid subtropical — long warm season, sandy coastal soil',
  },
  'austin, tx': {
    zone: '8b', heatZone: 9, annualRainfallIn: 34, humidity: 'moderate',
    soilType: 'clay', frostFreeDays: 270, avgSummerHighF: 96,
    avgWinterLowF: 38, label: 'Austin, TX',
    description: 'Subtropical semi-arid — scorching summers, mild winters, limestone clay',
  },
  'nashville, tn': {
    zone: '7a', heatZone: 7, annualRainfallIn: 48, humidity: 'high',
    soilType: 'clay', frostFreeDays: 200, avgSummerHighF: 90,
    avgWinterLowF: 28, label: 'Nashville, TN',
    description: 'Humid subtropical — hot summers, cold-ish winters, limestone clay',
  },
}

/**
 * Parse a zone string like "7b" into a numeric value for comparison.
 * Zones range from 1a (coldest) to 13b (warmest).
 * a = .0, b = .5 — so 7a = 7.0, 7b = 7.5
 */
export function zoneToNumber(zone) {
  if (!zone) return null
  const match = zone.match(/^(\d+)(a|b)?$/i)
  if (!match) return null
  return parseInt(match[1]) + (match[2]?.toLowerCase() === 'b' ? 0.5 : 0)
}

/**
 * Look up a climate profile by city name or zip code.
 */
export function getClimateProfile(location) {
  if (!location) return null

  const normalized = location.toLowerCase().trim()

  // Try exact city match
  if (CITY_CLIMATE_PROFILES[normalized]) {
    return { ...CITY_CLIMATE_PROFILES[normalized] }
  }

  // Try partial city match
  for (const [key, profile] of Object.entries(CITY_CLIMATE_PROFILES)) {
    if (normalized.includes(key.split(',')[0]) || key.includes(normalized)) {
      return { ...profile }
    }
  }

  // Try zip code
  const zipMatch = normalized.match(/\d{5}/)
  if (zipMatch) {
    const prefix = zipMatch[0].substring(0, 3)
    const zone = ZIP_TO_ZONE[prefix]
    if (zone) {
      return {
        zone,
        heatZone: null,
        annualRainfallIn: null,
        humidity: null,
        soilType: null,
        frostFreeDays: null,
        avgSummerHighF: null,
        avgWinterLowF: null,
        label: `ZIP ${zipMatch[0]}`,
        description: `USDA Zone ${zone} (limited data — only zone available for this location)`,
        partialData: true,
      }
    }
  }

  return null
}

/**
 * The core growability assessment.
 *
 * Takes a plant's requirements and the user's home climate profile,
 * and returns a multi-factor compatibility score with honest reasoning.
 */
export function assessGrowability(plant, homeClimate) {
  const factors = []
  let overallScore = 0
  let maxScore = 0

  // Factor 1: Hardiness Zone
  const plantMinZone = zoneToNumber(plant.hardinessRange?.[0])
  const plantMaxZone = zoneToNumber(plant.hardinessRange?.[1])
  const homeZone = zoneToNumber(homeClimate.zone)

  if (plantMinZone != null && plantMaxZone != null && homeZone != null) {
    maxScore += 30
    if (homeZone >= plantMinZone && homeZone <= plantMaxZone) {
      overallScore += 30
      factors.push({
        name: 'Winter Hardiness',
        status: 'pass',
        detail: `Your zone ${homeClimate.zone} is within this plant's range (${plant.hardinessRange[0]}–${plant.hardinessRange[1]}).`,
      })
    } else if (homeZone < plantMinZone) {
      const deficit = plantMinZone - homeZone
      if (deficit <= 1) {
        overallScore += 15
        factors.push({
          name: 'Winter Hardiness',
          status: 'warn',
          detail: `Your zone ${homeClimate.zone} is slightly colder than ideal (needs ${plant.hardinessRange[0]}+). May survive with winter protection.`,
        })
      } else {
        factors.push({
          name: 'Winter Hardiness',
          status: 'fail',
          detail: `Your zone ${homeClimate.zone} is too cold — this plant needs Zone ${plant.hardinessRange[0]} or warmer. Your winters will kill it.`,
        })
      }
    } else {
      overallScore += 20
      factors.push({
        name: 'Winter Hardiness',
        status: 'warn',
        detail: `Your zone ${homeClimate.zone} is warmer than this plant's ideal range. It may not get the winter chill it needs.`,
      })
    }
  }

  // Factor 2: Heat tolerance
  if (plant.maxHeatZone != null && homeClimate.heatZone != null) {
    maxScore += 20
    if (homeClimate.heatZone <= plant.maxHeatZone) {
      overallScore += 20
      factors.push({
        name: 'Summer Heat',
        status: 'pass',
        detail: `Your heat zone (${homeClimate.heatZone}) is within tolerance (max ${plant.maxHeatZone}).`,
      })
    } else {
      const excess = homeClimate.heatZone - plant.maxHeatZone
      if (excess <= 2) {
        overallScore += 10
        factors.push({
          name: 'Summer Heat',
          status: 'warn',
          detail: `Your summers (heat zone ${homeClimate.heatZone}) are hotter than ideal (max ${plant.maxHeatZone}). Afternoon shade helps.`,
        })
      } else {
        factors.push({
          name: 'Summer Heat',
          status: 'fail',
          detail: `Your summers are significantly hotter than this plant can handle. Heat zone ${homeClimate.heatZone} vs. max ${plant.maxHeatZone}.`,
        })
      }
    }
  }

  // Factor 3: Water / Rainfall
  if (plant.waterNeeds && homeClimate.annualRainfallIn != null) {
    maxScore += 15
    const rainfall = homeClimate.annualRainfallIn
    if (plant.waterNeeds === 'low' && rainfall > 40) {
      overallScore += 5
      factors.push({
        name: 'Water / Rainfall',
        status: 'warn',
        detail: `This plant prefers dry conditions but your area gets ${rainfall}" of rain/year. Good drainage is essential.`,
      })
    } else if (plant.waterNeeds === 'high' && rainfall < 25) {
      overallScore += 5
      factors.push({
        name: 'Water / Rainfall',
        status: 'warn',
        detail: `This plant needs consistent moisture but your area only gets ${rainfall}"/year. You'll need to supplement with irrigation.`,
      })
    } else {
      overallScore += 15
      factors.push({
        name: 'Water / Rainfall',
        status: 'pass',
        detail: `Your rainfall (${rainfall}"/year) suits this plant's ${plant.waterNeeds} water needs.`,
      })
    }
  }

  // Factor 4: Humidity
  if (plant.humidityPref && homeClimate.humidity) {
    maxScore += 15
    const humidityLevels = { very_low: 1, low: 2, moderate: 3, high: 4, very_high: 5 }
    const homeLvl = humidityLevels[homeClimate.humidity] || 3
    const plantLvl = humidityLevels[plant.humidityPref] || 3
    const diff = Math.abs(homeLvl - plantLvl)
    if (diff <= 1) {
      overallScore += 15
      factors.push({
        name: 'Humidity',
        status: 'pass',
        detail: `Your ${homeClimate.humidity} humidity suits this plant.`,
      })
    } else if (diff === 2) {
      overallScore += 8
      factors.push({
        name: 'Humidity',
        status: 'warn',
        detail: `This plant prefers ${plant.humidityPref} humidity but your area is ${homeClimate.humidity}. Manageable with some effort.`,
      })
    } else {
      factors.push({
        name: 'Humidity',
        status: 'fail',
        detail: `Serious mismatch — this plant needs ${plant.humidityPref} humidity but your area is ${homeClimate.humidity}.`,
      })
    }
  }

  // Factor 5: Soil
  if (plant.soilPref && homeClimate.soilType) {
    maxScore += 10
    if (plant.soilPref.includes(homeClimate.soilType)) {
      overallScore += 10
      factors.push({
        name: 'Soil',
        status: 'pass',
        detail: `Your ${homeClimate.soilType} soil works for this plant.`,
      })
    } else {
      overallScore += 5
      factors.push({
        name: 'Soil',
        status: 'warn',
        detail: `This plant prefers ${plant.soilPref.join('/')} soil, but your area tends toward ${homeClimate.soilType}. Amend with compost or use raised beds.`,
      })
    }
  }

  // Factor 6: Growing season length
  if (plant.minFrostFreeDays != null && homeClimate.frostFreeDays != null) {
    maxScore += 10
    if (homeClimate.frostFreeDays >= plant.minFrostFreeDays) {
      overallScore += 10
      factors.push({
        name: 'Growing Season',
        status: 'pass',
        detail: `Your ${homeClimate.frostFreeDays} frost-free days exceed the ${plant.minFrostFreeDays} this plant needs.`,
      })
    } else {
      factors.push({
        name: 'Growing Season',
        status: 'fail',
        detail: `Your growing season (${homeClimate.frostFreeDays} frost-free days) is shorter than the ${plant.minFrostFreeDays} days this plant needs.`,
      })
    }
  }

  // Calculate overall rating
  const pct = maxScore > 0 ? (overallScore / maxScore) * 100 : 0
  const failCount = factors.filter(f => f.status === 'fail').length
  const warnCount = factors.filter(f => f.status === 'warn').length

  let rating, ratingLabel, ratingColor
  if (failCount >= 2 || pct < 30) {
    rating = 'not_recommended'
    ratingLabel = 'Not Recommended'
    ratingColor = 'red'
  } else if (failCount === 1 && pct < 50) {
    rating = 'indoor_only'
    ratingLabel = 'Indoor Only'
    ratingColor = 'blue'
  } else if (pct >= 80 && failCount === 0) {
    rating = 'perfect'
    ratingLabel = 'Perfect Match'
    ratingColor = 'green'
  } else {
    rating = 'possible'
    ratingLabel = 'Will Work With Care'
    ratingColor = 'amber'
  }

  // The "gotcha" warning — when zone says yes but everything else says no
  let zoneGotcha = null
  const zonePass = factors.find(f => f.name === 'Winter Hardiness')?.status === 'pass'
  const otherFails = factors.filter(f => f.name !== 'Winter Hardiness' && f.status === 'fail')
  if (zonePass && otherFails.length >= 2) {
    zoneGotcha = `Your USDA zone (${homeClimate.zone}) is technically compatible, but ${otherFails.length} other climate factors are problematic. This is why zone alone isn't enough — ${homeClimate.description || 'your local conditions'} matter just as much as winter lows.`
  }

  return {
    rating,
    ratingLabel,
    ratingColor,
    scorePct: Math.round(pct),
    factors,
    zoneGotcha,
    homeClimate,
    partialData: homeClimate.partialData || false,
  }
}

/**
 * Determine placement recommendation based on assessment.
 */
export function getPlacementAdvice(assessment, plant) {
  const { rating } = assessment
  const home = assessment.homeClimate

  if (rating === 'not_recommended') {
    return {
      placement: 'Not viable outdoors or indoors easily',
      advice: `This plant's needs are too far from your local conditions. Consider looking for a native alternative that gives a similar look.`,
    }
  }

  if (rating === 'indoor_only') {
    return {
      placement: 'Indoor pot near a bright window',
      advice: `Keep indoors where you can control temperature and humidity. A south or east-facing window is ideal. Consider a humidity tray if your home air is dry.`,
    }
  }

  if (rating === 'perfect') {
    const spots = []
    if (plant.size === 'large') spots.push('garden bed', 'large planter')
    else if (plant.size === 'medium') spots.push('garden bed', 'raised bed', 'large container')
    else spots.push('container', 'window box', 'raised bed')

    return {
      placement: spots.join(' or '),
      advice: `Great match for outdoor growing! Plant after last frost${home.frostFreeDays ? ` (~${Math.round(365 - home.frostFreeDays)} frost days means roughly late March/early April for your area)` : ''}.`,
    }
  }

  // "possible" — needs some extra care
  const tips = []
  for (const factor of assessment.factors) {
    if (factor.status === 'warn') {
      if (factor.name === 'Summer Heat') tips.push('provide afternoon shade')
      if (factor.name === 'Water / Rainfall') tips.push('set up supplemental watering')
      if (factor.name === 'Humidity') tips.push('mist regularly or use a pebble tray')
      if (factor.name === 'Soil') tips.push('amend soil with compost')
    }
  }

  return {
    placement: 'Outdoor with modifications — or container for easy control',
    advice: `Can work if you ${tips.join(', ')}.`,
  }
}

/**
 * Get list of available city profiles for the UI dropdown.
 */
export function getAvailableCities() {
  return Object.values(CITY_CLIMATE_PROFILES)
    .map(p => ({ label: p.label, value: p.label.toLowerCase() }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
