import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

const compact = (obj) => {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v
  }
  return out
}

// ✅ File -> data:image/... base64
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    } catch (e) {
      reject(e)
    }
  })

export const useSupabase = () => {
  // =======================
  // Events
  // =======================
  const getEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date_time_event', { ascending: true })
    return { data, error }
  }

  const searchEvents = async (query) => {
    const q = String(query || '').trim()
    if (!q) return getEvents()

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .ilike('title', `%${q}%`)
      .order('date_time_event', { ascending: true })

    return { data, error }
  }

  const getCategories = async () => {
    const { data, error } = await supabase.from('category').select('*').order('id', { ascending: true })
    return { data, error }
  }

  // ids: number[]
  const getEventPhotos = async (eventIds) => {
    const ids = Array.isArray(eventIds) ? eventIds.filter((x) => x !== null && x !== undefined) : []
    if (!ids.length) return { data: [], error: null }

    const { data, error } = await supabase
      .from('event_photos')
      .select('id,event_id,photo_url')
      .in('event_id', ids)
      .order('id', { ascending: true })

    return { data: data ?? [], error }
  }

  // ✅ single event by id
  const getEventById = async (id) => {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
    return { data: data ?? null, error }
  }

  // ✅ organizer events (public page: only published; for owner: include unpublished)
  const getOrganizerEvents = async (userId, opts = {}) => {
    const { publishedOnly = true, excludeEventId = null } = opts || {}

    let q = supabase.from('events').select('*').eq('user_id', userId).order('date_time_event', { ascending: true })

    if (publishedOnly) q = q.eq('is_published', true)
    if (excludeEventId !== null && excludeEventId !== undefined) q = q.neq('id', excludeEventId)

    const { data, error } = await q
    return { data: data ?? [], error }
  }

  // ✅ for business: my events (published + in review)
  const getMyEvents = async (includeUnpublished = true) => {
    const { user } = await getUser()
    if (!user?.id) return { data: [], error: new Error('Not authorized') }

    let q = supabase.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (!includeUnpublished) q = q.eq('is_published', true)

    const { data, error } = await q
    return { data: data ?? [], error }
  }

  // business event create (goes to moderation => is_published false)
  const createBusinessEvent = async (payload) => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }

    const {
      title,
      description,
      date_time_event,
      address,
      organizer,
      price,
      is_online,
      is_free,
      selectCategory,
      photo_file
    } = payload || {}

    // 1) create event first
    const { data: created, error: e1 } = await supabase
      .from('events')
      .insert([
        compact({
          title,
          description,
          date_time_event,
          address,
          organizer,
          price,
          is_online,
          is_free,
          user_id: user.id,
          selectCategory,
          is_published: false // ✅ предложка
        })
      ])
      .select('*')
      .maybeSingle()

    if (e1) return { data: null, error: e1 }
    if (!created?.id) return { data: null, error: new Error('Event not created') }

    // 2) upload photo if exists
    if (photo_file) {
      // current project used dataUrl previously to make it work reliably (no storage permissions issues)
      // We'll keep it simple: store as dataUrl in event_photos.photo_url
      const dataUrl = await readFileAsDataUrl(photo_file)
      const { error: e2 } = await supabase
        .from('event_photos')
        .insert([{ event_id: created.id, photo_url: dataUrl }])

      if (e2) return { data: created, error: e2 }
    }

    return { data: created, error: null }
  }

  // =======================
  // Auth
  // =======================
  const getSession = async () => {
    const { data, error } = await supabase.auth.getSession()
    return { session: data?.session ?? null, error }
  }

  const getUser = async () => {
    const { data, error } = await supabase.auth.getUser()
    return { user: data?.user ?? null, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const signInWithGoogle = async ({ redirectTo }) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    })
    return { data, error }
  }

  // =======================
  // Profile (public.users)
  // =======================
  const ensurePublicUserRow = async (authUser) => {
    if (!authUser?.id) return { data: null, error: new Error('No auth user') }

    const { data: existing, error: e1 } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle()
    if (e1 && e1.code !== 'PGRST116') {
      // PGRST116 = no rows (maybeSingle), ignore
    }
    if (existing) return { data: existing, error: null }

    const email = authUser.email || ''
    const name = (authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').trim()

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          id: authUser.id,
          email,
          first_name: name ? name.split(' ')[0] : '',
          last_name: name ? name.split(' ').slice(1).join(' ') : '',
          It_business: false,
          interests: []
        }
      ])
      .select('*')
      .maybeSingle()

    return { data: data ?? null, error }
  }

  const getMyPublicUser = async () => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }

    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
    return { data: data ?? null, error }
  }

  const updateMyPublicUser = async (patch) => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }

    const { data, error } = await supabase.from('users').update(compact(patch)).eq('id', user.id).select('*').maybeSingle()
    return { data: data ?? null, error }
  }

  // ✅ public organizer profile by id
  const getPublicUserById = async (userId) => {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
    return { data: data ?? null, error }
  }

  const uploadAvatar = async (file) => {
    const { user } = await getUser()
    if (!user?.id) return { publicUrl: '', error: new Error('Not authorized') }
    if (!file) return { publicUrl: '', error: new Error('No file') }

    const ext = (file.name || 'png').split('.').pop()
    const filePath = `avatars/${user.id}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from('public').upload(filePath, file, {
      upsert: true,
      cacheControl: '3600'
    })
    if (upErr) return { publicUrl: '', error: upErr }

    const { data } = supabase.storage.from('public').getPublicUrl(filePath)
    const publicUrl = normalizeStoragePublicUrl(data?.publicUrl || '')
    return { publicUrl, error: null }
  }

  // =======================
  // Telegram
  // =======================
  const linkTelegramViaEdgeFunction = async (telegramAuthData) => {
    // your existing logic may differ; keep as-is if you already had it
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }

    // placeholder: assumes you have Edge Function "telegram-link"
    const { data, error } = await supabase.functions.invoke('telegram-link', {
      body: { telegramAuthData }
    })
    return { data, error }
  }

  const getMyTelegramLink = async () => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }

    const { data, error } = await supabase.from('user_telegram').select('*').eq('user_id', user.id).maybeSingle()
    return { data: data ?? null, error }
  }

  return {
    // events
    getEvents,
    searchEvents,
    getCategories,
    getEventPhotos,
    getEventById,
    getOrganizerEvents,
    getMyEvents,
    createBusinessEvent,

    // auth
    getSession,
    getUser,
    signInWithGoogle,
    signOut,

    // profile
    ensurePublicUserRow,
    getMyPublicUser,
    getPublicUserById,
    updateMyPublicUser,
    uploadAvatar,

    // telegram
    linkTelegramViaEdgeFunction,
    getMyTelegramLink
  }
}
