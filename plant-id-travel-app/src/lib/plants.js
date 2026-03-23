/**
 * Plant database — curated data for common ornamental and garden plants.
 *
 * Each entry includes the multi-factor growing requirements that the
 * climate engine needs to produce honest assessments.
 */

const PLANTS = [
  {
    id: 'japanese-maple',
    commonName: 'Japanese Maple',
    scientificName: 'Acer palmatum',
    family: 'Sapindaceae',
    hardinessRange: ['5b', '8b'],
    maxHeatZone: 8,
    waterNeeds: 'moderate',
    humidityPref: 'moderate',
    soilPref: ['loam', 'sandy'],
    minFrostFreeDays: 150,
    sunNeeds: 'partial shade to full sun',
    size: 'large',
    description: 'Elegant deciduous tree known for delicate, deeply-lobed leaves that turn brilliant red, orange, or gold in autumn.',
    careNotes: 'Protect from harsh afternoon sun in hot climates. Prefers acidic, well-drained soil. Mulch to keep roots cool.',
    imageKeywords: ['red leaves', 'lobed leaves', 'ornamental tree'],
  },
  {
    id: 'bougainvillea',
    commonName: 'Bougainvillea',
    scientificName: 'Bougainvillea glabra',
    family: 'Nyctaginaceae',
    hardinessRange: ['9b', '11b'],
    maxHeatZone: 12,
    waterNeeds: 'low',
    humidityPref: 'low',
    soilPref: ['sandy', 'loam'],
    minFrostFreeDays: 270,
    sunNeeds: 'full sun',
    size: 'large',
    description: 'Vibrant tropical vine with papery bracts in magenta, purple, red, orange, or white. Iconic in warm coastal areas.',
    careNotes: 'Thrives on neglect — less water means more blooms. Needs strong sun. Cannot survive frost.',
    imageKeywords: ['vibrant bracts', 'climbing vine', 'tropical'],
  },
  {
    id: 'lavender',
    commonName: 'English Lavender',
    scientificName: 'Lavandula angustifolia',
    family: 'Lamiaceae',
    hardinessRange: ['5a', '9a'],
    maxHeatZone: 9,
    waterNeeds: 'low',
    humidityPref: 'low',
    soilPref: ['sandy', 'loam'],
    minFrostFreeDays: 130,
    sunNeeds: 'full sun',
    size: 'small',
    description: 'Fragrant Mediterranean herb with silver-green foliage and purple flower spikes. Beloved by pollinators.',
    careNotes: 'Must have excellent drainage — dies in wet feet. Does poorly in humid climates. Prune after flowering.',
    imageKeywords: ['purple spikes', 'fragrant', 'silvery foliage'],
  },
  {
    id: 'bird-of-paradise',
    commonName: 'Bird of Paradise',
    scientificName: 'Strelitzia reginae',
    family: 'Strelitziaceae',
    hardinessRange: ['10a', '12b'],
    maxHeatZone: 12,
    waterNeeds: 'moderate',
    humidityPref: 'moderate',
    soilPref: ['loam', 'sandy'],
    minFrostFreeDays: 300,
    sunNeeds: 'full sun to partial shade',
    size: 'medium',
    description: 'Striking tropical plant with dramatic orange-and-blue flowers that resemble a bird in flight.',
    careNotes: 'Outdoor in tropical areas only. In colder zones, grow in large container and bring indoors for winter.',
    imageKeywords: ['orange blue flower', 'tropical', 'dramatic'],
  },
  {
    id: 'hydrangea',
    commonName: 'Bigleaf Hydrangea',
    scientificName: 'Hydrangea macrophylla',
    family: 'Hydrangeaceae',
    hardinessRange: ['5b', '9a'],
    maxHeatZone: 9,
    waterNeeds: 'high',
    humidityPref: 'high',
    soilPref: ['loam', 'clay'],
    minFrostFreeDays: 150,
    sunNeeds: 'partial shade',
    size: 'medium',
    description: 'Beloved shrub with huge, showy flower clusters in blue, pink, or white — color changes with soil pH.',
    careNotes: 'Blue flowers in acidic soil, pink in alkaline. Needs consistent moisture. Afternoon shade in hot climates.',
    imageKeywords: ['big flower clusters', 'blue pink', 'shrub'],
  },
  {
    id: 'crepe-myrtle',
    commonName: 'Crepe Myrtle',
    scientificName: 'Lagerstroemia indica',
    family: 'Lythraceae',
    hardinessRange: ['7a', '10a'],
    maxHeatZone: 10,
    waterNeeds: 'moderate',
    humidityPref: 'moderate',
    soilPref: ['loam', 'clay', 'sandy'],
    minFrostFreeDays: 200,
    sunNeeds: 'full sun',
    size: 'large',
    description: 'Southern classic with crinkly, crepe-paper flowers in pink, red, white, or purple. Stunning bark.',
    careNotes: 'Heat lover — thrives in hot summers. Do not "crepe murder" (hard topping). Minimal pruning needed.',
    imageKeywords: ['crinkly flowers', 'smooth bark', 'southern tree'],
  },
  {
    id: 'fiddle-leaf-fig',
    commonName: 'Fiddle-Leaf Fig',
    scientificName: 'Ficus lyrata',
    family: 'Moraceae',
    hardinessRange: ['10b', '12b'],
    maxHeatZone: 12,
    waterNeeds: 'moderate',
    humidityPref: 'high',
    soilPref: ['loam'],
    minFrostFreeDays: 350,
    sunNeeds: 'bright indirect light',
    size: 'large',
    description: 'Trendy houseplant with large, glossy, violin-shaped leaves. Native to West African tropical forests.',
    careNotes: 'Very finicky outdoors outside tropics. As a houseplant: bright indirect light, avoid drafts, consistent watering.',
    imageKeywords: ['large glossy leaves', 'violin shaped', 'indoor tree'],
  },
  {
    id: 'plumeria',
    commonName: 'Plumeria (Frangipani)',
    scientificName: 'Plumeria rubra',
    family: 'Apocynaceae',
    hardinessRange: ['10a', '12b'],
    maxHeatZone: 12,
    waterNeeds: 'low',
    humidityPref: 'moderate',
    soilPref: ['sandy', 'loam'],
    minFrostFreeDays: 300,
    sunNeeds: 'full sun',
    size: 'medium',
    description: 'Fragrant tropical tree with waxy, pinwheel flowers in white, yellow, pink, or red. Hawaiian lei flower.',
    careNotes: 'Cannot take frost. In cold zones, grow in container and overwinter indoors (goes dormant). Needs full sun.',
    imageKeywords: ['waxy flowers', 'fragrant', 'tropical tree', 'lei'],
  },
  {
    id: 'coneflower',
    commonName: 'Purple Coneflower',
    scientificName: 'Echinacea purpurea',
    family: 'Asteraceae',
    hardinessRange: ['3a', '9b'],
    maxHeatZone: 9,
    waterNeeds: 'low',
    humidityPref: 'moderate',
    soilPref: ['loam', 'clay', 'sandy'],
    minFrostFreeDays: 100,
    sunNeeds: 'full sun',
    size: 'small',
    description: 'Tough native wildflower with daisy-like purple-pink petals around a spiky orange cone. Pollinator magnet.',
    careNotes: 'Extremely adaptable. Drought tolerant once established. Deadhead for longer blooming. Native to eastern US.',
    imageKeywords: ['purple petals', 'orange cone', 'wildflower', 'daisy-like'],
  },
  {
    id: 'trumpet-vine',
    commonName: 'Trumpet Vine',
    scientificName: 'Campsis radicans',
    family: 'Bignoniaceae',
    hardinessRange: ['4a', '9b'],
    maxHeatZone: 9,
    waterNeeds: 'moderate',
    humidityPref: 'moderate',
    soilPref: ['loam', 'clay', 'sandy'],
    minFrostFreeDays: 140,
    sunNeeds: 'full sun to partial shade',
    size: 'large',
    description: 'Vigorous native vine with clusters of trumpet-shaped orange-red flowers. Hummingbird favorite.',
    careNotes: 'WARNING: Aggressive grower — can become invasive. Needs strong support. Prune hard to control.',
    imageKeywords: ['trumpet flowers', 'orange red', 'climbing vine'],
  },
  {
    id: 'monstera',
    commonName: 'Monstera (Swiss Cheese Plant)',
    scientificName: 'Monstera deliciosa',
    family: 'Araceae',
    hardinessRange: ['10b', '12b'],
    maxHeatZone: 12,
    waterNeeds: 'moderate',
    humidityPref: 'high',
    soilPref: ['loam'],
    minFrostFreeDays: 340,
    sunNeeds: 'bright indirect light',
    size: 'large',
    description: 'Iconic tropical plant with huge, perforated leaves. The "Swiss cheese" holes develop as leaves mature.',
    careNotes: 'Popular houseplant. Outdoors only in true tropics. Likes to climb — give it a moss pole. Tolerates low light.',
    imageKeywords: ['perforated leaves', 'swiss cheese', 'tropical', 'indoor'],
  },
  {
    id: 'gardenia',
    commonName: 'Gardenia',
    scientificName: 'Gardenia jasminoides',
    family: 'Rubiaceae',
    hardinessRange: ['7b', '10b'],
    maxHeatZone: 10,
    waterNeeds: 'moderate',
    humidityPref: 'high',
    soilPref: ['loam'],
    minFrostFreeDays: 200,
    sunNeeds: 'partial shade to full sun',
    size: 'medium',
    description: 'Intensely fragrant white flowers against glossy dark green foliage. A Southern garden classic.',
    careNotes: 'Needs acidic soil (pH 5.0-6.5). Hates dry air. Prone to pests. Worth the effort for the fragrance.',
    imageKeywords: ['white flowers', 'fragrant', 'glossy leaves', 'southern'],
  },
]

