import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Trash2, Sparkles, Settings2, UtensilsCrossed, Check } from 'lucide-react';
import type { UserProfile, ChatMessage, FoodEntry } from '../types';
import { getChatMessages, addChatMessage, clearChat, getDailySummary, getGarminData, addFoodEntry } from '../lib/storage';
import { sendChat } from '../lib/api';

interface ChatProps {
  profile: UserProfile;
  onUpdateProfile?: (data: Partial<UserProfile>) => void;
}

const QUICK_PROMPTS = [
  "What should I eat for dinner to hit my macros?",
  "Am I on track today?",
  "I ate out yesterday — help me log it",
  "Give me a high-protein snack idea",
  "My macro targets seem off — can we adjust?",
];

// Extract profile_update JSON from AI response
function extractProfileUpdate(text: string): Partial<UserProfile> | null {
  const match = text.match(/```profile_update\s*\n?([\s\S]*?)\n?```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// Extract food_log JSON blocks from AI response (can be multiple)
interface FoodLogData {
  food_name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  meal_type?: FoodEntry['meal_type'];
  date?: string; // YYYY-MM-DD for past days
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

// Strip all JSON blocks from display text
function cleanDisplayText(text: string): string {
  return text
    .replace(/```profile_update\s*\n?[\s\S]*?\n?```/g, '')
    .replace(/```food_log\s*\n?[\s\S]*?\n?```/g, '')
    .trim();
}

export function Chat({ profile, onUpdateProfile }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(getChatMessages());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appliedUpdates, setAppliedUpdates] = useState<Set<number>>(new Set());
  const [loggedFoods, setLoggedFoods] = useState<Set<string>>(new Set()); // "msgIndex-foodIndex"
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: msg };
    const updated = [...messages, userMsg];
    addChatMessage(userMsg);
    setMessages(updated);
    setLoading(true);

    try {
      const summary = getDailySummary();
      const garmin = getGarminData();
      const response = await sendChat(updated, profile, { todaySummary: summary, garminData: garmin });
      const assistantMsg: ChatMessage = { role: 'assistant', content: response.message };
      addChatMessage(assistantMsg);
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: `Sorry, I couldn't connect right now. ${err.message || 'Please try again.'}`,
      };
      addChatMessage(errMsg);
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  function applyUpdate(msgIndex: number, update: Partial<UserProfile>) {
    if (!onUpdateProfile) return;
    onUpdateProfile(update);
    setAppliedUpdates(prev => new Set(prev).add(msgIndex));
  }

  function logFoodFromChat(msgIndex: number, foodIndex: number, food: FoodLogData) {
    const key = `${msgIndex}-${foodIndex}`;
    if (loggedFoods.has(key)) return;
    addFoodEntry({
      food_name: food.food_name,
      description: food.description || '',
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      meal_type: food.meal_type || 'lunch',
      ai_analysis: 'Logged via coach conversation',
      confidence: 0.85,
    }, food.date); // food.date is undefined for today, YYYY-MM-DD for past days
    setLoggedFoods(prev => new Set(prev).add(key));
  }

  function handleClear() {
    clearChat();
    setMessages([]);
    setAppliedUpdates(new Set());
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white font-display uppercase flex items-center gap-2">
            <Sparkles size={18} className="text-neon-pink" />
            AI Coach
          </h1>
          <p className="text-xs text-slate-400">Your personal nutritionist</p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="text-slate-500 hover:text-red-400 transition p-2">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar space-y-3">
        {messages.length === 0 && (
          <div className="mt-8 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-neon-pink/20 to-neon-teal/20 flex items-center justify-center">
                <Sparkles size={28} className="text-neon-pink" />
              </div>
              <h2 className="text-white font-semibold mb-1">Hey! I'm APEX</h2>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">
                I know your stats, your goals, and what you've eaten today. Ask me anything — or tell me to adjust your targets.
              </p>
            </div>
            <div className="space-y-2">
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt} onClick={() => handleSend(prompt)}
                  className="w-full text-left px-4 py-3 rounded-xl glass text-sm font-ui text-slate-300 hover:text-white hover:bg-white/10 transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const profileUpdate = msg.role === 'assistant' ? extractProfileUpdate(msg.content) : null;
          const foodLogs = msg.role === 'assistant' ? extractFoodLogs(msg.content) : [];
          const displayText = msg.role === 'assistant' ? cleanDisplayText(msg.content) : msg.content;
          const isApplied = appliedUpdates.has(i);

          return (
            <div key={i}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed font-body ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-neon-teal to-neon-pink text-white rounded-br-md'
                    : 'glass text-slate-200 rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap">{displayText}</div>
                </div>
              </div>

              {/* Profile update action card */}
              {profileUpdate && onUpdateProfile && (
                <div className="flex justify-start mt-2">
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 border ${
                    isApplied
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-neon-teal/5 border-neon-teal/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Settings2 size={14} className={isApplied ? 'text-green-400' : 'text-neon-teal'} />
                      <span className="text-xs font-semibold text-chrome/70">
                        {isApplied ? 'Targets Updated' : 'Suggested Target Changes'}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      {profileUpdate.calorie_target != null && (
                        <div className="flex justify-between text-chrome/60">
                          <span>Calories</span>
                          <span className="font-data text-chrome">{profileUpdate.calorie_target} cal</span>
                        </div>
                      )}
                      {profileUpdate.protein_target != null && (
                        <div className="flex justify-between text-chrome/60">
                          <span>Protein</span>
                          <span className="font-data text-chrome">{profileUpdate.protein_target}g</span>
                        </div>
                      )}
                      {profileUpdate.carb_target != null && (
                        <div className="flex justify-between text-chrome/60">
                          <span>Carbs</span>
                          <span className="font-data text-chrome">{profileUpdate.carb_target}g</span>
                        </div>
                      )}
                      {profileUpdate.fat_target != null && (
                        <div className="flex justify-between text-chrome/60">
                          <span>Fat</span>
                          <span className="font-data text-chrome">{profileUpdate.fat_target}g</span>
                        </div>
                      )}
                      {profileUpdate.water_target_liters != null && (
                        <div className="flex justify-between text-chrome/60">
                          <span>Water</span>
                          <span className="font-data text-chrome">{profileUpdate.water_target_liters}L</span>
                        </div>
                      )}
                    </div>
                    {!isApplied && (
                      <button
                        onClick={() => applyUpdate(i, profileUpdate)}
                        className="mt-3 w-full py-2 rounded-lg bg-neon-teal/10 text-neon-teal text-xs font-semibold border border-neon-teal/30 hover:bg-neon-teal/20 transition"
                      >
                        Apply Changes
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Food log action cards */}
              {foodLogs.map((food, fi) => {
                const foodKey = `${i}-${fi}`;
                const isLogged = loggedFoods.has(foodKey);
                return (
                  <div key={foodKey} className="flex justify-start mt-2">
                    <div className={`max-w-[85%] rounded-xl px-4 py-3 border ${
                      isLogged ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <UtensilsCrossed size={14} className={isLogged ? 'text-green-400' : 'text-orange-400'} />
                        <span className="text-xs font-semibold text-chrome/70">
                          {isLogged ? 'Meal Logged' : 'Log This Meal?'}
                        </span>
                        {food.date && (
                          <span className="text-[10px] text-slate-500 ml-auto">
                            {new Date(food.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-white mb-1">{food.food_name}</div>
                      {food.description && <div className="text-[10px] text-slate-400 mb-2">{food.description}</div>}
                      <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                        <div><div className="font-data text-orange-400 text-sm">{food.calories}</div>cal</div>
                        <div><div className="font-data text-neon-teal text-sm">{food.protein}g</div>protein</div>
                        <div><div className="font-data text-neon-pink text-sm">{food.carbs}g</div>carbs</div>
                        <div><div className="font-data text-yellow-400 text-sm">{food.fat}g</div>fat</div>
                      </div>
                      {!isLogged && (
                        <button
                          onClick={() => logFoodFromChat(i, fi, food)}
                          className="mt-3 w-full py-2 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-semibold border border-orange-500/30 hover:bg-orange-500/20 transition flex items-center justify-center gap-1.5"
                        >
                          <Check size={12} /> Log {food.meal_type || 'Meal'}
                        </button>
                      )}
                      {isLogged && (
                        <div className="mt-2 text-[10px] text-green-400 text-center flex items-center justify-center gap-1">
                          <Check size={10} /> Added to {food.date ? new Date(food.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'today'}
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
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 size={16} className="text-neon-pink animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-24 pt-2">
        <div className="flex gap-2 items-end glass rounded-2xl p-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach..."
            rows={1}
            className="flex-1 bg-transparent text-white text-sm font-body placeholder-slate-500 resize-none focus:outline-none px-2 py-1.5 max-h-24"
          />
          <button onClick={() => handleSend()} disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl bg-gradient-to-r from-neon-teal to-neon-pink flex items-center justify-center disabled:opacity-30 transition flex-shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
