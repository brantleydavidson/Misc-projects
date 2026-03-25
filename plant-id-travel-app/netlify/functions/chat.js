import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildSystemPrompt(plantContext, homeClimate) {
  let prompt = `You are a friendly, knowledgeable plant advisor helping someone figure out if plants they discover while traveling can thrive at their home. You give practical, honest advice.

Format your responses using simple markdown:
- Use **bold** for emphasis and plant names
- Use *italic* for scientific names
- Use > for important warnings or gotchas
- Use - for bullet lists
- For climate factor assessments, use this exact format (one per line):
  + **Factor Name:** positive detail
  ~ **Factor Name:** cautionary detail
  x **Factor Name:** negative detail

Keep responses conversational but informative. Be honest about limitations.`

  if (plantContext) {
    prompt += `\n\nCurrent plant being discussed:
- Common name: ${plantContext.commonName}
- Scientific name: ${plantContext.scientificName}
- Family: ${plantContext.family || 'unknown'}
- Hardiness zones: ${plantContext.hardinessRange?.join(' to ') || 'unknown'}
- Max heat zone: ${plantContext.maxHeatZone || 'unknown'}
- Water needs: ${plantContext.waterNeeds || 'unknown'}
- Humidity preference: ${plantContext.humidityPref || 'unknown'}
- Soil preference: ${plantContext.soilPref?.join(', ') || 'unknown'}
- Min frost-free days: ${plantContext.minFrostFreeDays || 'unknown'}
- Sun needs: ${plantContext.sunNeeds || 'unknown'}
- Size: ${plantContext.size || 'unknown'}
- Care notes: ${plantContext.careNotes || 'none'}`
  }

  if (homeClimate) {
    prompt += `\n\nUser's home climate profile:
- Location: ${homeClimate.label || 'unknown'}
- USDA Zone: ${homeClimate.zone || 'unknown'}
- AHS Heat Zone: ${homeClimate.heatZone || 'unknown'}
- Annual rainfall: ${homeClimate.annualRainfallIn || 'unknown'} inches
- Humidity: ${homeClimate.humidity || 'unknown'}
- Soil type: ${homeClimate.soilType || 'unknown'}
- Frost-free days: ${homeClimate.frostFreeDays || 'unknown'}
- Avg summer high: ${homeClimate.avgSummerHighF || 'unknown'}°F
- Avg winter low: ${homeClimate.avgWinterLowF || 'unknown'}°F`
  }

  return prompt
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { message, history, plantContext, homeClimate } = JSON.parse(event.body)

    if (!message) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No message provided' }) }
    }

    // Build messages from history (limit to last 10 for token efficiency)
    const messages = []
    const recentHistory = (history || []).slice(-10)
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'bot' ? 'assistant' : 'user',
        content: msg.text || msg.content || '',
      })
    }
    // Add current message
    messages.push({ role: 'user', content: message })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: buildSystemPrompt(plantContext, homeClimate),
      messages,
    })

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ response: response.content[0].text }),
    }
  } catch (err) {
    console.error('Chat error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Chat failed', detail: err.message }),
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
