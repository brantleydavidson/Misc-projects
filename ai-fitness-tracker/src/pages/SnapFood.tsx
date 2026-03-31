import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, X, Image, RotateCcw, Check, Loader2, Send, Zap, PenLine, ScanBarcode, User } from 'lucide-react';
import { analyzeFoodChat, lookupNutrition, lookupBarcode, analyzeBodyProgress } from '../lib/api';
import type { FoodMessage, FoodData, NutritionResult, BarcodeResult } from '../lib/api';
import { addFoodEntry, addBodyPhoto, getBodyPhotos, getBodyPhotoDates, getAllBodyPhotos } from '../lib/storage';
import { getFoodMemoryContext, addCorrection, learnFood, bumpFoodFrequency } from '../lib/food-memory';
import type { FoodEntry, BodyPhoto } from '../types';

type Mode = 'choose' | 'camera' | 'preview' | 'conversation' | 'manual' | 'barcode' | 'progress';

/** Safely parse a number — returns 0 for NaN/undefined/null */
function safeNum(val: unknown): number {
  const n = Number(val);
  return isFinite(n) ? n : 0;
}

/** Sanitize food data from AI response — ensure all numbers are valid */
function sanitizeFoodData(raw: FoodData | null): FoodData | null {
  if (!raw) return null;
  return {
    ...raw,
    food_name: raw.food_name || 'Unknown food',
    description: raw.description || '',
    calories: safeNum(raw.calories),
    protein: safeNum(raw.protein),
    carbs: safeNum(raw.carbs),
    fat: safeNum(raw.fat),
    fiber: safeNum(raw.fiber),
    confidence: safeNum(raw.confidence) || 0.5,
    ai_analysis: raw.ai_analysis || '',
    needs_clarification: raw.needs_clarification ?? false,
    items: raw.items?.map(item => ({
      ...item,
      name: item.name || 'Item',
      calories: safeNum(item.calories),
      protein: safeNum(item.protein),
      carbs: safeNum(item.carbs),
      fat: safeNum(item.fat),
    })),
  };
}

