<template>
  <div class="page">
    <div class="container">
      <!-- Filters moved to a separate component -->
      <FiltersPanel
        :categories="categories"
        :is-all-categories-active="isAllCategoriesActive"
        v-model:selectedCategoryNames="selectedCategoryNames"
        v-model:priceMode="priceMode"
        v-model:customPriceMin="customPriceMin"
        v-model:customPriceMax="customPriceMax"
        v-model:dateMode="dateMode"
        v-model:dateOn="dateOn"
        v-model:dateFrom="dateFrom"
        v-model:dateTo="dateTo"
        v-model:datePivot="datePivot"
        v-model:onlineOnly="onlineOnly"
        @reset="resetAllFilters"
      />

      <!-- STATES -->
      <div v-if="!initialLoaded" class="state">
        <div class="spinner"></div>
        <div>Загрузка мероприятий…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Не удалось загрузить мероприятия</div>
        <div class="error-sub">{{ error }}</div>
        <button class="retry" @click="reload">Повторить</button>
      </div>

      <div v-else-if="filteredEvents.length === 0" class="state">Мероприятия не найдены</div>

      <!-- EVENTS LIST -->
      <div v-else class="events-shell">
        <div class="events-title">
          Мероприятия
          <span class="events-count">{{ filteredEvents.length }}</span>
          <span v-if="progressiveLoading" class="events-progress">подгружаю…</span>
        </div>

        <TransitionGroup name="list" tag="div" class="events-list">
          <EventCard
            v-for="event in filteredEvents"
            :key="event.id"
            :event="event"
            :photos="photos[event.id] || []"
            :photos-loading="photosLoading"
            :category-map="categoryMap"
            @open-photo="openPhoto"
          />
        </TransitionGroup>
      </div>
    </div>

    <!-- PHOTO MODAL -->
    <EventPhotoModal v-if="photoModalUrl" :url="photoModalUrl" @close="photoModalUrl = ''" />
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import EventCard from '../../components/EventCard.vue'
import EventPhotoModal from '../../components/EventPhotoModal.vue'
import FiltersPanel from '../../components/FiltersPanel.vue'
import { useSupabase } from '../../composables/useSupabase'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const withRetry = async (fn, tries = 3) => {
  let lastErr = null
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      await sleep(350 * (i + 1))
    }
  }
  throw lastErr
}

/**
 * Нормализуем event.selectCategory -> МАССИВ НАЗВАНИЙ
 * Поддержка:
 * - text[] => ["Спорт","Хобби"]
 * - "Спорт,Хобби" / "Спорт;Хобби"
 * - id / [id,id] -> подставим name по categoryMap
 */
const normalizeCategoryNames = (raw, categoryMap) => {
  const map = categoryMap || {}

  const toName = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v).trim()
    if (!s) return ''
    if (map[s]) return String(map[s]).trim()
    const n = Number(s)
    if (!Number.isNaN(n) && map[String(n)]) return String(map[String(n)]).trim()
    return s
  }

  if (!raw) return []

  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map(toName).filter(Boolean)))
  }

  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    const parts = s
      .split(/[,;|]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .map(toName)
      .filter(Boolean)
    return Array.from(new Set(parts))
  }

  const one = toName(raw)
  return one ? [one] : []
}

const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

const parseEventDate = (value) => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const parseDateInput = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return null
  const [y, m, day] = yyyy_mm_dd.split('-').map((x) => Number(x))
  if (!y || !m || !day) return null
  return new Date(y, m - 1, day)
}

