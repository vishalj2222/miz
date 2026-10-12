import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ensureProfile, isAllowedEmail } from '@/lib/auth'
import { fetchItems } from '@/lib/feed-server'
import { cuisineColor } from '@/lib/cuisine'
import { CookCard } from '@/components/cook-card'

export default async function CuisinePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user || !isAllowedEmail(data.user.email)) redirect('/login')
  await ensureProfile(supabase)

  const cuisine = decodeURIComponent((await params).name)
  const { view } = await searchParams

  // Same selector rule as the feed: you browse the log you're looking at.
  const { data: memberRows } = await supabase.rpc('list_profiles')
  const members = (memberRows ?? []) as { id: string; display_name: string | null }[]
  const viewed = view ? members.find((m) => m.id === view && m.id !== data.user!.id) : undefined

  const items = await fetchItems(supabase, viewed?.id ?? data.user.id, { cuisine })

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-5 pb-12 pt-5">
      <header className="border-b border-hairline pb-5">
        <div className="flex items-baseline justify-between">
          <Link
            href={viewed ? `/?view=${viewed.id}` : '/'}
            className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite"
          >
            ← Mise
          </Link>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite">
            {items.length} {items.length === 1 ? 'cook' : 'cooks'}
          </p>
        </div>
        <h1 className="mt-4 inline-flex items-center gap-2.5 font-mono text-sm uppercase tracking-[0.16em] text-ink">
          <span
            aria-hidden
            className="h-[9px] w-[9px] rounded-full"
            style={{ backgroundColor: cuisineColor(cuisine) }}
          />
          {cuisine}
        </h1>
      </header>
      {items.length === 0 ? (
        <p className="mt-6 text-graphite">Nothing logged under {cuisine} yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-12">
          {items.map((item) => (
            <CookCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  )
}