export function SnapFood() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date') || undefined; // YYYY-MM-DD or undefined (today)
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
  const [initialFoodData, setInitialFoodData] = useState<FoodData | null>(null);
  const [nutritionCache, setNutritionCache] = useState<NutritionResult[]>([]);

  // Manual entry state
  const [manualForm, setManualForm] = useState({
    food_name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
  });

  // Barcode scanning state
  const barcodeScannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeResult | null>(null);

  // Progress photo state
  const progressInputRef = useRef<HTMLInputElement>(null);
  const [progressPhotos, setProgressPhotos] = useState<BodyPhoto[]>(getBodyPhotos());
  const [progressAngle, setProgressAngle] = useState<'front' | 'side' | 'back'>('front');
  const [progressAnalyzing, setProgressAnalyzing] = useState(false);
  const [progressAnalysis, setProgressAnalysis] = useState<string | null>(null);

  function handleProgressPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      addBodyPhoto({
        angle: progressAngle,
        image_base64: base64,
        date: new Date().toISOString().split('T')[0],
      });
      setProgressPhotos(getBodyPhotos());
      if (progressAngle === 'front') setProgressAngle('side');
      else if (progressAngle === 'side') setProgressAngle('back');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleProgressAnalysis() {
    if (progressPhotos.length === 0) return;
    setProgressAnalyzing(true);
    setProgressAnalysis(null);
    try {
      const allDates = getBodyPhotoDates();
      const today = new Date().toISOString().split('T')[0];
      const previousDates = allDates.filter(d => d < today);
      const previousDate = previousDates[previousDates.length - 1];
      const allPhotos = getAllBodyPhotos();
      const previousPhotos = previousDate ? allPhotos[previousDate] : [];
      const currentFront = progressPhotos.find(p => p.angle === 'front');
      const previousFront = previousPhotos?.find((p: BodyPhoto) => p.angle === 'front');

      const result = await analyzeBodyProgress({
        current_photo: currentFront?.image_base64 || progressPhotos[0].image_base64,
        previous_photo: previousFront?.image_base64,
        current_date: today,
        previous_date: previousDate,
        current_weight_kg: previousFront?.weight_kg,
      });
      setProgressAnalysis(result.analysis);
    } catch (err: any) {
      setProgressAnalysis(`Couldn't analyze: ${err.message}`);
    } finally {
      setProgressAnalyzing(false);
    }
  }

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

  // Barcode scanning
  const startBarcodeScanner = useCallback(async () => {
    setMode('barcode');
    setBarcodeResult(null);
    setError(null);
    // Small delay to let the DOM render the scanner container
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('barcode-scanner');
        html5QrCodeRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 150 }, aspectRatio: 1.0 },
          async (decodedText: string) => {
            // Got a barcode — stop scanning and look it up
            await scanner.stop().catch(() => {});
            html5QrCodeRef.current = null;
            handleBarcodeScanned(decodedText);
          },
          () => {} // ignore scan failures (no match yet)
        );
      } catch (err: any) {
        setError('Camera access needed for barcode scanning.');
        setMode('choose');
      }
    }, 200);
  }, []);

  const stopBarcodeScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try { await html5QrCodeRef.current.stop(); } catch {}
      html5QrCodeRef.current = null;
    }
  }, []);

  const handleBarcodeScanned = async (barcode: string) => {
    setBarcodeLoading(true);
    try {
      const result = await lookupBarcode(barcode);
      setBarcodeResult(result);
      if (result.found && result.nutrition) {
        // Auto-populate food data from barcode lookup
        const fd: FoodData = {
          food_name: `${result.brand ? result.brand + ' ' : ''}${result.product_name || 'Product'}`,
          description: `Barcode: ${barcode}`,
          calories: result.nutrition.calories,
          protein: result.nutrition.protein,
          carbs: result.nutrition.carbs,
          fat: result.nutrition.fat,
          fiber: result.nutrition.fiber,
          confidence: 0.95,
          ai_analysis: `Scanned barcode ${barcode}. Source: ${result.source || 'database'}.`,
          needs_clarification: false,
        };
        setFoodData(fd);
        setInitialFoodData(fd);
        // Switch to conversation mode to show the result card
        setMessages([{
          role: 'assistant',
          content: `Found it! **${fd.food_name}** — ${result.nutrition.serving_size}.\n\n${fd.calories} cal | ${fd.protein}g protein | ${fd.carbs}g carbs | ${fd.fat}g fat\n\nLooks good? Tap **Log** to save, or adjust the numbers if needed.`,
        }]);
        setMode('conversation');
      }
    } catch (err: any) {
      setError(`Barcode lookup failed: ${err.message}`);
      setBarcodeResult({ found: false, message: err.message });
    } finally {
      setBarcodeLoading(false);
    }
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

    const memoryContext = getFoodMemoryContext();

    try {
      const res = await analyzeFoodChat([firstMsg], mealType, memoryContext || undefined);
      const sanitized = sanitizeFoodData(res.food_data);

      setApiMessages([
        firstMsg,
        { role: 'assistant', content: res.message + (res.food_data ? `\n\`\`\`food_data\n${JSON.stringify(res.food_data)}\n\`\`\`` : '') },
      ]);
      setMessages([{ role: 'assistant', content: res.message }]);

      if (sanitized) {
        setFoodData(sanitized);
        setInitialFoodData(sanitized);

        // Background: look up USDA nutrition data for identified items
        const itemNames = sanitized.items?.map(i => i.name) || [sanitized.food_name];
        lookupNutrition(itemNames)
          .then(({ results }) => {
            if (results.length > 0) {
              setNutritionCache(results);
              for (const r of results) {
                learnFood({
                  name: r.name,
                  aliases: [],
                  calories: r.calories,
                  protein: r.protein,
                  carbs: r.carbs,
                  fat: r.fat,
                  fiber: r.fiber,
                  serving_size: r.serving_size,
                  source: r.source === 'usda' || r.source === 'usda_branded' ? 'usda' : 'ai_estimate',
                  confidence: r.confidence,
                });
              }
            }
          })
          .catch(() => {});
      }
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
      const memoryContext = getFoodMemoryContext();
      const res = await analyzeFoodChat(updatedApi, mealType, memoryContext || undefined, nutritionCache.length > 0 ? nutritionCache : undefined);
      const sanitized = sanitizeFoodData(res.food_data);

      setApiMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.message + (res.food_data ? `\n\`\`\`food_data\n${JSON.stringify(res.food_data)}\n\`\`\`` : '') },
      ]);
      setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
      if (sanitized) setFoodData(sanitized);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection issue: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  // Log food (from AI analysis or manual entry)
  const logFood = (overrideData?: FoodData) => {
    const data = overrideData || foodData;
    if (!data) return;

    // Detect if the user corrected the AI's estimates
    if (!overrideData && initialFoodData && (
      Math.abs(data.calories - initialFoodData.calories) > 20 ||
      Math.abs(data.protein - initialFoodData.protein) > 3
    )) {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      addCorrection(
        { name: initialFoodData.food_name, calories: initialFoodData.calories, protein: initialFoodData.protein, carbs: initialFoodData.carbs, fat: initialFoodData.fat },
        { name: data.food_name, calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat },
        lastUserMsg?.content || 'user corrected via conversation'
      );
    }

    learnFood({
      name: data.food_name,
      aliases: [],
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      fiber: data.fiber,
      source: data.confidence >= 0.9 ? 'user_verified' : 'ai_estimate',
      confidence: data.confidence,
    });
    bumpFoodFrequency(data.food_name);

    addFoodEntry({
      food_name: data.food_name,
      description: data.description,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      fiber: data.fiber,
      meal_type: mealType,
      ai_analysis: data.ai_analysis,
      confidence: data.confidence,
      image_base64: imageData || undefined,
    }, dateParam);
    navigate(dateParam ? `/?date=${dateParam}` : '/');
  };

  // Manual food entry
  const logManual = () => {
    if (!manualForm.food_name.trim() || !manualForm.calories) return;
    const data: FoodData = {
      food_name: manualForm.food_name.trim(),
      description: 'Manual entry',
      calories: safeNum(manualForm.calories),
      protein: safeNum(manualForm.protein),
      carbs: safeNum(manualForm.carbs),
      fat: safeNum(manualForm.fat),
      fiber: safeNum(manualForm.fiber),
      confidence: 1.0,
      ai_analysis: 'Manually entered',
      needs_clarification: false,
    };
    logFood(data);
  };

  // Inline macro edit
  const [editingMacro, setEditingMacro] = useState<string | null>(null);

  function updateMacro(field: keyof FoodData, value: string) {
    if (!foodData) return;
    setFoodData({ ...foodData, [field]: safeNum(value) });
  }

  const reset = () => {
    stopCamera();
    stopBarcodeScanner();
    setImageData(null);
    setFoodData(null);
    setInitialFoodData(null);
    setNutritionCache([]);
    setError(null);
    setMessages([]);
    setApiMessages([]);
    setInput('');
    setEditingMacro(null);
    setBarcodeResult(null);
    setMode('choose');
  };

  const hasValidMacros = foodData && foodData.calories > 0;

  return (
    <div className="min-h-screen bg-deep-navy flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <button onClick={() => { stopCamera(); stopBarcodeScanner(); navigate(dateParam ? `/?date=${dateParam}` : '/'); }} className="text-slate-400">
          <X size={24} />
        </button>
        <h1 className="text-lg font-bold gradient-text">
          {mode === 'manual' ? 'Manual Entry' : mode === 'barcode' ? 'Scan Barcode' : mode === 'progress' ? 'Progress Photos' : 'Snap Food'}
        </h1>
        {(mode === 'conversation' || mode === 'manual' || mode === 'barcode' || mode === 'progress') ? (
          <button onClick={reset} className="text-slate-400"><RotateCcw size={20} /></button>
        ) : (
          <div className="w-6" />
        )}
      </div>

      {/* Past day indicator */}
      {dateParam && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center flex-shrink-0">
          Logging to {new Date(dateParam + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      )}

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
        <div className="px-4 space-y-3 mt-4 flex-1">
          <p className="text-center text-slate-400 text-sm mb-6">
            Snap a photo, upload from gallery, or type it in manually.
          </p>
          <button onClick={startCamera}
            className="w-full py-12 rounded-2xl border-2 border-dashed border-neon-teal/40 bg-neon-teal/5 flex flex-col items-center gap-3 hover:bg-neon-teal/10 transition"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center pulse-ring">
              <Camera size={24} className="text-white" />
            </div>
            <span className="text-white font-medium">Take Photo</span>
            <span className="text-slate-500 text-xs">AI identifies food + estimates macros</span>
          </button>

          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="py-5 rounded-2xl glass flex flex-col items-center gap-2 hover:bg-white/10 transition"
            >
              <Image size={18} className="text-neon-pink" />
              <span className="text-slate-300 text-[11px]">Gallery</span>
            </button>
            <button onClick={startBarcodeScanner}
              className="py-5 rounded-2xl glass flex flex-col items-center gap-2 hover:bg-white/10 transition"
            >
              <ScanBarcode size={18} className="text-yellow-400" />
              <span className="text-slate-300 text-[11px]">Barcode</span>
            </button>
            <button onClick={() => setMode('manual')}
              className="py-5 rounded-2xl glass flex flex-col items-center gap-2 hover:bg-white/10 transition"
            >
              <PenLine size={18} className="text-neon-teal" />
              <span className="text-slate-300 text-[11px]">Type It In</span>
            </button>
            <button onClick={() => setMode('progress')}
              className="py-5 rounded-2xl glass flex flex-col items-center gap-2 hover:bg-white/10 transition"
            >
              <User size={18} className="text-purple-400" />
              <span className="text-slate-300 text-[11px]">Progress</span>
            </button>
          </div>
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

      {/* Manual entry mode */}
      {mode === 'manual' && (
        <div className="px-4 space-y-4 flex-1 pb-24">
          <div className="glass rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block">Food name</label>
              <input
                value={manualForm.food_name}
                onChange={e => setManualForm(f => ({ ...f, food_name: e.target.value }))}
                placeholder="e.g. Chicken breast, Core Power shake..."
                className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ManualField label="Calories" value={manualForm.calories} unit="kcal" color="text-orange-400"
                onChange={v => setManualForm(f => ({ ...f, calories: v }))} />
              <ManualField label="Protein" value={manualForm.protein} unit="g" color="text-neon-teal"
                onChange={v => setManualForm(f => ({ ...f, protein: v }))} />
              <ManualField label="Carbs" value={manualForm.carbs} unit="g" color="text-neon-pink"
                onChange={v => setManualForm(f => ({ ...f, carbs: v }))} />
              <ManualField label="Fat" value={manualForm.fat} unit="g" color="text-yellow-400"
                onChange={v => setManualForm(f => ({ ...f, fat: v }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ManualField label="Fiber" value={manualForm.fiber} unit="g" color="text-green-400"
                onChange={v => setManualForm(f => ({ ...f, fiber: v }))} />
              <div /> {/* spacer */}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 text-center">
            Tip: Check the nutrition label or Google "{manualForm.food_name || 'food'} nutrition facts"
          </p>

          <div className="flex gap-3">
            <button onClick={reset}
              className="flex-1 py-3 rounded-xl glass text-slate-300 flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} /> Cancel
            </button>
            <button onClick={logManual}
              disabled={!manualForm.food_name.trim() || !manualForm.calories}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-500 to-neon-teal text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-30"
            >
              <Check size={16} /> Log It
            </button>
          </div>
        </div>
      )}

      {/* Barcode scanning mode */}
      {mode === 'barcode' && (
        <div className="px-4 space-y-4 flex-1">
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ minHeight: 300 }}>
            <div id="barcode-scanner" ref={barcodeScannerRef} className="w-full" />
            {barcodeLoading && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="text-neon-teal animate-spin" />
                <span className="text-slate-300 text-sm">Looking up product...</span>
              </div>
            )}
          </div>

          {barcodeResult && !barcodeResult.found && (
            <div className="glass rounded-xl p-4 text-center space-y-3">
              <p className="text-slate-300 text-sm">Product not found in database.</p>
              <div className="flex gap-3">
                <button onClick={startBarcodeScanner}
                  className="flex-1 py-3 rounded-xl glass text-slate-300 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} /> Try Again
                </button>
                <button onClick={() => setMode('manual')}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-neon-teal to-neon-pink text-white font-semibold flex items-center justify-center gap-2"
                >
                  <PenLine size={16} /> Enter Manually
                </button>
              </div>
            </div>
          )}

          {!barcodeResult && !barcodeLoading && (
            <div className="text-center space-y-3">
              <p className="text-slate-400 text-sm">Point your camera at a barcode on a food package</p>
              <button onClick={() => { stopBarcodeScanner(); setMode('choose'); }}
                className="py-3 px-6 rounded-xl glass text-slate-300 text-sm"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Conversation mode */}
      {/* Progress photo mode */}
      {mode === 'progress' && (
        <div className="px-4 space-y-4 flex-1 pb-24 overflow-y-auto">
          {/* Angle selector */}
          <div className="flex gap-2">
            {(['front', 'side', 'back'] as const).map(angle => {
              const hasPhoto = progressPhotos.some(p => p.angle === angle);
              return (
                <button key={angle} onClick={() => setProgressAngle(angle)}
                  className={`flex-1 py-2.5 rounded-xl text-xs capitalize transition font-medium ${
                    progressAngle === angle
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                      : hasPhoto
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-white/5 text-slate-400 border border-white/10'
                  }`}
                >
                  {hasPhoto && <Check size={10} className="inline mr-1" />}
                  {angle}
                </button>
              );
            })}
          </div>

          {/* Photo grid */}
          {progressPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {progressPhotos.map(photo => (
                <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-[3/4] bg-white/5">
                  <img
                    src={`data:image/jpeg;base64,${photo.image_base64}`}
                    alt={photo.angle}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 px-2 py-1">
                    <span className="text-[10px] text-white capitalize font-medium">{photo.angle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Capture button */}
          <button onClick={() => progressInputRef.current?.click()}
            className="w-full py-10 rounded-2xl border-2 border-dashed border-purple-500/40 bg-purple-500/5 flex flex-col items-center gap-3 hover:bg-purple-500/10 transition"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-neon-pink flex items-center justify-center">
              <Camera size={20} className="text-white" />
            </div>
            <span className="text-white font-medium">
              {progressPhotos.some(p => p.angle === progressAngle)
                ? `Retake ${progressAngle} photo`
                : `Take ${progressAngle} photo`}
            </span>
            <span className="text-slate-500 text-xs">Same pose, same lighting for best comparison</span>
          </button>
          <input ref={progressInputRef} type="file" accept="image/*" capture="user" onChange={handleProgressPhoto} className="hidden" />

          {/* AI Analysis */}
          {progressPhotos.length > 0 && (
            <button onClick={handleProgressAnalysis} disabled={progressAnalyzing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-neon-teal/20 border border-purple-500/20 text-white text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
            >
              {progressAnalyzing ? (
                <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
              ) : (
                <><Zap size={14} /> AI Progress Analysis</>
              )}
            </button>
          )}

          {progressAnalysis && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider mb-2">APEX Analysis</div>
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{progressAnalysis}</div>
            </div>
          )}

          {progressPhotos.length === 0 && (
            <p className="text-[10px] text-slate-500 text-center px-4">
              Take front, side, and back photos consistently for AI-powered progress tracking over time.
            </p>
          )}
        </div>
      )}

      {mode === 'conversation' && (
        <>
          {/* Photo thumbnail */}
          {imageData && (
            <div className="px-4 mb-2 flex-shrink-0">
              <img src={imageData} alt="Food" className="w-full h-32 rounded-xl object-cover opacity-80" />
            </div>
          )}

          {/* Food data card (editable) */}
          {foodData && (
            <div className="px-4 mb-2 flex-shrink-0">
              <div className="glass rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-white">{foodData.food_name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    !hasValidMacros
                      ? 'bg-red-500/20 text-red-400'
                      : foodData.needs_clarification
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-green-500/20 text-green-400'
                  }`}>
                    {!hasValidMacros ? 'Tap to edit' :
                      foodData.needs_clarification ? 'Needs clarification' :
                      `${Math.round(foodData.confidence * 100)}% confident`}
                  </span>
                </div>

                {/* Editable macro grid */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <EditableMacro
                    label="Calories" unit="kcal" value={foodData.calories} color="text-orange-400"
                    editing={editingMacro === 'calories'}
                    onTap={() => setEditingMacro(editingMacro === 'calories' ? null : 'calories')}
                    onChange={v => updateMacro('calories', v)}
                  />
                  <EditableMacro
                    label="Protein" unit="g" value={foodData.protein} color="text-neon-teal"
                    editing={editingMacro === 'protein'}
                    onTap={() => setEditingMacro(editingMacro === 'protein' ? null : 'protein')}
                    onChange={v => updateMacro('protein', v)}
                  />
                  <EditableMacro
                    label="Carbs" unit="g" value={foodData.carbs} color="text-neon-pink"
                    editing={editingMacro === 'carbs'}
                    onTap={() => setEditingMacro(editingMacro === 'carbs' ? null : 'carbs')}
                    onChange={v => updateMacro('carbs', v)}
                  />
                  <EditableMacro
                    label="Fat" unit="g" value={foodData.fat} color="text-neon-pink"
                    editing={editingMacro === 'fat'}
                    onTap={() => setEditingMacro(editingMacro === 'fat' ? null : 'fat')}
                    onChange={v => updateMacro('fat', v)}
                  />
                </div>

                {/* Tap to edit hint */}
                {!editingMacro && (
                  <p className="text-[9px] text-slate-600 text-center mt-1.5">Tap any number to edit</p>
                )}

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

          {/* Actions + input */}
          <div className="flex-shrink-0 px-4 pb-24 pt-2 space-y-2">
            {/* Quick clarification chips */}
            {foodData && !loading && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {!hasValidMacros ? (
                  <>
                    <QuickChip label="Look up this product" onTap={() => handleSend(`Can you look up the exact nutrition for ${foodData.food_name}? It's a packaged product.`)} />
                    <QuickChip label="I'll type it in" onTap={() => {
                      setManualForm({ food_name: foodData.food_name, calories: '', protein: '', carbs: '', fat: '', fiber: '' });
                      setMode('manual');
                    }} />
                  </>
                ) : foodData.needs_clarification ? (
                  <>
                    <QuickChip label="Looks right" onTap={() => handleSend("That looks right, log it")} />
                    <QuickChip label="Bigger portion" onTap={() => handleSend("The portions were bigger than that")} />
                    <QuickChip label="Smaller portion" onTap={() => handleSend("Actually the portions were smaller")} />
                  </>
                ) : (
                  <>
                    <QuickChip label="Portion was bigger" onTap={() => handleSend("The portions were bigger than that")} />
                    <QuickChip label="Portion was smaller" onTap={() => handleSend("Portions were smaller")} />
                    <QuickChip label="More items" onTap={() => handleSend("There were more items I ate that you didn't catch")} />
                    <QuickChip label="Edit manually" onTap={() => {
                      setManualForm({
                        food_name: foodData.food_name,
                        calories: String(foodData.calories || ''),
                        protein: String(foodData.protein || ''),
                        carbs: String(foodData.carbs || ''),
                        fat: String(foodData.fat || ''),
                        fiber: String(foodData.fiber || ''),
                      });
                      setMode('manual');
                    }} />
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

              {/* Log button — only when we have valid macros */}
              {hasValidMacros && !foodData!.needs_clarification && (
                <button
                  onClick={() => logFood()}
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

// ── Sub-components ──────────────────────────────────────────────────

function EditableMacro({ label, unit, value, color, editing, onTap, onChange }: {
  label: string; unit: string; value: number; color: string;
  editing: boolean; onTap: () => void; onChange: (v: string) => void;
}) {
  return (
    <div className="cursor-pointer" onClick={onTap}>
      {editing ? (
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          onClick={e => e.stopPropagation()}
          autoFocus
          className={`w-full bg-white/10 rounded-lg px-1 py-1 text-sm font-bold text-center border border-neon-teal/40 focus:outline-none ${color}`}
        />
      ) : (
        <div className={`text-sm font-bold font-data ${color}`}>
          {value > 0 ? Math.round(value) : '—'}
        </div>
      )}
      <div className="text-[9px] text-slate-500">{unit}</div>
      <div className="text-[9px] text-slate-500">{label}</div>
    </div>
  );
}

function ManualField({ label, value, unit, color, onChange }: {
  label: string; value: string; unit: string; color: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={`text-[10px] font-medium mb-1 block ${color}`}>{label} ({unit})</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-teal focus:outline-none"
      />
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
