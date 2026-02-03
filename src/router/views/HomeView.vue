<template>
  <div class="page">
    <div class="container">
      <!-- CATEGORIES -->
      <div class="tags-shell">
        <div class="tags-title">Категории</div>

        <div class="tags-content">
          <!-- ALL -->
          <button class="tag-btn" :class="{ active: isAllActive }" @click="selectAll">
            Все
          </button>

          <!-- CATEGORY BUTTONS -->
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="tag-btn"
            :class="{ active: selectedCategoryNames.includes(cat.name) }"
            @click="toggleCategory(cat.name)"
          >
            {{ cat.name }}
          </button>
        </div>
      </div>

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
 * - text[] (как у тебя сейчас) => ["Спорт","Хобби"]
 * - "Спорт,Хобби" / "Спорт;Хобби"
 * - id / [id,id]  (если когда-то поменяешь) -> подставим name по categoryMap
 */
const normalizeCategoryNames = (raw, categoryMap) => {
  const map = categoryMap || {}

  const toName = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v).trim()
    if (!s) return ''
    // если это id и есть в мапе -> вернем имя
    if (map[s]) return String(map[s]).trim()
    // если это число строкой "10"
    const n = Number(s)
    if (!Number.isNaN(n) && map[String(n)]) return String(map[String(n)]).trim()
    // иначе считаем, что это уже имя
    return s
  }

  if (!raw) return []

  // Supabase text[] обычно приходит как массив
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

  // number / object -> строка
  const one = toName(raw)
  return one ? [one] : []
}

export default {
  name: 'HomeView',
  components: { EventCard, EventPhotoModal },
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

    // ✅ выбираем ТОЛЬКО НАЗВАНИЯ категорий (как на кнопках)
    const selectedCategoryNames = ref([])
    const isAllActive = computed(() => selectedCategoryNames.value.length === 0)

    const photosLoading = ref(false)
    const stopPhotosLoading = ref(false)

    const photoModalUrl = ref('')

    const openPhoto = (url) => {
      if (!url) return
      photoModalUrl.value = url
    }

    const selectAll = () => {
      selectedCategoryNames.value = []
    }

    const toggleCategory = (name) => {
      const n = String(name || '').trim()
      if (!n) return

      const idx = selectedCategoryNames.value.indexOf(n)
      if (idx >= 0) selectedCategoryNames.value.splice(idx, 1)
      else selectedCategoryNames.value.push(n)
    }

    const matchesSelectedCategories = (event) => {
      // "Все"
      if (selectedCategoryNames.value.length === 0) return true

      const eventCats = normalizeCategoryNames(event?.selectCategory, categoryMap.value)
      if (!eventCats.length) return false

      const selectedSet = new Set(selectedCategoryNames.value)
      // OR логика: если хоть одна выбранная встречается в мероприятии
      return eventCats.some((c) => selectedSet.has(c))
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
      return visibleEvents.value.filter((e) => matchesSelectedCategories(e) && matchesSearch(e))
    })

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
      isAllActive,
      selectAll,
      toggleCategory,

      filteredEvents,
      photosLoading,
      progressiveLoading,
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

/* TAGS */
.tags-shell {
  background: #fff;
  border: 1px solid #efefef;
  border-radius: 18px;
  padding: 14px 14px 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  margin-bottom: 14px;
}

.tags-title {
  font-weight: 800;
  font-size: 13px;
  opacity: 0.7;
  margin-bottom: 10px;
}

.tags-content {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-btn {
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.tag-btn.active {
  background: #8a75e3;
  border-color: #8a75e3;
  color: #fff;
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