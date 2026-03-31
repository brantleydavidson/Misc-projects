import { useState, useRef, useEffect } from 'react';
import {
  MapPin, Search, Send, Loader2, UtensilsCrossed, Star, Navigation,
  ChevronRight, ArrowLeft, Check,
} from 'lucide-react';
import type { UserProfile, ChatMessage, FoodEntry } from '../types';
import { getDailySummary, addFoodEntry } from '../lib/storage';
import { searchNearbyRestaurants, getMealAdvice, type Restaurant } from '../lib/api';

interface EatOutProps {
  profile: UserProfile;
}

// Extract food_log JSON blocks from AI response
interface FoodLogData {
  food_name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  meal_type?: FoodEntry['meal_type'];
  date?: string;
}

function extractFoodLogs(text: string): FoodLogData[] {
  const results: FoodLogData[] = [];
  const regex = /```food_log\s*\n?([\s\S]*?)\n?```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch { /* skip malformed */ }
  }
  return results;
}

function cleanDisplayText(text: string): string {
  return text.replace(/```food_log\s*\n?[\s\S]*?\n?```/g, '').trim();
}

type View = 'search' | 'chat';

export function EatOut({ profile }: EatOutProps) {
  // Location state
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Restaurant search
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [manualName, setManualName] = useState('');

  // Chat / advisor
  const [view, setView] = useState<View>('search');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | { name: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loggedFoods, setLoggedFoods] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Remaining macros
  const summary = getDailySummary();
  const remaining = {
    calories: Math.max(0, (profile.calorie_target || 2000) - summary.calories),
    protein: Math.max(0, (profile.protein_target || 150) - summary.protein),
    carbs: Math.max(0, (profile.carb_target || 200) - summary.carbs),
    fat: Math.max(0, (profile.fat_target || 65) - summary.fat),
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Auto-detect location on mount
  useEffect(() => {
    requestLocation();
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError(err.code === 1 ? 'Location access denied — tap to retry or type a restaurant name' : 'Could not get location');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  // Search restaurants
  async function searchRestaurants(query?: string) {
    if (!location) return;
    setSearching(true);
    try {
      const result = await searchNearbyRestaurants(location.lat, location.lng, query || undefined);
      setRestaurants(result.restaurants);
    } catch {
      // If Places API isn't configured, that's OK — user can type manually
      setRestaurants([]);
    } finally {
      setSearching(false);
    }
  }

  // Auto-search when location is found
  useEffect(() => {
    if (location) {
      searchRestaurants();
    }
  }, [location]);

  // Select restaurant and start chat
  function selectRestaurant(restaurant: Restaurant | { name: string }) {
    setSelectedRestaurant(restaurant);
    setMessages([]);
    setLoggedFoods(new Set());
    setView('chat');
    // Auto-send initial request
    sendAdvisorMessage(restaurant, []);
  }

  // Send message to meal advisor
  async function sendAdvisorMessage(restaurant: Restaurant | { name: string }, prevMessages: ChatMessage[], userText?: string) {
    const msgs = userText
      ? [...prevMessages, { role: 'user' as const, content: userText }]
      : prevMessages;

    if (userText) {
      setMessages(msgs);
    }
    setLoading(true);

    try {
      const todaySummary = getDailySummary();
      const response = await getMealAdvice(restaurant, profile, todaySummary, msgs);
      const assistantMsg: ChatMessage = { role: 'assistant', content: response.message };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I couldn't get recommendations. ${err.message || 'Try again.'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading || !selectedRestaurant) return;
    setInput('');
    sendAdvisorMessage(selectedRestaurant, messages, text);
  }

  function logFoodItem(food: FoodLogData, key: string) {
    const entry: FoodEntry = {
      food_name: food.food_name,
      description: food.description || '',
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber || 0,
      meal_type: food.meal_type || getMealType(),
      confidence: 0.85,
      ai_analysis: `Recommended at ${(selectedRestaurant as any)?.name || 'restaurant'}`,
    };
    addFoodEntry(entry, food.date);
    setLoggedFoods(prev => new Set(prev).add(key));
  }

  function getMealType(): FoodEntry['meal_type'] {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 17) return 'snack';
    return 'dinner';
  }

  // ── Search View ──────────────────────────────────────────────
  if (view === 'search') {
    return (
      <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-neon-pink flex items-center justify-center">
            <UtensilsCrossed size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white font-display">Eat Out</h1>
            <p className="text-xs text-slate-400">AI-powered ordering to hit your macros</p>
          </div>
        </div>

        {/* Remaining macros banner */}
        <div className="glass rounded-xl p-3 mb-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Remaining Today</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-sm font-bold text-white font-data">{remaining.calories}</div>
              <div className="text-[9px] text-slate-500">cal</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-neon-teal font-data">{remaining.protein}g</div>
              <div className="text-[9px] text-slate-500">protein</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-blue-400 font-data">{remaining.carbs}g</div>
              <div className="text-[9px] text-slate-500">carbs</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-neon-pink font-data">{remaining.fat}g</div>
              <div className="text-[9px] text-slate-500">fat</div>
            </div>
          </div>
        </div>

        {/* Location status */}
        <div className="mb-4">
          {locating && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" />
              Finding your location...
            </div>
          )}
          {locationError && (
            <button onClick={requestLocation} className="flex items-center gap-2 text-xs text-neon-pink">
              <MapPin size={12} />
              {locationError}
            </button>
          )}
          {location && !locating && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <Navigation size={12} />
              Location found — showing nearby restaurants
            </div>
          )}
        </div>

        {/* Search bar */}
        {location && (
          <div className="flex gap-2 mb-4">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchRestaurants(searchQuery); }}
              placeholder="Search restaurants..."
              className="flex-1 bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none"
            />
            <button
              onClick={() => searchRestaurants(searchQuery)}
              disabled={searching}
              className="px-3 rounded-xl bg-neon-teal/10 border border-neon-teal/30 text-neon-teal hover:bg-neon-teal/20 transition disabled:opacity-50"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </div>
        )}

        {/* Restaurant list */}
        {searching && restaurants.length === 0 && (
          <div className="text-center py-8">
            <Loader2 size={24} className="animate-spin text-neon-teal mx-auto mb-2" />
            <p className="text-xs text-slate-400">Finding restaurants near you...</p>
          </div>
        )}

        {restaurants.length > 0 && (
          <div className="space-y-2 mb-4">
            {restaurants.map(r => (
              <button
                key={r.place_id}
                onClick={() => selectRestaurant(r)}
                className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-white/10 transition text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <UtensilsCrossed size={16} className="text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{r.address}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {r.rating && (
                      <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                        <Star size={8} fill="currentColor" /> {r.rating}
                      </span>
                    )}
                    {r.open_now != null && (
                      <span className={`text-[10px] ${r.open_now ? 'text-green-400' : 'text-red-400'}`}>
                        {r.open_now ? 'Open' : 'Closed'}
                      </span>
                    )}
                    {r.types?.[0] && (
                      <span className="text-[10px] text-slate-500">{r.types[0].replace(/_/g, ' ')}</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Manual entry — always available */}
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">
            {location ? "Don't see your restaurant?" : "Or type the restaurant name:"}
          </p>
          <div className="flex gap-2">
            <input
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && manualName.trim()) selectRestaurant({ name: manualName.trim() }); }}
              placeholder="e.g. Chipotle, Texas Roadhouse..."
              className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none"
            />
            <button
              onClick={() => manualName.trim() && selectRestaurant({ name: manualName.trim() })}
              disabled={!manualName.trim()}
              className="px-4 rounded-lg bg-gradient-to-r from-orange-500 to-neon-pink text-white text-sm font-semibold disabled:opacity-30"
            >
              Go
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat View (Restaurant Selected) ──────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button onClick={() => { setView('search'); setMessages([]); }}
          className="p-1.5 rounded-lg hover:bg-white/10 transition"
        >
          <ArrowLeft size={18} className="text-slate-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white truncate">
            {(selectedRestaurant as any)?.name || 'Restaurant'}
          </h2>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span>{remaining.calories} cal left</span>
            <span className="text-neon-teal">{remaining.protein}g P</span>
            <span className="text-blue-400">{remaining.carbs}g C</span>
            <span className="text-neon-pink">{remaining.fat}g F</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
        {messages.map((msg, i) => {
          const foodLogs = msg.role === 'assistant' ? extractFoodLogs(msg.content) : [];
          const text = msg.role === 'assistant' ? cleanDisplayText(msg.content) : msg.content;

          return (
            <div key={i}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-orange-500 to-neon-pink text-white rounded-br-md'
                    : 'bg-white/5 text-slate-200 rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap">{text}</div>
                </div>
              </div>

              {/* Food log cards */}
              {foodLogs.map((food, fi) => {
                const foodKey = `${i}-${fi}`;
                const logged = loggedFoods.has(foodKey);
                return (
                  <div key={fi} className="flex justify-start mt-2">
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 border text-xs ${
                      logged ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <UtensilsCrossed size={12} className={logged ? 'text-green-400' : 'text-orange-400'} />
                        <span className="font-semibold text-chrome/80">
                          {logged ? 'Logged' : food.food_name}
                        </span>
                      </div>
                      {!logged && food.description && (
                        <p className="text-chrome/50 text-[10px] mb-1.5">{food.description}</p>
                      )}
                      <div className="grid grid-cols-4 gap-2 mb-1.5">
                        <div className="text-center">
                          <div className="font-bold text-white font-data text-[11px]">{food.calories}</div>
                          <div className="text-[8px] text-slate-500">cal</div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-neon-teal font-data text-[11px]">{food.protein}g</div>
                          <div className="text-[8px] text-slate-500">protein</div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-blue-400 font-data text-[11px]">{food.carbs}g</div>
                          <div className="text-[8px] text-slate-500">carbs</div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-neon-pink font-data text-[11px]">{food.fat}g</div>
                          <div className="text-[8px] text-slate-500">fat</div>
                        </div>
                      </div>
                      {!logged && (
                        <button onClick={() => logFoodItem(food, foodKey)}
                          className="w-full py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-semibold border border-orange-500/30 hover:bg-orange-500/20 transition flex items-center justify-center gap-1"
                        >
                          <Check size={10} /> Log This Meal
                        </button>
                      )}
                      {logged && (
                        <div className="text-center text-green-400 text-[10px] flex items-center justify-center gap-1">
                          <Check size={10} /> Meal logged
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 rounded-2xl rounded-bl-md px-3 py-2">
              <Loader2 size={14} className="text-orange-400 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-white/10">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about the menu, specific items..."
            rows={1}
            className="flex-1 bg-white/5 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 border border-white/10 focus:border-orange-400 focus:outline-none resize-none"
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl bg-gradient-to-r from-orange-500 to-neon-pink flex items-center justify-center disabled:opacity-30 flex-shrink-0"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
        {/* Quick actions */}
        <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
          {[
            "What's the healthiest option?",
            "High protein, low carb picks?",
            "I want a burger — make it work",
          ].map(q => (
            <button key={q} onClick={() => {
              setInput('');
              sendAdvisorMessage(selectedRestaurant!, messages, q);
              setMessages(prev => [...prev, { role: 'user', content: q }]);
            }}
              disabled={loading}
              className="whitespace-nowrap px-3 py-1.5 rounded-full bg-white/5 text-[10px] text-slate-400 hover:bg-white/10 transition disabled:opacity-30 flex-shrink-0"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
