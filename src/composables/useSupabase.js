import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export const useSupabase = () => {
  const getEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  }

  const searchEvents = async (searchTerm) => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .ilike('name', `%${searchTerm}%`)
      .order('created_at', { ascending: false })
    return { data, error }
  }

  const getTags = async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
    return { data, error }
  }

  const getEventsByTag = async (tagId) => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('tag_id', tagId)
      .order('created_at', { ascending: false })
    return { data, error }
  }

  return {
    getEvents,
    searchEvents,
    getTags,
    getEventsByTag
  }
}