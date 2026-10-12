import Link from 'next/link'
import { cuisineColor } from '@/lib/cuisine'
import { cuisineCounts, type FeedItem } from '@/lib/feed'

// Cuisines in this log, most recently cooked first. Derived from the feed
// itself, so a new cuisine appears as soon as a cook's enrichment lands.
export function CuisineRow({ items, viewId }: { items: FeedItem[]; viewId?: string }) {
  const cuisines = cuisineCounts(items)
  if (cuisines.length === 0) return null
  return (
    <nav aria-label="Cuisines" className="mb-8 flex flex-wrap gap-2">
      {cuisines.map(({ cuisine, count }) => (
        <Link
          key={cuisine}
          href={`/cuisine/${encodeURIComponent(cuisine)}${viewId ? `?view=${viewId}` : ''}`}
          className="inline-flex min-h-11 items-center gap-2 border border-hairline px-3 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink active:bg-hairline"
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: cuisineColor(cuisine) }}
          />
          {cuisine}
          <span className="text-graphite">{count}</span>
        </Link>
      ))}
    </nav>
  )
}
