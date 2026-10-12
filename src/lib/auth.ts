import { createServerClient } from '@/lib/supabase/server'
import { firstNameFromEmail } from '@/lib/names'

const allowed = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAllowedEmail(email: string | undefined): boolean {
  return !!email && allowed.includes(email.trim().toLowerCase())
}

export async function ensureProfile(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
): Promise<void> {
  const { data } = await supabase.auth.getUser()
  if (data.user) {
    await supabase
      .from('profile')
      .upsert(
        { id: data.user.id, display_name: firstNameFromEmail(data.user.email) },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  }
}
