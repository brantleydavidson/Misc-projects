import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a plant recommendation expert. Given a user's climate profile and space type, recommend 6-8 plants that will thrive in their conditions.

Return ONLY valid JSON — an array of plant objects matching this schema:
[
  {
    "id": "kebab-case-name",
    "commonName": "Common Name",
    "scientificName": "Genus species",
    "family": "Family Name",
    "hardinessRange": ["5a", "9b"],
    "maxHeatZone": 9,
    "waterNeeds": "low" | "moderate" | "high",
    "humidityPref": "very_low" | "low" | "moderate" | "high" | "very_high",
    "soilPref": ["loam", "sandy"],
    "minFrostFreeDays": 150,
    "sunNeeds": "full sun" | "partial shade" | "full shade" | "partial shade to full sun",
    "size": "small" | "medium" | "large",
    "description": "2-3 sentence description",
    "careNotes": "Key care tips"
  }
]

Important:
- Recommend plants that are genuinely well-suited to the given climate — don't stretch the truth
- Include a mix of sizes (small, medium, large) appropriate for the space type
- For "balcony" or "indoor_only" spaces, focus on container-friendly plants
- For "yard" or "mixed", include a variety
- hardinessRange uses USDA zone strings like "5b", "9a"
- soilPref array from: loam, sandy, clay, peat, chalk, silt
- Be accurate with all growing requirements
- Return ONLY the JSON array, no markdown formatting or code blocks`

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) }
    }
    const anthropic = new Anthropic({ apiKey })

    const { homeClimate, spaceType } = JSON.parse(event.body)

    if (!homeClimate) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No climate profile provided' }) }
    }

    const userPrompt = `Recommend plants for this location and space:

Climate:
- Location: ${homeClimate.label || 'unknown'}
- USDA Zone: ${homeClimate.zone}
- AHS Heat Zone: ${homeClimate.heatZone}
- Annual rainfall: ${homeClimate.annualRainfallIn}" per year
- Humidity: ${homeClimate.humidity}
- Soil type: ${homeClimate.soilType}
- Frost-free days: ${homeClimate.frostFreeDays}
- Avg summer high: ${homeClimate.avgSummerHighF}°F
- Avg winter low: ${homeClimate.avgWinterLowF}°F

Space type: ${spaceType || 'mixed'}

Recommend 6-8 plants that will genuinely thrive here. Return only the JSON array.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].text
    const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const recommendations = JSON.parse(jsonStr)

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ recommendations }),
    }
  } catch (err) {
    console.error('Recommend error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Recommendation failed', detail: err.message }),
    }
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}
