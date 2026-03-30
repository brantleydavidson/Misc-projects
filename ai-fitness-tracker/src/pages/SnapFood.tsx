import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, Image, RotateCcw, Check, Loader2 } from 'lucide-react';
import { analyzeFood } from '../lib/api';
import { addFoodEntry } from '../lib/storage';
import type { FoodEntry } from '../types';

export function SnapFood() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<'choose' | 'camera' | 'preview' | 'analyzing' | 'result'>('choose');
  const [imageData, setImageData] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mealType, setMealType] = useState<FoodEntry['meal_type']>('lunch');
  const [stream, setStream] = useState<MediaStream | null>(null);

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

  const analyzeImage = async () => {
    if (!imageData) return;
    setMode('analyzing');
    setError(null);
    try {
      const base64 = imageData.split(',')[1];
      const res = await analyzeFood(base64, mealType);
      setResult(res);
      setMode('result');
    } catch (err: any) {
      setError(err.message || 'Failed to analyze food. Please try again.');
      setMode('preview');
    }
  };

  const saveResult = () => {
    if (!result) return;
    addFoodEntry({
      food_name: result.food_name,
      description: result.description,
      calories: result.calories,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      fiber: result.fiber,
      meal_type: mealType,
      ai_analysis: result.ai_analysis,
      confidence: result.confidence,
      image_base64: imageData || undefined,
    });
    navigate('/');
  };

  const reset = () => {
    stopCamera();
    setImageData(null);
    setResult(null);
    setError(null);
    setMode('choose');
  };

  return (
    <div className="min-h-screen bg-deep-navy pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => { stopCamera(); navigate('/'); }} className="text-slate-400">
          <X size={24} />
        </button>
        <h1 className="text-lg font-bold gradient-text">Snap Food</h1>
        <div className="w-6" />
      </div>

      {/* Meal type selector */}
      <div className="flex gap-2 px-4 mb-4">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(t => (
          <button key={t} onClick={() => setMealType(t)}
            className={`flex-1 py-2 rounded-lg text-xs capitalize transition ${mealType === t
              ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/50'
              : 'bg-white/5 text-slate-400 border border-white/10'}`}
          >{t}</button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Choose mode */}
      {mode === 'choose' && (
        <div className="px-4 space-y-4 mt-8">
          <p className="text-center text-slate-400 text-sm mb-8">
            Take a photo of your food and AI will instantly estimate the macros
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
        <div className="relative">
          <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
          <div className="absolute inset-0 viewfinder" />
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
        <div className="px-4 space-y-4">
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

      {/* Analyzing */}
      {mode === 'analyzing' && (
        <div className="px-4 mt-12 text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-neon-teal/20 to-neon-pink/20 flex items-center justify-center">
            <Loader2 size={32} className="text-neon-teal animate-spin" />
          </div>
          <p className="text-white font-medium">Analyzing your food...</p>
          <p className="text-slate-400 text-sm">AI is identifying items and estimating macros</p>
          {imageData && (
            <img src={imageData} alt="Food" className="w-48 h-48 mx-auto rounded-xl object-cover opacity-50" />
          )}
        </div>
      )}

      {/* Result */}
      {mode === 'result' && result && (
        <div className="px-4 space-y-4">
          {imageData && (
            <img src={imageData} alt="Food" className="w-full h-48 rounded-2xl object-cover" />
          )}
          <div className="glass rounded-2xl p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-lg font-bold text-white">{result.food_name}</h2>
                {result.description && <p className="text-xs text-slate-400 mt-0.5">{result.description}</p>}
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                {Math.round((result.confidence || 0.85) * 100)}% confident
              </span>
            </div>

            {/* Macro summary */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <MacroCard label="Calories" value={result.calories} unit="kcal" color="text-orange-400" />
              <MacroCard label="Protein" value={result.protein} unit="g" color="text-neon-teal" />
              <MacroCard label="Carbs" value={result.carbs} unit="g" color="text-neon-pink" />
              <MacroCard label="Fat" value={result.fat} unit="g" color="text-neon-pink" />
            </div>

            {/* Individual items */}
            {result.items && result.items.length > 1 && (
              <div className="border-t border-white/10 pt-3">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Breakdown</h3>
                {result.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-1.5 text-xs">
                    <span className="text-slate-300">{item.name}</span>
                    <span className="text-slate-500">{item.calories} cal | {item.protein}p {item.carbs}c {item.fat}f</span>
                  </div>
                ))}
              </div>
            )}

            {result.ai_analysis && (
              <div className="border-t border-white/10 pt-3 mt-3">
                <p className="text-xs text-slate-400 leading-relaxed">{result.ai_analysis}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 py-3 rounded-xl glass text-slate-300">
              <RotateCcw size={16} className="inline mr-1" /> Redo
            </button>
            <button onClick={saveResult}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-500 to-neon-teal text-white font-semibold flex items-center justify-center gap-2"
            >
              <Check size={16} /> Log It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MacroCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="text-center p-2 rounded-xl bg-white/5">
      <div className={`text-lg font-bold ${color}`}>{Math.round(value)}</div>
      <div className="text-[10px] text-slate-500">{unit}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function Zap(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
    </svg>
  );
}
