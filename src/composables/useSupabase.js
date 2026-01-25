import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export const useSupabase = () => {
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
        created_at
      `
      )
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
        created_at
      `
      )
      .ilike('title', `%${term}%`)
      .order('created_at', { ascending: false })

    return { data, error }
  }

  const getCategories = async () => {
    // предполагаем, что в таблице category есть минимум: id, name
    const { data, error } = await supabase
      .from('category')
      .select('id, name')
      .order('name', { ascending: true })

    return { data, error }
  }

  const getEventPhotos = async (eventIds) => {
    const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : []
    if (ids.length === 0) return { data: [], error: null }

    const { data, error } = await supabase
      .from('event_photos')
      .select('id, event_id, photo_url')
      .in('event_id', ids)
      .order('id', { ascending: true })

    return { data, error }
  }

  return {
    getEvents,
    searchEvents,
    getCategories,
    getEventPhotos
  }
}
