import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

const icons = {
  pass: <CheckCircle size={16} className="text-green-600 shrink-0" />,
  warn: <AlertTriangle size={16} className="text-amber-500 shrink-0" />,
  fail: <XCircle size={16} className="text-red-500 shrink-0" />,
}

export default function FactorList({ factors }) {
  return (
    <div className="space-y-3">
      {factors.map((f, i) => (
        <div key={i} className="flex gap-2 items-start">
          {icons[f.status]}
          <div>
            <span className="font-medium text-sm text-slate-800">{f.name}</span>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
