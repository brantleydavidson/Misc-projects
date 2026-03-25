import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Camera, Send, Leaf, ImagePlus, Loader2, MapPin } from 'lucide-react'
import { useApp } from '../lib/store'
import { getPlantById, getAllPlants } from '../lib/plants'
import { assessGrowability } from '../lib/climate'
import { identifyPlantAI, chatWithAI, resizeImage } from '../lib/api'
import { saveChatMessage, saveIdentification } from '../lib/db'

export default function TravelChat() {
  const location = useLocation()
  const { state } = useApp()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [currentPlant, setCurrentPlant] = useState(null)
  const [showPlantPicker, setShowPlantPicker] = useState(false)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)

  // Initialize with plant from navigation state
  useEffect(() => {
    if (location.state?.plantId) {
      const plant = getPlantById(location.state.plantId)
      if (plant) {
        setCurrentPlant(plant)
        addBotMessage(`I see you're looking at **${plant.commonName}** (*${plant.scientificName}*). ${plant.description}\n\nWhat would you like to know? I can tell you:\n- Can you grow it at home?\n- Care tips\n- Alternatives\n- When to plant it`)
      }
    } else if (location.state?.plant) {
      // Support passing full plant object (from AI identification)
      const plant = location.state.plant
      setCurrentPlant(plant)
      addBotMessage(`I see you're looking at **${plant.commonName}** (*${plant.scientificName}*). ${plant.description}\n\nWhat would you like to know?`)
    } else {
      addBotMessage("Welcome to Travel Mode! Snap a photo of a plant you've spotted, or select one from the catalog to start chatting.")
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  function addBotMessage(text) {
    setMessages(prev => [...prev, { role: 'bot', text, ts: Date.now() }])
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show the photo in chat
    const url = URL.createObjectURL(file)
    setMessages(prev => [...prev, { role: 'user', text: '(photo)', image: url, ts: Date.now() }])
    setIsTyping(true)

    try {
      // Resize and convert to base64
      const { base64, mimeType } = await resizeImage(file)

      // Call AI identification
      const result = await identifyPlantAI(base64, mimeType, state.homeClimate)
      const plant = result.topMatch
      setCurrentPlant(plant)

      // Run local climate assessment if we have home climate
      let assessmentMsg = ''
      if (state.homeClimate) {
        const assessment = assessGrowability(plant, state.homeClimate)
        assessmentMsg = `\n\n**Quick assessment for ${state.homeClimate.label}:** ${assessment.ratingLabel} (${assessment.scorePct}% match)`

        // Save identification to Supabase
        if (state.profileId) {
          saveIdentification(state.profileId, {
            plantName: plant.commonName,
            scientificName: plant.scientificName,
            confidence: plant.confidence,
            assessment,
          })
        }
      }

      const conf = Math.round((plant.confidence || 0.9) * 100)
      let msg = `I'm ${conf}% confident this is **${plant.commonName}** (*${plant.scientificName}*).

${plant.description}${assessmentMsg}`

      if (result.alternatives?.length > 0) {
        msg += `\n\n**Other possibilities:**\n`
        for (const alt of result.alternatives) {
          msg += `- ${alt.commonName} (${Math.round((alt.confidence || 0.3) * 100)}%)\n`
        }
      }

      msg += `\n\nAsk me anything about this plant — like "Can I grow this at home?"`
      addBotMessage(msg)

      // Save messages to Supabase
      if (state.profileId) {
        saveChatMessage(state.profileId, { role: 'user', content: '(photo)', plantContext: plant.commonName })
        saveChatMessage(state.profileId, { role: 'bot', content: msg, plantContext: plant.commonName })
      }
    } catch (err) {
      console.error('Photo identification error:', err)
      addBotMessage("Sorry, I couldn't identify that plant. Try a clearer photo with good lighting, or select from the catalog.")
    }
    setIsTyping(false)
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleSelectPlant(plant) {
    setCurrentPlant(plant)
    setShowPlantPicker(false)
    setMessages(prev => [...prev, { role: 'user', text: `Tell me about ${plant.commonName}`, ts: Date.now() }])
    addBotMessage(`**${plant.commonName}** (*${plant.scientificName}*)\n\n${plant.description}\n\nWhat would you like to know? Try:\n- "Can I grow this at home?"\n- "How do I care for it?"\n- "What are alternatives?"`)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text) return

    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }])
    setInput('')
    setIsTyping(true)

    try {
      // Build history for context (last 10 messages)
      const history = messages.slice(-10).map(m => ({
        role: m.role === 'bot' ? 'bot' : 'user',
        text: m.text,
      }))

      const response = await chatWithAI(text, history, currentPlant, state.homeClimate)
      addBotMessage(response)

      // Save to Supabase
      if (state.profileId) {
        saveChatMessage(state.profileId, { role: 'user', content: text, plantContext: currentPlant?.commonName })
        saveChatMessage(state.profileId, { role: 'bot', content: response, plantContext: currentPlant?.commonName })
      }
    } catch (err) {
      console.error('Chat error:', err)
      addBotMessage("Something went wrong. Try again?")
    }
    setIsTyping(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <div className="bg-green-700 text-white px-5 py-3 flex items-center gap-3 shrink-0">
        <Camera size={20} />
        <div className="flex-1">
          <h1 className="text-sm font-semibold">Travel Mode</h1>
          {currentPlant ? (
            <p className="text-green-200 text-xs">{currentPlant.commonName}</p>
          ) : (
            <p className="text-green-200 text-xs">Snap or select a plant</p>
          )}
        </div>
        {state.homeClimate && (
          <div className="text-right text-xs">
            <div className="flex items-center gap-1 text-green-200">
              <MapPin size={10} />
              <span>{state.homeClimate.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-36">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-green-700 text-white rounded-br-md'
                  : 'bg-slate-100 text-slate-700 rounded-bl-md'
              }`}
            >
              {msg.image && (
                <img src={msg.image} alt="Plant photo" className="w-48 h-48 object-cover rounded-lg mb-2" />
              )}
              {msg.role === 'bot' ? (
                <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                  __html: msg.text
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-amber-400 pl-2 my-1 text-amber-800 bg-amber-50 rounded-r p-2 text-xs">$1</blockquote>')
                    .replace(/^- (.+)$/gm, '<div class="flex gap-1"><span>-</span><span>$1</span></div>')
                    .replace(/^([x~+]) \*\*(.+?):\*\* (.+)$/gm, (_, icon, name, detail) => {
                      const color = icon === '+' ? 'text-green-600' : icon === '~' ? 'text-amber-500' : 'text-red-500'
                      const symbol = icon === '+' ? '&#10003;' : icon === '~' ? '&#9888;' : '&#10007;'
                      return `<div class="flex gap-1.5 items-start my-0.5"><span class="${color}">${symbol}</span><span><strong>${name}:</strong> ${detail}</span></div>`
                    })
                }} />
              ) : (
                <span>{msg.text}</span>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-green-600" />
              <span className="text-xs text-slate-400">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Plant picker overlay */}
      {showPlantPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="w-full max-w-[430px] bg-white rounded-t-2xl p-5 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Select a plant</h3>
              <button onClick={() => setShowPlantPicker(false)} className="text-sm text-slate-400">Cancel</button>
            </div>
            <div className="space-y-2">
              {getAllPlants().map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPlant(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 text-left transition-colors"
                >
                  <Leaf size={16} className="text-green-600 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-slate-700">{p.commonName}</span>
                    <p className="text-xs text-slate-400 italic">{p.scientificName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-slate-200 px-4 py-3 z-40">
        <div className="flex gap-2">
          {/* Photo button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-700 hover:bg-green-100 transition-colors"
          >
            <Camera size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            className="hidden"
          />

          {/* Catalog picker */}
          <button
            onClick={() => setShowPlantPicker(true)}
            className="shrink-0 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <ImagePlus size={18} />
          </button>

          {/* Text input */}
          <div className="flex-1 flex items-center border border-slate-200 rounded-full px-4 focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500">
            <input
              type="text"
              placeholder="Ask about this plant..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 text-sm py-2 outline-none bg-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="text-green-600 disabled:text-slate-300 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
