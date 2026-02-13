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

const safeUsername = (raw) => {
  const s = String(raw || '').trim()
  if (!s) return ''
  // только латиница/цифры/_
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, '')
  return cleaned.slice(0, 20)
}

const deriveUsernameFromEmail = (email) => {
  const left = String(email || '').split('@')[0] || ''
  const base = safeUsername(left.toLowerCase())
  return base || `user${Math.floor(Math.random() * 900000 + 100000)}`
}

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

  const getEventById = async (id) => {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
    return { data: data ?? null, error }
  }

  const getOrganizerEvents = async (userId, opts = {}) => {
    const { publishedOnly = true, excludeEventId = null } = opts || {}

    let q = supabase.from('events').select('*').eq('user_id', userId).order('date_time_event', { ascending: true })

    if (publishedOnly) q = q.eq('is_published', true)
    if (excludeEventId !== null && excludeEventId !== undefined) q = q.neq('id', excludeEventId)

    const { data, error } = await q
    return { data: data ?? [], error }
  }

  const getMyEvents = async (includeUnpublished = true) => {
    const { user } = await getUser()
    if (!user?.id) return { data: [], error: new Error('Not authorized') }

    let q = supabase.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (!includeUnpublished) q = q.eq('is_published', true)

    const { data, error } = await q
    return { data: data ?? [], error }
  }

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
          is_published: false
        })
      ])
      .select('*')
      .maybeSingle()

    if (e1) return { data: null, error: e1 }
    if (!created?.id) return { data: null, error: new Error('Event not created') }

    if (photo_file) {
      const dataUrl = await readFileAsDataUrl(photo_file)
      const { error: e2 } = await supabase.from('event_photos').insert([{ event_id: created.id, photo_url: dataUrl }])
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

    const { data: existing } = await supabase.from('users').select('*').eq('id', authUser.id).maybeSingle()
    if (existing) return { data: existing, error: null }

    const email = authUser.email || ''
    const name = (authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').trim()

    const username = deriveUsernameFromEmail(email)

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          id: authUser.id,
          email,
          first_name: name ? name.split(' ')[0] : '',
          last_name: name ? name.split(' ').slice(1).join(' ') : '',
          username, // ✅ новый юз
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

    // username чистим на клиенте
    const next = { ...patch }
    if (Object.prototype.hasOwnProperty.call(next, 'username')) {
      next.username = safeUsername(next.username)
      if (!next.username) next.username = null
    }

    const { data, error } = await supabase
      .from('users')
      .update(compact(next))
      .eq('id', user.id)
      .select('*')
      .maybeSingle()

    return { data: data ?? null, error }
  }

  const getPublicUserById = async (userId) => {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
    return { data: data ?? null, error }
  }

  // ✅ поиск пользователей по username / имени / фамилии
  const searchUsers = async (query, limit = 20) => {
    const q = String(query || '').trim()
    if (!q) return { data: [], error: null }

    // Ищем: username, first_name, last_name, email
    // Supabase OR синтаксис: col.ilike.%q%,col2.ilike.%q%
    const like = `%${q}%`
    const { data, error } = await supabase
      .from('users')
      .select('id,username,first_name,last_name,email,image_path,created_at')
      .or(
        `username.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`
      )
      .limit(limit)

    return { data: data ?? [], error }
  }

  // =======================
  // Avatar
  // =======================
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
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }

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

  // =======================
  // Friends
  // =======================
  const sendFriendRequest = async (toUserId) => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }
    if (!toUserId) return { data: null, error: new Error('No user') }

    // не даём дубль/встречную принять на клиенте — просто пробуем вставить
    const { data, error } = await supabase
      .from('friendships')
      .insert([{ requester_id: user.id, addressee_id: toUserId, status: 'pending' }])
      .select('*')
      .maybeSingle()

    return { data: data ?? null, error }
  }

  const acceptFriendRequest = async (fromUserId) => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }
    if (!fromUserId) return { data: null, error: new Error('No user') }

    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('requester_id', fromUserId)
      .eq('addressee_id', user.id)
      .select('*')
      .maybeSingle()

    return { data: data ?? null, error }
  }

  const removeFriendOrRequest = async (otherUserId) => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }
    if (!otherUserId) return { data: null, error: new Error('No user') }

    // удаляем оба направления (если вдруг было создано по-разному)
    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`
      )

    return { data: true, error }
  }

  const getFriendships = async () => {
    const { user } = await getUser()
    if (!user?.id) return { data: [], error: new Error('Not authorized') }

    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })

    return { data: data ?? [], error }
  }

  // =======================
  // Messages
  // =======================
  const sendMessage = async (toUserId, body) => {
    const { user } = await getUser()
    if (!user?.id) return { data: null, error: new Error('Not authorized') }
    const text = String(body || '').trim()
    if (!toUserId) return { data: null, error: new Error('No receiver') }
    if (!text) return { data: null, error: new Error('Empty message') }

    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id: user.id, receiver_id: toUserId, body: text }])
      .select('*')
      .maybeSingle()

    return { data: data ?? null, error }
  }

  const getConversation = async (otherUserId, limit = 100) => {
    const { user } = await getUser()
    if (!user?.id) return { data: [], error: new Error('Not authorized') }
    if (!otherUserId) return { data: [], error: new Error('No user') }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(limit)

    return { data: data ?? [], error }
  }

  const markConversationRead = async (otherUserId) => {
    const { user } = await getUser()
    if (!user?.id) return { ok: false, error: new Error('Not authorized') }
    if (!otherUserId) return { ok: false, error: new Error('No user') }

    // помечаем прочитанными все входящие от otherUserId
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('receiver_id', user.id)
      .eq('sender_id', otherUserId)
      .is('read_at', null)

    return { ok: !error, error }
  }

  // список “тредов”: последние сообщения, сгруппированные по собеседнику (делаем на клиенте)
  const getInboxThreads = async (limit = 200) => {
    const { user } = await getUser()
    if (!user?.id) return { data: [], error: new Error('Not authorized') }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return { data: [], error }

    const rows = data ?? []
    const map = new Map() // otherId -> lastMessage
    for (const m of rows) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id
      if (!map.has(otherId)) map.set(otherId, m)
    }

    return { data: Array.from(map.entries()).map(([otherUserId, lastMessage]) => ({ otherUserId, lastMessage })), error: null }
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
    searchUsers,

    // telegram
    linkTelegramViaEdgeFunction,
    getMyTelegramLink,

    // friends
    sendFriendRequest,
    acceptFriendRequest,
    removeFriendOrRequest,
    getFriendships,

    // messages
    sendMessage,
    getConversation,
    markConversationRead,
    getInboxThreads
  }
}
