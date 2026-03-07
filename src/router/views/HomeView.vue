<template>
  <div class="page">
    <div class="container">
      <div class="topbar" :class="{ 'topbar-visible': showStickyTopbar }">
        <div class="filter-stack">
          <button
            class="filter-btn"
            :class="{ active: hasActiveFilters }"
            @click="openDrawer"
            aria-label="Открыть фильтры"
          >
            <svg viewBox="0 0 24 24" class="filter-icon" aria-hidden="true">
              <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" fill="currentColor" />
            </svg>
          </button>

          <button
            v-if="hasActiveFilters"
            class="filter-reset-vertical"
            type="button"
            @click="resetAllFilters"
            aria-label="Сбросить фильтры"
            title="Сбросить фильтры"
          >
            Сбросить
          </button>
        </div>

        <button class="tab" :class="{ active: activeTab === 'feed' }" type="button" @click="activeTab = 'feed'">
          <span class="ico">📰</span><span class="txt">Моя лента</span>
        </button>

        <button class="tab" :class="{ active: activeTab === 'favorites' }" type="button" @click="activeTab = 'favorites'">
          <span class="ico">❤️</span><span class="txt">Избранное</span>
          <span v-if="favoriteIds.size" class="count">{{ favoriteIds.size }}</span>
        </button>

        <button
          v-if="isBusiness"
          class="tab"
          :class="{ active: activeTab === 'mine' }"
          type="button"
          @click="activeTab = 'mine'"
        >
          <span class="ico">📌</span><span class="txt">Мои мероприятия</span>
        </button>

        <button
          v-else
          class="tab"
          :class="{ active: activeTab === 'biz' }"
          type="button"
          @click="activeTab = 'biz'"
        >
          <span class="ico">💼</span><span class="txt">Бизнес</span>
        </button>

        <button class="refresh" type="button" @click="forceReload" title="Обновить">
          ⟳
        </button>
      </div>

      <div v-if="activeTab === 'biz' && !isBusiness" class="biz-ad">
        <div class="biz-ad-title">💼 Business аккаунт</div>
        <div class="biz-ad-text">
          С бизнес-аккаунтом ты можешь добавлять мероприятия. Сначала они попадают в предложку, затем админ подтверждает.
        </div>
        <button class="biz-ad-btn" type="button" @click="goToProfile">Узнать</button>
      </div>

      <div v-if="!initialLoaded" class="state">
        <div class="spinner"></div>
        <div>Загрузка мероприятий…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Не удалось загрузить мероприятия</div>
        <div class="error-sub">{{ error }}</div>
        <button class="retry" @click="forceReload">Повторить</button>
      </div>

      <template v-else>
        <!-- МОИ (для бизнес) -->
        <div v-if="activeTab === 'mine' && isBusiness">
          <div v-if="myEventsForCards.length === 0" class="state">
            У вас пока нет мероприятий
          </div>

          <div v-else class="events-shell">
            <TransitionGroup name="list" tag="div" class="events-list">
              <div
                v-for="event in myEventsForCards"
                :key="'mine_wrap_' + event.id"
                class="card-wrap"
                :data-eid="event.id"
                ref="mineCardWraps"
              >
                <EventCard
                  :event="event"
                  :photos="photos[event.id] || []"
                  :photos-loading="!!photosLoadingById[event.id]"
                  :category-map="categoryMap"
                  :is-favorite="favoriteIds.has(event.id)"
                  :can-message-organizer="canMessageEventOrganizer(event)"
                  @open-photo="openPhoto"
                  @toggle-favorite="onToggleFavorite"
                  @message-organizer="onMessageOrganizer"
                />
              </div>
            </TransitionGroup>
          </div>
        </div>

        <!-- ЛЕНТА / ИЗБРАННОЕ -->
        <template v-else-if="activeTab === 'feed' || activeTab === 'favorites'">
          <div v-if="filteredEvents.length === 0" class="state">
            <template v-if="activeTab === 'favorites'">В избранном пока пусто</template>
            <template v-else>Мероприятия не найдены</template>
          </div>

          <div v-else class="events-shell">
            <TransitionGroup name="list" tag="div" class="events-list">
              <div
                v-for="event in filteredEvents"
                :key="'feed_wrap_' + event.id"
                class="card-wrap"
                :data-eid="event.id"
                ref="feedCardWraps"
              >
                <EventCard
                  :event="event"
                  :photos="photos[event.id] || []"
                  :photos-loading="!!photosLoadingById[event.id]"
                  :category-map="categoryMap"
                  :is-favorite="favoriteIds.has(event.id)"
                  :can-message-organizer="canMessageEventOrganizer(event)"
                  @open-photo="openPhoto"
                  @toggle-favorite="onToggleFavorite"
                  @message-organizer="onMessageOrganizer"
                />
              </div>
            </TransitionGroup>

            <!-- sentinel: догрузка страницы событий при скролле -->
            <div ref="sentinelEl" class="sentinel" aria-hidden="true"></div>

            <div v-if="eventsPageLoading" class="more-loading">Подгружаю ещё…</div>
            <div v-else-if="!eventsHasMore && feedEvents.length" class="end">Это всё ✅</div>
          </div>
        </template>
      </template>
    </div>

    <!-- FILTER DRAWER -->
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
              :cities="cities"
              v-model:titleQuery="titleQuery"
              v-model:selectedCityId="selectedCityId"
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
import { ref, computed, onMounted, nextTick, watch, onBeforeUnmount } from 'vue'
import EventCard from '@/components/EventCard.vue'
import EventPhotoModal from '@/components/EventPhotoModal.vue'
import FiltersPanel from '@/components/FiltersPanel.vue'
import { useSupabase, supabase } from '@/composables/useSupabase'
import { getEventsCache, setEventsCache, clearEventsCache } from '@/composables/eventsCache'

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

