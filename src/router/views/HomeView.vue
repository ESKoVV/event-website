<template>
  <div class="page">
    <div class="container">
      <div class="topbar">
        <div class="topbar-left">
          <div class="page-title">Мероприятия</div>
          <div class="page-sub">
            <span v-if="initialLoaded">{{ filteredEvents.length }}</span>
            <span v-else>…</span>
          </div>
        </div>

        <!-- filter drawer -->
        <button class="filter-btn" @click="openDrawer" aria-label="Открыть фильтры">
          <svg viewBox="0 0 24 24" class="filter-icon" aria-hidden="true">
            <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" fill="currentColor" />
          </svg>
          <span class="filter-btn-text">Фильтры</span>
        </button>
      </div>

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

      <div v-else class="events-shell">
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

    <!-- FILTER DRAWER ONLY -->
    <teleport to="body">
      <div v-if="drawerOpen" class="drawer-root" @keydown.esc="closeDrawer" tabindex="-1">
        <div class="overlay" @click="closeDrawer"></div>

        <aside class="drawer" role="dialog" aria-modal="true" aria-label="Фильтры">
          <div class="drawer-head">
            <div class="drawer-title">Фильтры</div>
            <button class="close-btn" @click="closeDrawer" aria-label="Закрыть">✕</button>
          </div>

          <div class="drawer-body">
            <FiltersPanel
              :categories="categories"
              :is-all-categories-active="isAllCategoriesActive"
              v-model:selectedCategoryNames="selectedCategoryNames"
              v-model:onlineOnly="onlineOnly"
              v-model:priceMode="priceMode"
              v-model:customPriceMin="customPriceMin"
              v-model:customPriceMax="customPriceMax"
              v-model:dateMode="dateMode"
              v-model:dateOn="dateOn"
              v-model:dateFrom="dateFrom"
              v-model:dateTo="dateTo"
              v-model:datePivot="datePivot"
              @reset="resetAllFilters"
            />
          </div>

          <div class="drawer-foot">
            <button class="apply-btn" @click="closeDrawer">Показать</button>
          </div>
        </aside>
      </div>
    </teleport>

    <EventPhotoModal v-if="photoModalUrl" :url="photoModalUrl" @close="photoModalUrl = ''" />
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
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

const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

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
  if (Array.isArray(raw)) return Array.from(new Set(raw.map(toName).filter(Boolean)))

  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    return Array.from(
      new Set(
        s
          .split(/[,;|]+/g)
          .map((x) => x.trim())
          .filter(Boolean)
          .map(toName)
          .filter(Boolean)
      )
    )
  }

  const one = toName(raw)
  return one ? [one] : []
}

