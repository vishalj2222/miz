import Link from 'next/link'
import { isIdentifying, type FeedItem } from '@/lib/feed'
import { cuisineColor } from '@/lib/cuisine'
import { CuisineTag } from '@/components/cuisine-tag'
import { CookDate } from '@/components/cook-date'

export function CookCard({
  item,
  syncError,
  onDiscard,
}: {
  item: FeedItem
  syncError?: string
  onDiscard?: (id: string) => Promise<void>
}) {
  const cuisine = item.cuisine ?? null
  const body = (
    <>
      {item.photoUrl && (
        <div className="overflow-hidden bg-hairline">
          <img src={item.photoUrl} alt="" className="aspect-[4/5] w-full object-cover" />
        </div>
      )}
      <div
        className={cuisine ? 'mt-4 border-l-2 pl-4' : 'mt-4'}
        style={cuisine ? { borderColor: cuisineColor(cuisine) } : undefined}
      >
        {item.dishName ? (
          <h2 className="font-display text-[1.6rem] leading-[1.1] font-medium tracking-[-0.025em]">
            {item.dishName}
          </h2>
        ) : !syncError && isIdentifying(item) ? (
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-graphite">
            Identifying dish…
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-4">
          {cuisine && <CuisineTag cuisine={cuisine} />}
          <span className="font-mono text-[0.7rem] text-graphite">
            <CookDate iso={item.cookedAt} />
          </span>
        </div>
      </div>
      {item.tags?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="border border-hairline px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-graphite"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {syncError && (
        <p className="mt-1 font-mono text-[0.65rem] text-graphite">
          unsynced · {syncError}
          {onDiscard && (
            <button
              type="button"
              className="ml-2 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-graphite underline decoration-hairline"
              onClick={(e) => {
                e.preventDefault()
                void onDiscard(item.id)?.catch(() => {})
              }}
            >
              Discard
            </button>
          )}
        </p>
      )}
    </>
  )
  // Unsynced (pending) cards aren't server rows yet — the detail page doesn't
  // exist for them, so a Link would 404.
  return syncError ? (
    <article className="block">{body}</article>
  ) : (
    <Link href={`/cooks/${item.id}`} className="block">
      {body}
    </Link>
  )
}