const withCityNames = (events, cities) => {
  const list = Array.isArray(events) ? events : []
  const map = new Map((Array.isArray(cities) ? cities : []).map((c) => [Number(c?.id), String(c?.name || '').trim()]))
  return list.map((e) => {
    const id = Number(e?.city_id)
    return { ...e, city: map.get(id) || e?.city || '' }
  })
}

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

const normalizeInterests = (raw) => {
  const out = []
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const s = String(x ?? '').trim()
      if (s) out.push(s.toLowerCase())
    }
  } else if (typeof raw === 'string') {
    const s = raw.trim()
    if (s) {
      for (const p of s.split(/[,;|]+/g)) {
        const z = p.trim()
        if (z) out.push(z.toLowerCase())
      }
    }
  }
  return Array.from(new Set(out))
}

const scoreEventByInterests = (event, interestsLower, categoryMap) => {
  if (!event) return 0
  if (!interestsLower?.length) return 0
  const cats = normalizeCategoryNames(event.selectCategory, categoryMap).map((x) => String(x).toLowerCase())
  if (!cats.length) return 0
  let score = 0
  for (const i of interestsLower) {
    if (cats.includes(i)) score++
  }
  return score
}

// 1) сначала по score (пересечение с интересами), 2) потом по дате создания/мероприятия (свежие выше)
const sortEventsByInterests = (events, interestsLower, categoryMap) => {
  const list = Array.isArray(events) ? [...events] : []
  list.sort((a, b) => {
    const sa = scoreEventByInterests(a, interestsLower, categoryMap)
    const sb = scoreEventByInterests(b, interestsLower, categoryMap)
    if (sb !== sa) return sb - sa

    const da = new Date(a?.created_at || a?.date_time_event || 0).getTime()
    const db = new Date(b?.created_at || b?.date_time_event || 0).getTime()
    return db - da
  })
  return list
}

const makeFavKey = (userId) => (userId ? `fav_event_ids_v1_${userId}` : 'fav_event_ids_v1_guest')
const loadFavLS = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : []
  } catch {
    return []
  }
}
const saveFavLS = (key, idsSet) => {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(idsSet)))
  } catch {}
}