export default {
  name: 'HomeView',
  components: { EventCard, EventPhotoModal, FiltersPanel },
  props: { globalSearchTerm: { type: String, default: '' } },
  setup(props) {
    const { getEvents, getCategories, getEventPhotos } = useSupabase()

    const initialLoaded = ref(false)
    const error = ref(null)

    const allEvents = ref([])
    const visibleEvents = ref([])
    const photos = ref({})

    const categories = ref([])
    const categoryMap = ref({})

    // filters
    const selectedCategoryNames = ref([])
    const onlineOnly = ref(false)

    const priceMode = ref('all')
    const customPriceMin = ref('')
    const customPriceMax = ref('')

    const dateMode = ref('all')
    const dateOn = ref('')
    const dateFrom = ref('')
    const dateTo = ref('')
    const datePivot = ref('')

    const isAllCategoriesActive = computed(() => selectedCategoryNames.value.length === 0)

    // ui
    const drawerOpen = ref(false)
    const openDrawer = async () => {
      drawerOpen.value = true
      await nextTick()
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
    }
    const closeDrawer = () => {
      drawerOpen.value = false
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }

    // photo modal
    const photoModalUrl = ref('')
    const openPhoto = (url) => {
      if (!url) return
      photoModalUrl.value = url
    }

    // progressive list
    let progressiveTimer = null
    const stopProgressive = () => {
      if (progressiveTimer) clearInterval(progressiveTimer)
      progressiveTimer = null
    }
    const startProgressive = (list) => {
      stopProgressive()
      visibleEvents.value = []
      const src = Array.isArray(list) ? list : []
      if (!src.length) return
      visibleEvents.value.push(src[0])
      let i = 1
      progressiveTimer = setInterval(() => {
        if (i >= src.length) return stopProgressive()
        visibleEvents.value.push(src[i])
        i++
      }, 140)
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

    const matchesCategories = (event) => {
      if (selectedCategoryNames.value.length === 0) return true
      const eventCats = normalizeCategoryNames(event?.selectCategory, categoryMap.value)
      if (!eventCats.length) return false
      const set = new Set(selectedCategoryNames.value)
      return eventCats.some((c) => set.has(c))
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
      const desc = (event.description || '').toLowerCase()
      const a = (event.address || '').toLowerCase()
      const o = (event.organizer || '').toLowerCase()
      return t.includes(term) || desc.includes(term) || a.includes(term) || o.includes(term)
    }

    const filteredEvents = computed(() => {
      return visibleEvents.value.filter(
        (e) => matchesCategories(e) && matchesOnline(e) && matchesPrice(e) && matchesDate(e) && matchesSearch(e)
      )
    })

    // load
    const photosLoading = ref(false)
    const stopPhotosLoading = ref(false)

    const loadCategories = async () => {
      const { data, error: err } = await withRetry(() => getCategories())
      if (err) throw err
      categories.value = data ?? []
      categoryMap.value = (categories.value || []).reduce((acc, c) => {
        acc[String(c.id)] = c.name
        return acc
      }, {})
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

        photos.value = {}
        stopPhotosLoading.value = false

        const ids = allEvents.value.map((e) => e.id).filter(Boolean)
        if (!ids.length) return

        photosLoading.value = true
        const batchSize = 5
        for (let i = 0; i < ids.length; i += batchSize) {
          if (stopPhotosLoading.value) break
          const batch = ids.slice(i, i + batchSize)

          const { data: ph, error: phErr } = await withRetry(() => getEventPhotos(batch))
          if (!phErr) {
            const next = { ...photos.value }
            for (const p of ph ?? []) {
              if (!p?.event_id) continue
              if (!next[p.event_id]) next[p.event_id] = []
              next[p.event_id].push(p)
            }
            photos.value = next
          }
          await sleep(120)
        }
      } catch (e) {
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
      try {
        await loadCategories()
      } catch {
        categories.value = []
        categoryMap.value = {}
      }
      await loadEventsProgressive()
    })

    onBeforeUnmount(() => {
      stopProgressive()
      stopPhotosLoading.value = true
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    })

    return {
      initialLoaded,
      error,

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

      photos,
      photosLoading,

      filteredEvents,

      drawerOpen,
      openDrawer,
      closeDrawer,

      resetAllFilters,
      reload,

      photoModalUrl,
      openPhoto
    }
  }
}
</script>

<style scoped>
.page { padding: 16px 0 40px; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

.topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.topbar-left { display: flex; flex-direction: column; gap: 2px; }
.page-title { font-weight: 900; font-size: 18px; }
.page-sub { font-size: 12px; opacity: .65; font-weight: 700; }

.filter-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
}
.filter-btn:hover { background: #fafafa; }
.filter-icon { width: 18px; height: 18px; opacity: .9; }
.filter-btn-text { font-size: 13px; font-weight: 800; }

.state { display: grid; place-items: center; gap: 10px; padding: 40px 0; opacity: .75; text-align: center; }
.state.error { opacity: 1; color: #d9534f; }
.error-title { font-weight: 800; }
.error-sub { font-size: 12px; opacity: .8; max-width: 680px; }
.retry { margin-top: 8px; border: none; border-radius: 12px; padding: 10px 14px; cursor: pointer; background: #efefef; }

.spinner {
  width: 26px; height: 26px; border-radius: 50%;
  border: 3px solid #eee; border-top-color: #8a75e3;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.events-shell {
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
}
.events-list { display: flex; flex-direction: column; gap: 12px; }

.list-enter-active, .list-leave-active { transition: opacity 240ms ease, transform 240ms ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(8px); }

/* FILTER DRAWER */
.drawer-root { position: fixed; inset: 0; z-index: 9998; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,.35); backdrop-filter: blur(2px); }

.drawer {
  position: absolute; top: 0; right: 0; height: 100%;
  width: min(420px, 92vw);
  background: #fff;
  border-left: 1px solid #efefef;
  box-shadow: -10px 0 30px rgba(0,0,0,0.12);
  display: flex; flex-direction: column;
  animation: slideIn 180ms ease;
}
@keyframes slideIn { from { transform: translateX(18px); opacity: .7; } to { transform: translateX(0); opacity: 1; } }

.drawer-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px;
  border-bottom: 1px solid #f2f2f2;
}
.drawer-title { font-weight: 900; font-size: 16px; }
.close-btn {
  margin-left: auto;
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
}

.drawer-body { padding: 14px; overflow: auto; }
.drawer-foot { padding: 14px; border-top: 1px solid #f2f2f2; display: flex; justify-content: flex-end; }

.apply-btn {
  border: none;
  background: #8a75e3;
  color: #fff;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor: pointer;
}
</style>
