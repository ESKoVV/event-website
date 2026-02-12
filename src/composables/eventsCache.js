// src/composables/eventsCache.js
// In-memory кэш + сохранение в sessionStorage (живёт при F5 в этой вкладке)

const STORAGE_KEY = 'biom_events_cache_v1'

// in-memory
let _events = null
let _photosByEventId = null
let _categoryMap = null
let _loadedAt = 0

const safeParse = (s) => {
  try { return JSON.parse(s) } catch { return null }
}

const saveToSession = () => {
  try {
    const payload = {
      loadedAt: _loadedAt,
      events: _events,
      photosByEventId: _photosByEventId,
      categoryMap: _categoryMap
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // игнор
  }
}

const loadFromSession = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const payload = safeParse(raw)
    if (!payload || !Array.isArray(payload.events)) return false

    _events = payload.events
    _photosByEventId = payload.photosByEventId || {}
    _categoryMap = payload.categoryMap || {}
    _loadedAt = Number(payload.loadedAt || Date.now())
    return true
  } catch {
    return false
  }
}

export const setEventsCache = ({ events, photosByEventId, categoryMap }) => {
  if (Array.isArray(events)) _events = events
  if (photosByEventId && typeof photosByEventId === 'object') _photosByEventId = photosByEventId
  if (categoryMap && typeof categoryMap === 'object') _categoryMap = categoryMap
  _loadedAt = Date.now()
  saveToSession()
}

export const getEventsCache = () => {
  // если in-memory пуст — пробуем поднять из sessionStorage
  if (!Array.isArray(_events) || _events.length === 0) {
    loadFromSession()
  }

  return {
    events: _events,
    photosByEventId: _photosByEventId,
    categoryMap: _categoryMap,
    loadedAt: _loadedAt
  }
}

export const clearEventsCache = () => {
  _events = null
  _photosByEventId = null
  _categoryMap = null
  _loadedAt = 0
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}