export default {
  name: 'HomeViewLazy',
  components: { EventCard, EventPhotoModal, FiltersPanel },
  setup() {
    const { getCategories, getCitiesRu, getEventPhotos, getUser, getMyPublicUser, getPublicUserById } = useSupabase()

    // ======= базовое состояние как в твоём HomeView =======
    const initialLoaded = ref(false)
    const error = ref('')

    const categories = ref([])
    const cities = ref([])
    const categoryMap = ref({})

    // ВАЖНО: теперь лента не allEvents — а feedEvents (постранично)
    const feedEvents = ref([]) // только опубликованные (is_published !== false), догружаем pages
    const myEventsRaw = ref([]) // мои события (для таба mine), грузим отдельно

    // photos grouped
    const photos = ref({}) // { [eventId]: [] }
    const photosLoadingById = ref({}) // { [eventId]: true/false }

    const initialTab = (() => {
      try {
        const q = new URLSearchParams(window.location.search).get('tab')
        return ['feed', 'favorites', 'mine', 'biz'].includes(q) ? q : 'feed'
      } catch {
        return 'feed'
      }
    })()
    const activeTab = ref(initialTab) // feed | favorites | mine | biz
    const isBusiness = ref(false)
    const userId = ref(null)

    const myProfile = ref(null)
    const myInterestsLower = computed(() => normalizeInterests(myProfile.value?.interests))

    const favoriteIds = ref(new Set())
    const favKey = ref(makeFavKey(null))
    const businessUserIds = ref(new Set())

    // filters
    const titleQuery = ref('')
    const selectedCityId = ref('')
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

    // ui
    const drawerOpen = ref(false)
    const photoModalUrl = ref('')
    const showStickyTopbar = ref(true)
    const lastScrollY = ref(0)

    // ======= НОВОЕ: постраничная загрузка событий =======
    const initialPageSize = 4
    const pageSize = ref(initialPageSize)
    const eventsOffset = ref(0)
    const eventsPageLoading = ref(false)
    const eventsHasMore = ref(true)

    // ======= НОВОЕ: очередь загрузки ФОТО (строго по одному) =======
    const photoQueue = ref([]) // [eventId,...]
    const photoQueueProcessing = ref(false)

    // refs for IO
    const feedCardWraps = ref([])
    const mineCardWraps = ref([])
    const sentinelEl = ref(null)

    // observers
    let cardIO = null
    let sentinelIO = null

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
    const openPhoto = (url) => (photoModalUrl.value = url || '')

    const resetAllFilters = () => {
      titleQuery.value = ''
      selectedCityId.value = ''
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

    const hasActiveFilters = computed(() => {
      const hasTitle = String(titleQuery.value || '').trim().length > 0
      const hasCity = String(selectedCityId.value || '').trim().length > 0
      const hasCats = (selectedCategoryNames.value || []).length > 0
      const hasOnline = onlineOnly.value === true
      const hasPriceMode = priceMode.value !== 'all'
      const hasPriceRange = String(customPriceMin.value || '').trim() !== '' || String(customPriceMax.value || '').trim() !== ''
      const hasDateMode = dateMode.value !== 'all'
      const hasDateValues = [dateOn.value, dateFrom.value, dateTo.value, datePivot.value].some((v) => String(v || '').trim() !== '')
      return hasTitle || hasCity || hasCats || hasOnline || hasPriceMode || hasPriceRange || hasDateMode || hasDateValues
    })

    const goToProfile = () => {
      const base = import.meta.env.BASE_URL || '/'
      window.location.href = `${base}profile`
    }

    // ======= computed логика как у тебя, но от feedEvents =======
    const basePublishedFeed = computed(() => {
      // feedEvents уже опубликованные, но на всякий:
      const list = (feedEvents.value || []).filter((e) => e?.is_published !== false)
      return sortEventsByInterests(list, myInterestsLower.value, categoryMap.value)
    })

    const myEventsForCards = computed(() => {
      const list = Array.isArray(myEventsRaw.value) ? myEventsRaw.value : []
      return [...list].sort((a, b) => {
        const da = new Date(a?.created_at || a?.date_time_event || 0).getTime()
        const db = new Date(b?.created_at || b?.date_time_event || 0).getTime()
        return db - da
      })
    })

    const applyFilters = (list) => {
      const catsSel = selectedCategoryNames.value
      const cityId = toNumberOrNull(selectedCityId.value)
      const online = onlineOnly.value

      const pm = priceMode.value
      const minP = toNumberOrNull(customPriceMin.value)
      const maxP = toNumberOrNull(customPriceMax.value)

      const dm = dateMode.value
      const onD = parseDateInput(dateOn.value)
      const fromD = parseDateInput(dateFrom.value)
      const toD = parseDateInput(dateTo.value)

      const now = new Date()
      const todayStart = startOfDay(now)
      const todayEnd = endOfDay(now)
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const tomorrowStart = startOfDay(tomorrow)
      const tomorrowEnd = endOfDay(tomorrow)

      const map = categoryMap.value || {}

      return (list || []).filter((e) => {
        if (!e) return false

        if (activeTab.value === 'favorites' && !favoriteIds.value.has(e.id)) return false
        if (Number.isFinite(cityId) && Number(e?.city_id) !== cityId) return false
        if (online && !e.is_online) return false

        if (catsSel.length) {
          const evCats = normalizeCategoryNames(e.selectCategory, map)
          const ok = catsSel.some((c) => evCats.includes(c))
          if (!ok) return false
        }

        if (pm === 'free' && !e.is_free) return false
        if (pm === 'paid' && e.is_free) return false
        if (pm === 'custom') {
          const p = Number(e.price ?? 0)
          if (Number.isFinite(minP) && p < minP) return false
          if (Number.isFinite(maxP) && p > maxP) return false
        }

        const evDate = parseEventDate(e.date_time_event)
        if (!evDate) return true

        if (dm === 'today') return evDate >= todayStart && evDate <= todayEnd
        if (dm === 'tomorrow') return evDate >= tomorrowStart && evDate <= tomorrowEnd
        if (dm === 'on' && onD) return evDate >= startOfDay(onD) && evDate <= endOfDay(onD)
        if (dm === 'range' && fromD && toD) return evDate >= startOfDay(fromD) && evDate <= endOfDay(toD)

        return true
      })
    }

    const filteredEvents = computed(() => {
      const term = String(titleQuery.value || '').trim().toLowerCase()
      let list = basePublishedFeed.value
      if (term) list = list.filter((e) => String(e?.title || '').toLowerCase().includes(term))
      return applyFilters(list)
    })

    const onToggleFavorite = ({ eventId, makeFavorite }) => {
      const idNum = Number(eventId)
      if (!Number.isFinite(idNum)) return

      const next = new Set(favoriteIds.value)
      if (makeFavorite) next.add(idNum)
      else next.delete(idNum)
      favoriteIds.value = next
      saveFavLS(favKey.value, favoriteIds.value)
    }

    const hydrateBusinessUsers = async (events) => {
      const list = Array.isArray(events) ? events : []
      const ids = [...new Set(list.map((e) => String(e?.user_id || '').trim()).filter(Boolean))]
      const missing = ids.filter((id) => !businessUserIds.value.has(id))
      if (!missing.length) return

      const next = new Set(businessUserIds.value)
      await Promise.all(
        missing.map(async (id) => {
          try {
            const { data } = await getPublicUserById(id)
            if (data?.It_business === true) next.add(id)
          } catch {
            // ignore
          }
        })
      )
      businessUserIds.value = next
    }

    const canMessageEventOrganizer = (event) => {
      const other = String(event?.user_id || '').trim()
      const my = String(userId.value || '').trim()
      if (!other || !my || other === my) return false
      return businessUserIds.value.has(other)
    }

    const onMessageOrganizer = ({ userId: otherId } = {}) => {
      const other = String(otherId || '').trim()
      if (!other) return
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
      const query = new URLSearchParams({ with: other }).toString()
      window.history.pushState({}, '', `${base}messages?${query}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    const loadUser = async () => {
      const { user } = await getUser()
      userId.value = user?.id || null
      favKey.value = makeFavKey(userId.value)
      favoriteIds.value = new Set(loadFavLS(favKey.value))

      if (!userId.value) {
        isBusiness.value = false
        myProfile.value = null
        return
      }

      try {
        const { data: p } = await getMyPublicUser()
        myProfile.value = p || null
        isBusiness.value = p?.It_business === true
      } catch {
        isBusiness.value = false
        myProfile.value = null
      }
    }

    const loadCategories = async () => {
      const { data, error: e } = await withRetry(() => getCategories())
      if (e) throw e
      categories.value = data || []
      const map = {}
      for (const c of categories.value) {
        map[String(c.id)] = c.name
        map[String(c.name)] = c.name
      }
      categoryMap.value = map
    }

    const loadCities = async () => {
      const { data, error: e } = await withRetry(() => getCitiesRu())
      if (e) throw e
      cities.value = data || []
    }

    // ======= НОВОЕ: загрузка СТРАНИЦЫ событий (только опубликованные) =======
    const fetchEventsPage = async ({ batchSize } = {}) => {
      if (eventsPageLoading.value) return
      if (!eventsHasMore.value) return

      eventsPageLoading.value = true
      try {
        const size = Math.max(1, Number(batchSize || pageSize.value || 1))
        const from = eventsOffset.value
        const to = eventsOffset.value + size - 1

        const { data, error: e } = await withRetry(async () => {
          // published only for feed
          return await supabase
            .from('events')
            .select('*')
            .neq('is_published', false)
            .order('date_time_event', { ascending: true })
            .range(from, to)
        })

        if (e) throw e

        const rows = withCityNames(data, cities.value)
        if (!rows.length) {
          eventsHasMore.value = false
          return
        }

        await hydrateBusinessUsers(rows)

        // добавляем в конец
        feedEvents.value = [...feedEvents.value, ...rows]
        eventsOffset.value += rows.length
        if (rows.length < size) eventsHasMore.value = false

        // обновляем кэш (теперь кэш хранит только то, что уже подгружено)
        setEventsCache({
          events: feedEvents.value,
          photosByEventId: photos.value,
          categoryMap: categoryMap.value
        })

        await nextTick()
        refreshCardObserver()
      } finally {
        eventsPageLoading.value = false
      }
    }

    // ======= Мои мероприятия (отдельно, чтобы таб mine был корректным) =======
    const fetchMyEvents = async () => {
      if (!userId.value) {
        myEventsRaw.value = []
        return
      }

      const { data, error: e } = await withRetry(async () => {
        return await supabase
          .from('events')
          .select('*')
          .eq('user_id', userId.value)
          .order('created_at', { ascending: false })
      })
      if (e) throw e
      myEventsRaw.value = withCityNames(data, cities.value)
      await hydrateBusinessUsers(myEventsRaw.value)
      await nextTick()
      refreshCardObserver()
    }

    // ======= НОВОЕ: фото очередь (строго по одному) =======
    const isPhotosLoaded = (eventId) => Array.isArray(photos.value?.[eventId])
    const isPhotosLoading = (eventId) => !!photosLoadingById.value?.[eventId]

    const setPhotosLoading = (eventId, v) => {
      photosLoadingById.value = { ...photosLoadingById.value, [eventId]: !!v }
    }

    const enqueuePhotoLoad = (eventId) => {
      const id = Number(eventId)
      if (!Number.isFinite(id)) return
      if (isPhotosLoaded(id)) return
      if (isPhotosLoading(id)) return
      if (photoQueue.value.includes(id)) return
      photoQueue.value = [...photoQueue.value, id]
      processPhotoQueue()
    }

    const processPhotoQueue = async () => {
      if (photoQueueProcessing.value) return
      photoQueueProcessing.value = true

      try {
        while (photoQueue.value.length > 0) {
          const id = photoQueue.value[0]
          photoQueue.value = photoQueue.value.slice(1)

          if (!Number.isFinite(id)) continue
          if (isPhotosLoaded(id)) continue
          if (isPhotosLoading(id)) continue

          setPhotosLoading(id, true)
          try {
            const { data: ph, error: e2 } = await withRetry(() => getEventPhotos([id]))
            if (e2) throw e2

            const grouped = { ...(photos.value || {}) }
            grouped[id] = (ph || []).filter((p) => Number(p?.event_id) === id)
            photos.value = grouped

            // обновляем кэш, чтобы при F5 не загружать фотки заново
            setEventsCache({
              events: feedEvents.value,
              photosByEventId: photos.value,
              categoryMap: categoryMap.value
            })
          } catch {
            // даже при ошибке ставим пусто, чтобы не пытаться бесконечно
            const grouped = { ...(photos.value || {}) }
            grouped[id] = []
            photos.value = grouped
          } finally {
            setPhotosLoading(id, false)
          }
        }
      } finally {
        photoQueueProcessing.value = false
      }
    }

    // ======= IO: карточки, которые “видимы/рядом” → добавляем в очередь фоток =======
    const disconnectCardObserver = () => {
      try {
        if (cardIO) cardIO.disconnect()
      } catch {}
      cardIO = null
    }

    const refreshCardObserver = () => {
      disconnectCardObserver()

      try {
        cardIO = new IntersectionObserver(
          (entries) => {
            for (const e of entries || []) {
              if (!e?.isIntersecting) continue
              const el = e.target
              const eid = el?.dataset?.eid
              if (!eid) continue
              enqueuePhotoLoad(eid)
            }
          },
          {
            root: null,
            threshold: 0.01,
            // чтобы грузить заранее, до появления на экране
            rootMargin: '900px 0px'
          }
        )

        // наблюдаем за текущим списком обёрток
        const feedEls = Array.isArray(feedCardWraps.value) ? feedCardWraps.value : []
        for (const el of feedEls) {
          if (el && el.dataset?.eid) cardIO.observe(el)
        }

        const mineEls = Array.isArray(mineCardWraps.value) ? mineCardWraps.value : []
        for (const el of mineEls) {
          if (el && el.dataset?.eid) cardIO.observe(el)
        }
      } catch {
        // fallback для старых мобильных браузеров без IntersectionObserver
        const eagerIds = []
        const feedEls = Array.isArray(feedCardWraps.value) ? feedCardWraps.value : []
        for (const el of feedEls) {
          if (el && el.dataset?.eid) eagerIds.push(el.dataset.eid)
        }
        const mineEls = Array.isArray(mineCardWraps.value) ? mineCardWraps.value : []
        for (const el of mineEls) {
          if (el && el.dataset?.eid) eagerIds.push(el.dataset.eid)
        }
        for (const id of eagerIds) enqueuePhotoLoad(id)
      }
    }

    // ======= IO: sentinel снизу → догрузка событий =======
    const disconnectSentinel = () => {
      try {
        if (sentinelIO) sentinelIO.disconnect()
      } catch {}
      sentinelIO = null
    }

    const setupSentinel = () => {
      disconnectSentinel()
      try {
        const el = sentinelEl.value
        if (!el) return

        sentinelIO = new IntersectionObserver(
          (entries) => {
            const e = entries?.[0]
            if (!e?.isIntersecting) return
            if (activeTab.value !== 'feed' && activeTab.value !== 'favorites') return
            if (eventsPageLoading.value) return
            if (!eventsHasMore.value) return
            fetchEventsPage({ batchSize: 1 })
          },
          { root: null, threshold: 0.01, rootMargin: '1200px 0px' }
        )
        sentinelIO.observe(el)
      } catch {
        // ignore
      }
    }

    const hydrateFromCacheIfPossible = () => {
      const cache = getEventsCache()
      const ok = Array.isArray(cache?.events) && cache.events.length > 0
      if (!ok) return false

      // cache.events теперь — это уже подгруженная часть ленты
      feedEvents.value = cache.events
      photos.value = cache.photosByEventId || {}
      categoryMap.value = cache.categoryMap || {}

      // offset начинаем с размера кэша
      eventsOffset.value = feedEvents.value.length
      eventsHasMore.value = true

      return true
    }

    const boot = async ({ force = false } = {}) => {
      initialLoaded.value = false
      error.value = ''

      try {
        await loadUser()
        await loadCategories()
        await loadCities()

        // ВАЖНО: мои мероприятия отдельно
        if (isBusiness.value && userId.value) {
          // не блокируем загрузку ленты — параллелим
          fetchMyEvents().catch(() => {})
        } else {
          myEventsRaw.value = []
        }

        if (!force) {
          const hydrated = hydrateFromCacheIfPossible()
          if (hydrated) {
            initialLoaded.value = true
            await nextTick()
            refreshCardObserver()
            setupSentinel()

            // если кэш маленький — можно сразу подгрузить до "видимых"
            // но строго по твоему тз: не грузим всё, поэтому не делаем "догрузку до конца"
            return
          }
        }

        // чистая загрузка: 1 страница
        feedEvents.value = []
        photos.value = {}
        photosLoadingById.value = {}
        photoQueue.value = []
        eventsOffset.value = 0
        eventsHasMore.value = true

        await fetchEventsPage({ batchSize: initialPageSize })

        initialLoaded.value = true
        await nextTick()
        refreshCardObserver()
        setupSentinel()
      } catch (e) {
        error.value = String(e?.message || e)
        initialLoaded.value = true
      }
    }

    const forceReload = async () => {
      clearEventsCache()
      await boot({ force: true })
    }

    // когда переключаем табы — обновим observer (карточки другие)
    watch(
      () => activeTab.value,
      async () => {
        await nextTick()
        refreshCardObserver()
        setupSentinel()

        // если пользователь открыл "mine", а мы ещё не грузили — догрузим
        if (activeTab.value === 'mine' && isBusiness.value && userId.value && (!myEventsRaw.value || !myEventsRaw.value.length)) {
          fetchMyEvents().catch(() => {})
        }
      }
    )


    const onWindowScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0
      if (y < 120) {
        showStickyTopbar.value = true
      } else {
        const goingUp = y < lastScrollY.value
        showStickyTopbar.value = goingUp
      }
      lastScrollY.value = y
    }

    onMounted(async () => {
      await boot()
      await nextTick()
      refreshCardObserver()
      setupSentinel()
      lastScrollY.value = window.scrollY || window.pageYOffset || 0
      window.addEventListener('scroll', onWindowScroll, { passive: true })
    })

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', onWindowScroll)
      disconnectCardObserver()
      disconnectSentinel()
    })

    return {
      initialLoaded,
      error,
      categories,
      cities,
      categoryMap,

      photos,
      photosLoadingById,

      activeTab,
      isBusiness,

      // used in template
      feedEvents,
      eventsPageLoading,
      eventsHasMore,

      filteredEvents,
      myEventsForCards,

      favoriteIds,
      onToggleFavorite,
      canMessageEventOrganizer,
      onMessageOrganizer,

      drawerOpen,
      openDrawer,
      closeDrawer,
      openPhoto,
      photoModalUrl,

      titleQuery,
      selectedCityId,
      selectedCategoryNames,
      onlineOnly,
      priceMode,
      customPriceMin,
      customPriceMax,
      dateMode,
      dateOn,
      dateFrom,
      dateTo,
      datePivot,
      resetAllFilters,
      hasActiveFilters,

      goToProfile,
      forceReload,
      showStickyTopbar,

      // refs
      feedCardWraps,
      mineCardWraps,
      sentinelEl
    }
  }
}
</script>

<style scoped>
.page { padding: 12px 0; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 12px; }

.topbar{ display:flex; align-items:center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; position: sticky; top: 72px; z-index: 12; background:#f6f7f9; padding: 8px 0; transform: translateY(-120%); opacity: 0; transition: transform .2s ease, opacity .2s ease; }
.topbar.topbar-visible{ transform: translateY(0); opacity: 1; }

.filter-stack{
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.filter-btn {
  width: 40px; height: 40px; border-radius: 14px;
  border: 1px solid #efefef; background: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.filter-btn.active{
  border-color: rgba(138,117,227,.65);
  box-shadow: 0 0 0 3px rgba(138,117,227,.18), 0 10px 20px rgba(138,117,227,.25);
  color: #6f58d6;
}
.filter-reset-vertical{
  border: 1px solid rgba(138,117,227,.35);
  background: #fff;
  color: #6f58d6;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  transform: rotate(90deg);
  transform-origin: center;
  white-space: nowrap;
}
.filter-icon { width: 18px; height: 18px; }

.tab{
  display:inline-flex; align-items:center; gap: 8px;
  border: 1px solid #efefef; background: #fff; border-radius: 14px;
  padding: 10px 12px; cursor: pointer; font-weight: 900;
}
.tab .ico{ font-size: 16px; }
.tab .txt{ font-size: 13px; }
.tab .count{
  font-size: 12px; padding: 4px 8px; border-radius: 999px;
  background: rgba(138,117,227,.12); border: 1px solid rgba(138,117,227,.22);
}
.tab.active{ background:#8a75e3; border-color:#8a75e3; color:#fff; }

.refresh{
  margin-left:auto;
  width: 40px; height: 40px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  font-weight: 900;
}

/* На ПК убираем кнопку обновления (иконка ⟳). На мобильной оставляем. */
@media (min-width: 981px){
  .refresh{ display:none !important; }
}
@media (max-width: 980px){ .topbar{ top: 0; transform:none; opacity:1; position: static; padding:0; } .container{ padding: 0 8px; } }
@media (max-width: 520px){ .tab .txt{ display:none; } .refresh{ margin-left:0; } .filter-reset-vertical{ font-size:10px; padding:5px 8px; } }

.biz-ad{
  margin-bottom: 10px; padding: 14px; border-radius: 18px;
  border: 1px solid rgba(138,117,227,.22); background: #fcfcff;
  display: grid; gap: 10px;
}
.biz-ad-title{ font-weight: 900; font-size: 16px; }
.biz-ad-text{ font-weight: 800; opacity: .85; line-height: 1.3; }
.biz-ad-btn{
  width: fit-content; border: none; border-radius: 14px;
  padding: 12px 16px; font-weight: 900; cursor: pointer;
  background: #8a75e3; color: #fff;
}

.state{
  padding: 18px; border: 1px solid #efefef; border-radius: 18px; background: #fff;
  display:flex; align-items:center; gap: 10px; font-weight: 800;
}
.state.error{ color:#d9534f; display:block; }
.error-title{ font-weight: 900; margin-bottom: 6px; }
.error-sub{ opacity:.85; margin-bottom: 10px; }
.retry{
  border: 1px solid #efefef; background: #fafafa;
  border-radius: 14px; padding: 10px 12px; font-weight: 900; cursor: pointer;
}

.spinner{
  width: 18px; height: 18px; border-radius: 999px;
  border: 2px solid #eaeaea; border-top-color: #8a75e3;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.events-shell { margin-top: 10px; }
.events-list{
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(280px, 520px);
  justify-content: center;
}

/* мобилка — на всю ширину */
@media (max-width: 760px){
  .events-list{
    grid-template-columns: 1fr;
    justify-content: stretch;
  }
}

/* обёртка нужна только для IntersectionObserver */
.card-wrap{
  width: 100%;
}

.sentinel{
  height: 1px;
}

.more-loading,
.end{
  text-align: center;
  padding: 14px 0;
  font-weight: 900;
  opacity: 0.75;
}

.drawer-root { position: fixed; inset: 0; z-index: 10000; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,.38); backdrop-filter: blur(2px); }
.drawer { position:absolute; top: 10px; right: 10px; bottom: 10px; width: min(520px, calc(100% - 20px)); background:#fff; border-radius: 18px; overflow:hidden; display:flex; flex-direction: column; }
.drawer-head{ padding: 12px; border-bottom:1px solid #f2f2f2; display:flex; align-items:center; justify-content: space-between; gap: 10px; }
.drawer-title{ font-weight: 900; }
.close-btn{ border:none; background:#fafafa; border:1px solid #efefef; border-radius: 12px; padding: 8px 10px; cursor:pointer; }
.drawer-body{ padding: 12px; overflow:auto; }
.drawer-foot{ padding: 12px; border-top:1px solid #f2f2f2; }
.apply-btn{ width:100%; border:none; border-radius: 14px; padding: 12px 14px; font-weight: 900; cursor:pointer; background:#8a75e3; color:#fff; }
</style>
