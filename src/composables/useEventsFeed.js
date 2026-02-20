// src/composables/useEventsFeed.js
import { ref, computed } from 'vue'
import { useSupabase } from './useSupabase.js'

export const useEventsFeed = () => {
  const { getEventsPage, getCategories, getEventPhotos } = useSupabase()

  // ===== базовые данные ленты =====
  const events = ref([]) // только события (без фоток)
  const categoryMap = ref({})
  const loadingFirst = ref(false)

  // пагинация
  const pageSize = ref(10)
  const offset = ref(0)
  const loadingPage = ref(false)
  const hasMore = ref(true)

  // ===== фотки (лениво + по очереди) =====
  const photosByEventId = ref({}) // { [id]: [{id,event_id,photo_url}] }
  const photosLoadingById = ref({}) // { [id]: boolean }

  // очередь на загрузку фоток: строго по одному
  const photoQueue = ref([]) // [eventId, ...]
  const processingQueue = ref(false)

  const eventsCount = computed(() => events.value.length)

  const buildCategoryMap = (rows) => {
    const map = {}
    for (const c of rows || []) {
      const id = c?.id
      const name = c?.name
      if (id !== undefined && id !== null) map[String(id)] = String(name || '').trim()
      if (name) map[String(name).trim()] = String(name).trim()
    }
    return map
  }

  const ensureCategories = async () => {
    if (Object.keys(categoryMap.value || {}).length > 0) return
    const { data, error } = await getCategories()
    if (error) return
    categoryMap.value = buildCategoryMap(data || [])
  }

  const fetchNextPage = async () => {
    if (loadingPage.value) return
    if (!hasMore.value) return

    loadingPage.value = true
    try {
      const from = offset.value
      const to = offset.value + pageSize.value - 1

      const { data, error } = await getEventsPage({ from, to })
      if (error) return

      const rows = Array.isArray(data) ? data : []
      if (rows.length === 0) {
        hasMore.value = false
        return
      }

      events.value = [...events.value, ...rows]
      offset.value += rows.length

      // если пришло меньше чем pageSize — скорее всего больше нет
      if (rows.length < pageSize.value) {
        hasMore.value = false
      }
    } finally {
      loadingPage.value = false
    }
  }

  const initFeed = async () => {
    loadingFirst.value = true
    try {
      events.value = []
      photosByEventId.value = {}
      photosLoadingById.value = {}
      photoQueue.value = []
      processingQueue.value = false

      offset.value = 0
      hasMore.value = true

      await ensureCategories()
      await fetchNextPage()
    } finally {
      loadingFirst.value = false
    }
  }

  const isPhotosLoaded = (eventId) => {
    const id = String(eventId || '')
    const list = photosByEventId.value?.[id]
    return Array.isArray(list)
  }

  const isPhotosLoading = (eventId) => {
    const id = String(eventId || '')
    return !!photosLoadingById.value?.[id]
  }

  const setPhotosLoading = (eventId, v) => {
    const id = String(eventId || '')
    photosLoadingById.value = { ...photosLoadingById.value, [id]: !!v }
  }

  const setPhotos = (eventId, photos) => {
    const id = String(eventId || '')
    photosByEventId.value = { ...photosByEventId.value, [id]: Array.isArray(photos) ? photos : [] }
  }

  const enqueuePhotosLoad = (eventId) => {
    const id = String(eventId || '')
    if (!id) return

    if (isPhotosLoaded(id)) return
    if (isPhotosLoading(id)) return
    if (photoQueue.value.includes(id)) return

    photoQueue.value = [...photoQueue.value, id]
    processPhotoQueue()
  }

  const processPhotoQueue = async () => {
    if (processingQueue.value) return
    processingQueue.value = true

    try {
      while (photoQueue.value.length > 0) {
        const id = photoQueue.value[0]
        photoQueue.value = photoQueue.value.slice(1)

        if (!id) continue
        if (isPhotosLoaded(id)) continue
        if (isPhotosLoading(id)) continue

        setPhotosLoading(id, true)
        try {
          const { data, error } = await getEventPhotos([Number(id)])
          if (!error) {
            // getEventPhotos возвращает список по нескольким event_id, но мы передаём один
            const list = (data || []).filter((p) => String(p?.event_id) === String(id))
            setPhotos(id, list)
          } else {
            setPhotos(id, [])
          }
        } catch {
          setPhotos(id, [])
        } finally {
          setPhotosLoading(id, false)
        }
      }
    } finally {
      processingQueue.value = false
    }
  }

  const getPhotosForEvent = (eventId) => {
    const id = String(eventId || '')
    return photosByEventId.value?.[id] || []
  }

  return {
    // state
    events,
    categoryMap,
    loadingFirst,
    loadingPage,
    hasMore,
    eventsCount,

    // actions
    initFeed,
    fetchNextPage,

    // photos (sequential queue)
    enqueuePhotosLoad,
    getPhotosForEvent,
    isPhotosLoading
  }
}
