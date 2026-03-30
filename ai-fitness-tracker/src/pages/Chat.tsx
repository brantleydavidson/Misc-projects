import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Trash2, Sparkles } from 'lucide-react';
import type { UserProfile, ChatMessage } from '../types';
import { getChatMessages, addChatMessage, clearChat, getDailySummary, getGarminData } from '../lib/storage';
import { sendChat } from '../lib/api';

interface ChatProps {
  profile: UserProfile;
}

const QUICK_PROMPTS = [
  "What should I eat for dinner to hit my macros?",
  "Am I on track today?",
  "Give me a high-protein snack idea",
  "How's my progress looking?",
  "What should I eat before my workout?",
];

export function Chat({ profile }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(getChatMessages());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

  function handleClear() {
    clearChat();
    setMessages([]);
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
            <Sparkles size={18} className="text-purple-400" />
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
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                <Sparkles size={28} className="text-purple-400" />
              </div>
              <h2 className="text-white font-semibold mb-1">Hey! I'm your AI Coach</h2>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">
                I know your stats, your goals, and what you've eaten today. Ask me anything about nutrition, meals, or your progress.
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

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-br-md'
                : 'glass text-slate-200 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 size={16} className="text-purple-400 animate-spin" />
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
            className="w-9 h-9 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 flex items-center justify-center disabled:opacity-30 transition flex-shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