export default {
  name: 'HomeView',
  components: { EventCard, EventPhotoModal, FiltersPanel },
  props: {
    globalSearchTerm: { type: String, default: '' }
  },
  setup(props) {
    const { getEvents, getCategories, getEventPhotos } = useSupabase()

    const initialLoaded = ref(false)
    const error = ref(null)

    const allEvents = ref([])
    const visibleEvents = ref([])

    const progressiveLoading = ref(false)
    let progressiveTimer = null

    const photos = ref({})

    const categories = ref([])
    const categoryMap = ref({}) // id -> name

    // Categories (names)
    const selectedCategoryNames = ref([])
    const isAllCategoriesActive = computed(() => selectedCategoryNames.value.length === 0)

    // Online checkbox
    const onlineOnly = ref(false)

    // Price
    const priceMode = ref('all')
    const customPriceMin = ref('')
    const customPriceMax = ref('')

    // Date
    const dateMode = ref('all')
    const dateOn = ref('')
    const dateFrom = ref('')
    const dateTo = ref('')
    const datePivot = ref('')

    const photosLoading = ref(false)
    const stopPhotosLoading = ref(false)

    const photoModalUrl = ref('')

    const openPhoto = (url) => {
      if (!url) return
      photoModalUrl.value = url
    }

    const resetAllFilters = () => {
      selectedCategoryNames.value = []
      onlineOnly.value = false

      priceMode.value = 'all'
      customPriceMin.value = ''
      customPriceMax.value = ''

      dateMode.value = 'all'
      dateOn.value = ''
      dateFrom.value = ''
      dateTo.value = ''
      datePivot.value = ''
    }

    // ---------- filtering ----------
    const matchesSelectedCategories = (event) => {
      if (selectedCategoryNames.value.length === 0) return true

      const eventCats = normalizeCategoryNames(event?.selectCategory, categoryMap.value)
      if (!eventCats.length) return false

      const selectedSet = new Set(selectedCategoryNames.value)
      return eventCats.some((c) => selectedSet.has(c))
    }

    const matchesOnline = (event) => {
      if (!onlineOnly.value) return true
      return event?.is_online === true
    }

    const getEventPrice = (event) => {
      if (event?.is_free === true) return 0
      const p = toNumberOrNull(event?.price)
      if (p === null) return null
      return p
    }

    const matchesPrice = (event) => {
      const mode = priceMode.value
      if (mode === 'all') return true

      const price = getEventPrice(event)

      if (mode === 'free') return price === 0
      if (price === null) return false

      if (mode === '100_1000') return price >= 100 && price <= 1000
      if (mode === '1000_3000') return price >= 1000 && price <= 3000
      if (mode === '3000_10000') return price >= 3000 && price <= 10000
      if (mode === 'gt_10000') return price > 10000

      if (mode === 'custom') {
        const min = customPriceMin.value === '' ? null : toNumberOrNull(customPriceMin.value)
        const max = customPriceMax.value === '' ? null : toNumberOrNull(customPriceMax.value)

        const okMin = min === null ? true : price >= min
        const okMax = max === null ? true : price <= max
        return okMin && okMax
      }

      return true
    }

    const matchesDate = (event) => {
      const mode = dateMode.value
      if (mode === 'all') return true

      const d = parseEventDate(event?.date_time_event)
      if (!d) return false

      if (mode === 'today') {
        const now = new Date()
        return d >= startOfDay(now) && d <= endOfDay(now)
      }

      if (mode === 'next7') {
        const now = new Date()
        const from = startOfDay(now)
        const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
        return d >= from && d <= to
      }

      if (mode === 'on') {
        const on = parseDateInput(dateOn.value)
        if (!on) return true
        return d >= startOfDay(on) && d <= endOfDay(on)
      }

      if (mode === 'range') {
        const fromD = parseDateInput(dateFrom.value)
        const toD = parseDateInput(dateTo.value)
        if (!fromD && !toD) return true
        const from = fromD ? startOfDay(fromD) : null
        const to = toD ? endOfDay(toD) : null
        const okFrom = from ? d >= from : true
        const okTo = to ? d <= to : true
        return okFrom && okTo
      }

      if (mode === 'after') {
        const pivot = parseDateInput(datePivot.value)
        if (!pivot) return true
        return d >= startOfDay(pivot)
      }

      if (mode === 'before') {
        const pivot = parseDateInput(datePivot.value)
        if (!pivot) return true
        return d <= endOfDay(pivot)
      }

      return true
    }

    const matchesSearch = (event) => {
      const term = (props.globalSearchTerm || '').trim().toLowerCase()
      if (!term) return true

      const t = (event.title || '').toLowerCase()
      const d = (event.description || '').toLowerCase()
      const a = (event.address || '').toLowerCase()
      const o = (event.organizer || '').toLowerCase()
      return t.includes(term) || d.includes(term) || a.includes(term) || o.includes(term)
    }

    const filteredEvents = computed(() => {
      return visibleEvents.value.filter(
        (e) =>
          matchesSelectedCategories(e) &&
          matchesOnline(e) &&
          matchesPrice(e) &&
          matchesDate(e) &&
          matchesSearch(e)
      )
    })

    // ---------- progressive loading ----------
    const stopProgressive = () => {
      progressiveLoading.value = false
      if (progressiveTimer) {
        clearInterval(progressiveTimer)
        progressiveTimer = null
      }
    }

    const startProgressive = (source) => {
      stopProgressive()
      visibleEvents.value = []

      const list = Array.isArray(source) ? source : []
      if (!list.length) return

      progressiveLoading.value = true
      visibleEvents.value.push(list[0])

      let i = 1
      progressiveTimer = setInterval(() => {
        if (i >= list.length) {
          stopProgressive()
          return
        }
        visibleEvents.value.push(list[i])
        i++
      }, 140)
    }

    // ---------- data loading ----------
    const loadCategories = async () => {
      try {
        const { data, error: err } = await withRetry(() => getCategories())
        if (err) throw err

        categories.value = data ?? []
        categoryMap.value = (categories.value || []).reduce((acc, c) => {
          acc[String(c.id)] = c.name
          return acc
        }, {})
      } catch (e) {
        console.warn('Categories load error:', e)
        categories.value = []
        categoryMap.value = {}
      }
    }

    const loadEventsProgressive = async () => {
      error.value = null
      stopPhotosLoading.value = true
      photosLoading.value = false
      stopProgressive()

      try {
        const { data: eventsData, error: eventsErr } = await withRetry(() => getEvents())
        if (eventsErr) throw eventsErr

        allEvents.value = eventsData ?? []
        initialLoaded.value = true

        startProgressive(allEvents.value)

        // photos in background
        photos.value = {}
        stopPhotosLoading.value = false

        const ids = allEvents.value.map((e) => e.id).filter(Boolean)
        if (!ids.length) return

        photosLoading.value = true

        const batchSize = 5
        for (let i = 0; i < ids.length; i += batchSize) {
          if (stopPhotosLoading.value) break

          const batch = ids.slice(i, i + batchSize)
          try {
            const { data: ph, error: phErr } = await withRetry(() => getEventPhotos(batch))
            if (phErr) throw phErr

            const next = { ...photos.value }
            for (const p of ph ?? []) {
              if (!p?.event_id) continue
              if (!next[p.event_id]) next[p.event_id] = []
              next[p.event_id].push(p)
            }
            photos.value = next
          } catch (e) {
            console.warn('Photos batch load error:', e)
          }

          await sleep(120)
        }
      } catch (e) {
        console.error('HomeView load error:', e)
        allEvents.value = []
        visibleEvents.value = []
        photos.value = {}
        initialLoaded.value = true
        error.value = e?.message ? String(e.message) : 'TypeError: Failed to fetch'
      } finally {
        photosLoading.value = false
      }
    }

    const reload = async () => {
      await loadEventsProgressive()
    }

    onMounted(async () => {
      await loadCategories()
      await loadEventsProgressive()
    })

    onBeforeUnmount(() => {
      stopProgressive()
      stopPhotosLoading.value = true
    })

    return {
      initialLoaded,
      error,

      photos,
      categories,
      categoryMap,

      selectedCategoryNames,
      isAllCategoriesActive,

      onlineOnly,

      priceMode,
      customPriceMin,
      customPriceMax,

      dateMode,
      dateOn,
      dateFrom,
      dateTo,
      datePivot,

      filteredEvents,
      photosLoading,
      progressiveLoading,

      resetAllFilters,
      reload,

      photoModalUrl,
      openPhoto
    }
  }
}
</script>

<style scoped>
.page {
  padding: 16px 0 40px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

/* STATES */
.state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 40px 0;
  opacity: 0.75;
  text-align: center;
}

.state.error {
  opacity: 1;
  color: #d9534f;
}

.error-title {
  font-weight: 800;
}

.error-sub {
  font-size: 12px;
  opacity: 0.8;
  max-width: 680px;
}

.retry {
  margin-top: 8px;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  background: #efefef;
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid #eee;
  border-top-color: #8a75e3;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* EVENTS */
.events-shell {
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  padding: 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.events-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  margin-bottom: 12px;
}

.events-count {
  font-size: 12px;
  opacity: 0.6;
  font-weight: 700;
}

.events-progress {
  font-size: 12px;
  opacity: 0.55;
  font-weight: 700;
  margin-left: auto;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* плавное появление карточек */
.list-enter-active,
.list-leave-active {
  transition: opacity 240ms ease, transform 240ms ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>