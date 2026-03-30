import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, Image, RotateCcw, Check, Loader2, Send, Zap } from 'lucide-react';
import { analyzeFoodChat } from '../lib/api';
import type { FoodMessage, FoodData } from '../lib/api';
import { addFoodEntry } from '../lib/storage';
import type { FoodEntry } from '../types';

type Mode = 'choose' | 'camera' | 'preview' | 'conversation';

export function SnapFood() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('choose');
  const [imageData, setImageData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mealType, setMealType] = useState<FoodEntry['meal_type']>('lunch');
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Conversation state
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [apiMessages, setApiMessages] = useState<FoodMessage[]>([]);
  const [foodData, setFoodData] = useState<FoodData | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-detect meal type from time of day
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 10) setMealType('breakfast');
    else if (h < 14) setMealType('lunch');
    else if (h < 17) setMealType('snack');
    else setMealType('dinner');
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      setStream(mediaStream);
      setMode('camera');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      setError('Camera access denied. Try uploading a photo instead.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    setImageData(data);
    stopCamera();
    setMode('preview');
  }, [stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as string);
      setMode('preview');
    };
    reader.readAsDataURL(file);
  };

  // Start the conversation by analyzing the image
  const analyzeImage = async () => {
    if (!imageData) return;
    setMode('conversation');
    setLoading(true);
    setError(null);

    const base64 = imageData.split(',')[1];
    const firstMsg: FoodMessage = {
      role: 'user',
      content: `Analyze this ${mealType} photo and estimate macros.`,
      image: base64,
    };

    try {
      const res = await analyzeFoodChat([firstMsg], mealType);
      setApiMessages([
        firstMsg,
        { role: 'assistant', content: res.message + (res.food_data ? `\n\`\`\`food_data\n${JSON.stringify(res.food_data)}\n\`\`\`` : '') },
      ]);
      setMessages([{ role: 'assistant', content: res.message }]);
      if (res.food_data) setFoodData(res.food_data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze food.');
      setMode('preview');
    } finally {
      setLoading(false);
    }
  };

  // Send a follow-up message in the conversation
  async function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userApiMsg: FoodMessage = { role: 'user', content: msg };
    const updatedApi = [...apiMessages, userApiMsg];
    setApiMessages(updatedApi);
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await analyzeFoodChat(updatedApi, mealType);
      setApiMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.message + (res.food_data ? `\n\`\`\`food_data\n${JSON.stringify(res.food_data)}\n\`\`\`` : '') },
      ]);
      setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
      if (res.food_data) setFoodData(res.food_data);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection issue: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const logFood = () => {
    if (!foodData) return;
    addFoodEntry({
      food_name: foodData.food_name,
      description: foodData.description,
      calories: foodData.calories,
      protein: foodData.protein,
      carbs: foodData.carbs,
      fat: foodData.fat,
      fiber: foodData.fiber,
      meal_type: mealType,
      ai_analysis: foodData.ai_analysis,
      confidence: foodData.confidence,
      image_base64: imageData || undefined,
    });
    navigate('/');
  };

  const reset = () => {
    stopCamera();
    setImageData(null);
    setFoodData(null);
    setError(null);
    setMessages([]);
    setApiMessages([]);
    setInput('');
    setMode('choose');
  };

  return (
    <div className="min-h-screen bg-deep-navy flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <button onClick={() => { stopCamera(); navigate('/'); }} className="text-slate-400">
          <X size={24} />
        </button>
        <h1 className="text-lg font-bold gradient-text">Snap Food</h1>
        {mode === 'conversation' ? (
          <button onClick={reset} className="text-slate-400"><RotateCcw size={20} /></button>
        ) : (
          <div className="w-6" />
        )}
      </div>

      {/* Meal type selector */}
      <div className="flex gap-2 px-4 mb-4 flex-shrink-0">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(t => (
          <button key={t} onClick={() => setMealType(t)}
            className={`flex-1 py-2 rounded-lg text-xs capitalize transition ${mealType === t
              ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/50'
              : 'bg-white/5 text-slate-400 border border-white/10'}`}
          >{t}</button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {/* Choose mode */}
      {mode === 'choose' && (
        <div className="px-4 space-y-4 mt-8 flex-1">
          <p className="text-center text-slate-400 text-sm mb-8">
            Take a photo and APEX will analyze it — ask questions if needed, then log when you're happy.
          </p>
          <button onClick={startCamera}
            className="w-full py-16 rounded-2xl border-2 border-dashed border-neon-teal/40 bg-neon-teal/5 flex flex-col items-center gap-3 hover:bg-neon-teal/10 transition"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center pulse-ring">
              <Camera size={28} className="text-white" />
            </div>
            <span className="text-white font-medium">Take Photo</span>
            <span className="text-slate-500 text-xs">Use your camera to snap food</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full py-6 rounded-2xl glass flex items-center justify-center gap-3 hover:bg-white/10 transition"
          >
            <Image size={20} className="text-neon-pink" />
            <span className="text-slate-300">Upload from Gallery</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </div>
      )}

      {/* Camera view */}
      {mode === 'camera' && (
        <div className="relative flex-1">
          <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <button onClick={capturePhoto}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 backdrop-blur-sm active:scale-95 transition"
            >
              <div className="w-16 h-16 rounded-full bg-white" />
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {mode === 'preview' && imageData && (
        <div className="px-4 space-y-4 flex-1">
          <div className="relative rounded-2xl overflow-hidden">
            <img src={imageData} alt="Food" className="w-full aspect-[4/3] object-cover" />
          </div>
          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 py-3 rounded-xl glass text-slate-300 flex items-center justify-center gap-2">
              <RotateCcw size={16} /> Retake
            </button>
            <button onClick={analyzeImage}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-neon-teal to-neon-pink text-white font-semibold flex items-center justify-center gap-2"
            >
              <Zap size={16} /> Analyze
            </button>
          </div>
        </div>
      )}

      {/* Conversation mode */}
      {mode === 'conversation' && (
        <>
          {/* Photo thumbnail */}
          {imageData && (
            <div className="px-4 mb-2 flex-shrink-0">
              <img src={imageData} alt="Food" className="w-full h-32 rounded-xl object-cover opacity-80" />
            </div>
          )}

          {/* Food data card (if available) */}
          {foodData && (
            <div className="px-4 mb-2 flex-shrink-0">
              <div className="glass rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-white">{foodData.food_name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    foodData.needs_clarification
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {foodData.needs_clarification ? 'Needs clarification' : `${Math.round(foodData.confidence * 100)}% confident`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-sm font-bold text-orange-400 font-data">{Math.round(foodData.calories)}</div>
                    <div className="text-[9px] text-slate-500">kcal</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neon-teal font-data">{Math.round(foodData.protein)}g</div>
                    <div className="text-[9px] text-slate-500">protein</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neon-pink font-data">{Math.round(foodData.carbs)}g</div>
                    <div className="text-[9px] text-slate-500">carbs</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neon-pink font-data">{Math.round(foodData.fat)}g</div>
                    <div className="text-[9px] text-slate-500">fat</div>
                  </div>
                </div>

                {/* Item breakdown */}
                {foodData.items && foodData.items.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                    {foodData.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className="text-slate-400">{item.name}</span>
                        <span className="text-slate-500">{item.calories}cal | {item.protein}p {item.carbs}c {item.fat}f</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chat messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-2 no-scrollbar space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-neon-teal/15 text-chrome border border-neon-teal/20 rounded-br-md'
                    : 'glass text-slate-200 rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="glass rounded-2xl rounded-bl-md px-3 py-2">
                  <Loader2 size={14} className="text-neon-teal animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Quick actions + input */}
          <div className="flex-shrink-0 px-4 pb-24 pt-2 space-y-2">
            {/* Quick clarification buttons */}
            {foodData && !loading && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {foodData.needs_clarification ? (
                  <>
                    <QuickChip label="Looks right" onTap={() => handleSend("That looks right, log it")} />
                    <QuickChip label="Bigger portion" onTap={() => handleSend("The portions were bigger than that")} />
                    <QuickChip label="Smaller portion" onTap={() => handleSend("Actually the portions were smaller")} />
                  </>
                ) : (
                  <>
                    <QuickChip label="Portion was bigger" onTap={() => handleSend("The portions were bigger than that")} />
                    <QuickChip label="Portion was smaller" onTap={() => handleSend("Portions were smaller")} />
                    <QuickChip label="I had more items" onTap={() => handleSend("There were more items I ate that you didn't catch")} />
                  </>
                )}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <div className="flex-1 flex gap-2 items-end glass rounded-2xl p-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                  placeholder="Correct or add details..."
                  className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 focus:outline-none px-2 py-1.5"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className="w-8 h-8 rounded-xl bg-gradient-to-r from-neon-teal to-neon-pink flex items-center justify-center disabled:opacity-20 transition flex-shrink-0"
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>

              {/* Log button */}
              {foodData && !foodData.needs_clarification && (
                <button
                  onClick={logFood}
                  className="h-12 px-4 rounded-xl bg-gradient-to-r from-green-500 to-neon-teal text-white font-semibold text-sm flex items-center gap-1.5 flex-shrink-0"
                >
                  <Check size={16} /> Log
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuickChip({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium
        bg-white/[0.03] border border-white/[0.08] text-chrome/50
        hover:bg-neon-teal/5 hover:border-neon-teal/20 hover:text-chrome/70
        transition active:scale-95"
    >
      {label}
    </button>
  );
}
