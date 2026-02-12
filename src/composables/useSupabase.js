import { createClient } from '@supabase/supabase-js'

export function useSupabase() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

  const signInWithGoogle = async ({ redirectTo }) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    })
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  // ---------------------------
  // PUBLIC USERS
  // ---------------------------
  const ensurePublicUserRow = async (user) => {
    if (!user?.id) return { data: null, error: null }

    const { data: exists, error: e1 } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle()
    if (e1) return { data: null, error: e1 }
    if (exists?.id) return { data: exists, error: null }

    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')?.[0] ||
      'Пользователь'

    const { data, error } = await supabase.from('users').insert({ id: user.id, name: displayName }).select().single()
    return { data, error }
  }

  const getMyPublicUser = async () => {
    const { user } = await getUser()
    if (!user) return { data: null, error: null }

    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
    return { data: data ?? null, error }
  }

  const updateMyPublicUser = async (patch) => {
    const { user } = await getUser()
    if (!user) return { data: null, error: new Error('Not authenticated') }

    const { data, error } = await supabase.from('users').update(patch).eq('id', user.id).select().maybeSingle()
    return { data: data ?? null, error }
  }

  // ---------------------------
  // EVENTS
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

  const searchEvents = async (searchTerm) => {
    const term = (searchTerm || '').trim()
    if (!term) return getEvents()

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
      .ilike('title', `%${term}%`)
      .order('created_at', { ascending: false })

    return { data, error }
  }

  const getEventById = async (eventId) => {
    const idNum = Number(eventId)
    if (!Number.isFinite(idNum)) return { data: null, error: new Error('Некорректный id') }

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
      .eq('id', idNum)
      .maybeSingle()

    return { data: data ?? null, error }
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
  // FAVORITES ✅
  // ---------------------------
  const getFavoriteEventIds = async () => {
    const { user } = await getUser()
    if (!user) return { data: [], error: null }

    const { data, error } = await supabase
      .from('favorites')
      .select('event_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return { data: (data ?? []).map((x) => x.event_id), error }
  }

  const addFavorite = async (eventId) => {
    const { user } = await getUser()
    if (!user) return { data: null, error: new Error('Not authenticated') }

    const idNum = Number(eventId)
    if (!Number.isFinite(idNum)) return { data: null, error: new Error('Некорректный id') }

    // upsert по PK (user_id, event_id)
    const { data, error } = await supabase
      .from('favorites')
      .upsert({ user_id: user.id, event_id: idNum })
      .select()
      .maybeSingle()

    return { data: data ?? null, error }
  }

  const removeFavorite = async (eventId) => {
    const { user } = await getUser()
    if (!user) return { data: null, error: new Error('Not authenticated') }

    const idNum = Number(eventId)
    if (!Number.isFinite(idNum)) return { data: null, error: new Error('Некорректный id') }

    const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('event_id', idNum)
    return { data: null, error }
  }

  const toggleFavorite = async (eventId, makeFavorite) => {
    return makeFavorite ? addFavorite(eventId) : removeFavorite(eventId)
  }

  // ---------------------------
  // BUSINESS: CREATE EVENT + MULTI PHOTOS
  // ---------------------------
  const createBusinessEvent = async (payload) => {
    const { user } = await getUser()
    if (!user) return { data: null, error: new Error('Not authenticated') }

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
      photo_files
    } = payload || {}

    const { data: inserted, error: e1 } = await supabase
      .from('events')
      .insert({
        title,
        description,
        date_time_event,
        address,
        organizer,
        price,
        is_online,
        is_free,
        selectCategory,
        user_id: user.id,
        is_published: false
      })
      .select()
      .single()

    if (e1) return { data: null, error: e1 }
    const eventId = inserted.id

    if (Array.isArray(photo_files) && photo_files.length) {
      const rows = []
      for (const file of photo_files) {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result || ''))
          r.onerror = reject
          r.readAsDataURL(file)
        })
        if (dataUrl) rows.push({ event_id: eventId, photo_url: dataUrl })
      }
      if (rows.length) {
        const { error: e2 } = await supabase.from('event_photos').insert(rows)
        if (e2) console.warn('event_photos insert error:', e2)
      }
    }

    return { data: inserted, error: null }
  }

  // ---------------------------
  // AVATAR
  // ---------------------------
  const uploadAvatar = async (file) => {
    const bucket = import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars'
    const { user } = await getUser()
    if (!user) return { publicUrl: null, error: new Error('Not authenticated') }

    const ext = (file?.name || 'png').split('.').pop() || 'png'
    const path = `${user.id}/${Date.now()}.${ext}`

    const { error: e1 } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true
    })
    if (e1) return { publicUrl: null, error: e1 }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl = data?.publicUrl || null
    if (!publicUrl) return { publicUrl: null, error: new Error('No public url') }

    return { publicUrl, error: null }
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
    searchEvents,
    getEventById,
    getCategories,
    getEventPhotos,
    createBusinessEvent,

    // favorites ✅
    getFavoriteEventIds,
    addFavorite,
    removeFavorite,
    toggleFavorite,

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