/**
 * Search the plant database by name.
 */
export function searchPlants(query) {
  if (!query) return []
  const q = query.toLowerCase()
  return PLANTS.filter(
    p =>
      p.commonName.toLowerCase().includes(q) ||
      p.scientificName.toLowerCase().includes(q) ||
      p.family.toLowerCase().includes(q) ||
      p.imageKeywords.some(k => k.includes(q))
  )
}

/**
 * Get a plant by ID.
 */
export function getPlantById(id) {
  return PLANTS.find(p => p.id === id) || null
}

/**
 * Get all plants.
 */
export function getAllPlants() {
  return [...PLANTS]
}

/**
 * Simulate an AI plant identification from an image.
 * In a real app, this would call PlantNet or Plant.id API.
 * For the MVP, we return a plausible match with confidence.
 */
export function identifyPlant(imageFile) {
  // Simulate API delay and return a random plant with confidence
  const randomPlant = PLANTS[Math.floor(Math.random() * PLANTS.length)]
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        topMatch: {
          ...randomPlant,
          confidence: 0.87 + Math.random() * 0.1,
        },
        alternatives: PLANTS
          .filter(p => p.id !== randomPlant.id)
          .slice(0, 3)
          .map(p => ({
            ...p,
            confidence: 0.3 + Math.random() * 0.4,
          })),
      })
    }, 1500)
  })
}

export default PLANTS
