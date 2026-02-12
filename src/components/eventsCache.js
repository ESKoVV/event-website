// src/composables/eventsCache.js
// Простой in-memory кэш на время жизни вкладки браузера.

let _events = null          // Array<event>
let _photosByEventId = null // { [eventId]: Array<event_photos_row> }
let _categoryMap = null     // { [idOrName]: name }
let _loadedAt = 0

export const setEventsCache = ({ events, photosByEventId, categoryMap }) => {
  if (Array.isArray(events)) _events = events
  if (photosByEventId && typeof photosByEventId === 'object') _photosByEventId = photosByEventId
  if (categoryMap && typeof categoryMap === 'object') _categoryMap = categoryMap
  _loadedAt = Date.now()
}

export const getEventsCache = () => {
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
}
