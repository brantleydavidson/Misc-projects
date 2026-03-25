import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a plant identification expert. Analyze the provided plant photo and return a JSON object identifying the plant.

Return ONLY valid JSON matching this exact schema:
{
  "id": "kebab-case-name",
  "commonName": "Common Name",
  "scientificName": "Genus species",
  "family": "Family Name",
  "confidence": 0.92,
  "hardinessRange": ["5a", "9b"],
  "maxHeatZone": 9,
  "waterNeeds": "low" | "moderate" | "high",
  "humidityPref": "very_low" | "low" | "moderate" | "high" | "very_high",
  "soilPref": ["loam", "sandy"],
  "minFrostFreeDays": 150,
  "sunNeeds": "full sun" | "partial shade" | "full shade" | "partial shade to full sun",
  "size": "small" | "medium" | "large",
  "description": "2-3 sentence description of the plant",
  "careNotes": "Key care tips for growing this plant",
  "alternatives": [
    {
      "id": "alt-name",
      "commonName": "Alternative Name",
      "scientificName": "Genus species",
      "confidence": 0.45
    }
  ]
}

Important:
- hardinessRange is [min_zone, max_zone] using USDA zone strings like "5b", "9a", "11b"
- maxHeatZone is an AHS heat zone number (1-12)
- soilPref is an array of preferred soil types from: loam, sandy, clay, peat, chalk, silt
- confidence is a number between 0 and 1
- alternatives should include 2-3 other possible identifications with lower confidence
- Be accurate with hardiness zones and growing requirements - gardeners rely on this data
- Return ONLY the JSON object, no markdown formatting or code blocks`

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

    const { image, mimeType } = JSON.parse(event.body)

    if (!image) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No image provided' }) }
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: 'Identify this plant and return the JSON object with all growing requirements.',
            },
          ],
        },
      ],
    })

    const text = response.content[0].text
    // Parse JSON, handling potential markdown code block wrapping
    const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(jsonStr)

    // Separate the main plant from alternatives
    const { alternatives, ...plant } = result

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        topMatch: { ...plant, confidence: plant.confidence || 0.9 },
        alternatives: alternatives || [],
      }),
    }
  } catch (err) {
    console.error('Identify error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to identify plant', detail: err.message }),
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
