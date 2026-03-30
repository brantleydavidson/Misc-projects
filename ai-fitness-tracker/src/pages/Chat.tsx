import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Trash2, Sparkles, Settings2 } from 'lucide-react';
import type { UserProfile, ChatMessage } from '../types';
import { getChatMessages, addChatMessage, clearChat, getDailySummary, getGarminData } from '../lib/storage';
import { sendChat } from '../lib/api';

interface ChatProps {
  profile: UserProfile;
  onUpdateProfile?: (data: Partial<UserProfile>) => void;
}

const QUICK_PROMPTS = [
  "What should I eat for dinner to hit my macros?",
  "Am I on track today?",
  "Give me a high-protein snack idea",
  "My macro targets seem off — can we adjust?",
  "What should I eat before my workout?",
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

// Strip the profile_update block from display text
function cleanDisplayText(text: string): string {
  return text.replace(/```profile_update\s*\n?[\s\S]*?\n?```/g, '').trim();
}

export function Chat({ profile, onUpdateProfile }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(getChatMessages());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appliedUpdates, setAppliedUpdates] = useState<Set<number>>(new Set());
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
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
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
                  className="w-full text-left px-4 py-3 rounded-xl glass text-sm text-slate-300 hover:text-white hover:bg-white/10 transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const profileUpdate = msg.role === 'assistant' ? extractProfileUpdate(msg.content) : null;
          const displayText = msg.role === 'assistant' ? cleanDisplayText(msg.content) : msg.content;
          const isApplied = appliedUpdates.has(i);

          return (
            <div key={i}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 resize-none focus:outline-none px-2 py-1.5 max-h-24"
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
