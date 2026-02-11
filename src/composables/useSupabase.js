import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Делает URL из Storage "public", если он вдруг пришёл без /public/.
 * Также чистит пробелы.
 */
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

const getFileExt = (file) => {
  const name = String(file?.name || '')
  const ext = name.includes('.') ? name.split('.').pop() : ''
  const clean = String(ext || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return clean || 'png'
}

const isBadUrlScheme = (url) => {
  const s = String(url || '').trim().toLowerCase()
  return s.startsWith('data:') || s.startsWith('blob:')
}

export const useSupabase = () => {
  // ---------------------------
  // EVENTS (ONLY PUBLISHED)
  // ---------------------------
  const getEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select(
        `
        id,
        title,
        description,
        date_time_event,
        address,
        organizer,
        price,
        is_online,
        is_free,
        user_id,
        selectCategory,
        is_published,
        created_at
      `
      )
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    return { data, error }
  }

  const getCategories = async () => {
    const { data, error } = await supabase.from('category').select('id, name').order('name', { ascending: true })
    return { data, error }
  }

  const getEventPhotos = async (eventIds) => {
    if (!Array.isArray(eventIds) || eventIds.length === 0) return { data: [], error: null }

    const { data, error } = await supabase
      .from('event_photos')
      .select('id, event_id, photo_url')
      .in('event_id', eventIds)
      .order('id', { ascending: true })

    return { data: data ?? [], error }
  }

  // ---------------------------
  // AUTH
  // ---------------------------
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

  // ---------------------------
  // PROFILE (public.users)
  // ---------------------------
  const ensurePublicUserRow = async (authUser) => {
    if (!authUser?.id) return { data: null, error: null }

    const meta = authUser.user_metadata || {}

    const { data: existing, error: exErr } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('id', authUser.id)
      .maybeSingle()

    if (exErr) return { data: null, error: exErr }

    const firstFromMeta = meta.given_name ?? meta.first_name
    const lastFromMeta = meta.family_name ?? meta.last_name

    const payload = compact({
      id: authUser.id,
      email: existing?.email ?? authUser.email ?? null,
      first_name: existing?.first_name ? undefined : firstFromMeta ?? undefined,
      last_name: existing?.last_name ? undefined : lastFromMeta ?? undefined
    })

    const { data, error } = await supabase.from('users').upsert(payload, { onConflict: 'id' }).select().single()
    return { data, error }
  }

  const getMyPublicUser = async () => {
    const { user } = await getUser()
    if (!user) return { data: null, error: null }

    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (data?.image_path) data.image_path = normalizeStoragePublicUrl(data.image_path)
    return { data, error }
  }

  const updateMyPublicUser = async (patch) => {
    const { user } = await getUser()
    if (!user) return { data: null, error: new Error('No auth user') }

    const safePatch = { ...patch }
    // запрещаем менять бизнес-флаг из клиента
    delete safePatch.It_business

    for (const k of Object.keys(safePatch)) {
      if (safePatch[k] === '') safePatch[k] = null
    }
    if (safePatch.image_path) safePatch.image_path = normalizeStoragePublicUrl(safePatch.image_path)

    const { data, error } = await supabase.from('users').update(safePatch).eq('id', user.id).select().single()
    if (data?.image_path) data.image_path = normalizeStoragePublicUrl(data.image_path)
    return { data, error }
  }

  // ---------------------------
  // AVATAR UPLOAD (Storage -> users.image_path)
  // ---------------------------
  const uploadAvatar = async (file) => {
    const { user } = await getUser()
    if (!user) return { publicUrl: null, error: new Error('No auth user') }
    if (!file) return { publicUrl: null, error: new Error('No file') }

    const envBucket = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || '').trim()
    const buckets = [...new Set([envBucket, 'avatars', 'Biom', 'biom'].filter(Boolean))]

    const ext = getFileExt(file)
    const path = `ProfileImage/${user.id}/${Date.now()}.${ext}`

    let lastErr = null

    for (const bucket of buckets) {
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
      if (upErr) {
        lastErr = upErr
        if (String(upErr?.message || '').toLowerCase().includes('bucket not found')) continue
        return { publicUrl: null, error: upErr }
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      const publicUrl = normalizeStoragePublicUrl(data?.publicUrl || '')
      return { publicUrl, error: null }
    }

    return {
      publicUrl: null,
      error:
        lastErr ||
        new Error('Bucket not found. Создай bucket в Storage (например "avatars") и укажи VITE_SUPABASE_AVATAR_BUCKET.')
    }
  }

  // ---------------------------
  // EVENT PHOTO UPLOAD (Storage -> event_photos.photo_url)
  // ---------------------------
  const uploadEventPhotoToStorage = async (eventId, file) => {
    if (!eventId) return { publicUrl: null, error: new Error('No eventId') }
    if (!file) return { publicUrl: null, error: new Error('No file') }

    // ✅ ОДИН источник истины: этот bucket
    // .env: VITE_SUPABASE_EVENT_PHOTOS_BUCKET=event-photos
    const bucket = (import.meta.env.VITE_SUPABASE_EVENT_PHOTOS_BUCKET || 'event-photos').trim()

    const ext = getFileExt(file)
    const path = `EventPhotos/${eventId}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (upErr) return { publicUrl: null, error: upErr }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl = normalizeStoragePublicUrl(data?.publicUrl || '')

    if (!publicUrl) return { publicUrl: null, error: new Error('Не удалось получить publicUrl') }
    if (isBadUrlScheme(publicUrl)) return { publicUrl: null, error: new Error('Bad url scheme for photo') }

    return { publicUrl, error: null }
  }

  // ---------------------------
  // BUSINESS EVENTS: create draft (is_published=false) + optional photo file
  // ---------------------------
  const createBusinessEvent = async (payload) => {
    const { user, error: userErr } = await getUser()
    if (userErr) return { data: null, error: userErr }
    if (!user) return { data: null, error: new Error('Нет авторизации') }

    const price = Number(payload?.price ?? 0)
    const is_free = payload?.is_free === true || (Number.isFinite(price) && price <= 0)

    const eventInsert = {
      title: payload?.title ?? null,
      description: payload?.description ?? null,
      date_time_event: payload?.date_time_event ?? null,
      address: payload?.address ?? null,
      organizer: payload?.organizer ?? null,
      price: Number.isFinite(price) ? price : 0,
      is_online: !!payload?.is_online,
      is_free,
      user_id: user.id,
      selectCategory: Array.isArray(payload?.selectCategory) ? payload.selectCategory : [],
      is_published: false
    }

    // 1) создаём событие
    const { data: eventRow, error: insErr } = await supabase.from('events').insert(eventInsert).select().single()
    if (insErr) return { data: null, error: insErr }

    // 2) если есть файл — грузим в Storage и пишем в public.event_photos.photo_url
    const file = payload?.photo_file || null
    if (file) {
      const { publicUrl, error: upErr } = await uploadEventPhotoToStorage(eventRow.id, file)
      if (upErr) return { data: eventRow, error: upErr }

      // ✅ ВОТ СЮДА сохраняем фото
      const { error: phErr } = await supabase.from('event_photos').insert({
        event_id: eventRow.id,
        photo_url: publicUrl
      })
      if (phErr) return { data: eventRow, error: phErr }
    }

    return { data: eventRow, error: null }
  }

  // ---------------------------
  // TELEGRAM
  // ---------------------------
  const linkTelegramViaEdgeFunction = async (telegramAuthData) => {
    const { data, error } = await supabase.functions.invoke('telegram-verify', { body: telegramAuthData })
    return { data, error }
  }

  const getMyTelegramLink = async () => {
    const { user } = await getUser()
    if (!user) return { data: null, error: null }

    const { data, error } = await supabase.from('user_telegram').select('*').eq('user_id', user.id).maybeSingle()
    return { data: data ?? null, error }
  }

  return {
    // events
    getEvents,
    getCategories,
    getEventPhotos,
    createBusinessEvent,

    // auth
    getSession,
    getUser,
    signInWithGoogle,
    signOut,

    // profile
    ensurePublicUserRow,
    getMyPublicUser,
    updateMyPublicUser,
    uploadAvatar,

    // telegram
    linkTelegramViaEdgeFunction,
    getMyTelegramLink
  }
}
