const styles = {
  perfect: 'bg-green-100 text-green-800 border-green-300',
  possible: 'bg-amber-100 text-amber-800 border-amber-300',
  indoor_only: 'bg-blue-100 text-blue-800 border-blue-300',
  not_recommended: 'bg-red-100 text-red-800 border-red-300',
}

const labels = {
  perfect: 'Perfect Match',
  possible: 'With Care',
  indoor_only: 'Indoor Only',
  not_recommended: 'Not Recommended',
}

export default function CompatBadge({ rating, size = 'sm' }) {
  const sizeClass = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-block rounded-full border font-medium ${sizeClass} ${styles[rating] || styles.possible}`}>
      {labels[rating] || rating}
    </span>
  )
}
