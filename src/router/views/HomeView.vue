<template>
  <div class="page">
    <div class="container">
      <div class="topbar">
        <!-- Фильтр -->
        <button class="filter-btn" @click="openDrawer" aria-label="Открыть фильтры">
          <svg viewBox="0 0 24 24" class="filter-icon" aria-hidden="true">
            <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" fill="currentColor" />
          </svg>
        </button>

        <!-- Моя лента -->
        <button class="tab" :class="{ active: activeTab === 'feed' }" type="button" @click="activeTab = 'feed'">
          <span class="ico">📰</span>
          <span class="txt">Моя лента</span>
        </button>

        <!-- Избранное -->
        <button class="tab" :class="{ active: activeTab === 'favorites' }" type="button" @click="activeTab = 'favorites'">
          <span class="ico">❤️</span>
          <span class="txt">Избранное</span>
          <span v-if="favoriteIds.size" class="count">{{ favoriteIds.size }}</span>
        </button>

        <!-- Справа: Мои мероприятия (для бизнес) или реклама -->
        <button
          v-if="isBusiness"
          class="tab"
          :class="{ active: activeTab === 'mine' }"
          type="button"
          @click="activeTab = 'mine'"
        >
          <span class="ico">📌</span>
          <span class="txt">Мои мероприятия</span>
        </button>

        <button
          v-else
          class="tab"
          :class="{ active: activeTab === 'biz' }"
          type="button"
          @click="activeTab = 'biz'"
        >
          <span class="ico">💼</span>
          <span class="txt">Бизнес</span>
        </button>
      </div>

      <!-- Реклама бизнес-аккаунта -->
      <div v-if="activeTab === 'biz' && !isBusiness" class="biz-ad">
        <div class="biz-ad-title">💼 Business аккаунт</div>
        <div class="biz-ad-text">
          С бизнес-аккаунтом ты можешь добавлять мероприятия. Сначала они попадают в предложку, затем админ подтверждает.
        </div>
        <button class="biz-ad-btn" type="button" @click="goToProfile">Узнать</button>
      </div>

      <!-- Loading / Error -->
      <div v-if="!initialLoaded" class="state">
        <div class="spinner"></div>
        <div>Загрузка мероприятий…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Не удалось загрузить мероприятия</div>
        <div class="error-sub">{{ error }}</div>
        <button class="retry" @click="reload">Повторить</button>
      </div>

      <!-- Списки (все через EventCard) -->
      <template v-else>
        <div v-if="activeTab === 'mine' && isBusiness">
          <div v-if="myEventsForCards.length === 0" class="state">
            У вас пока нет мероприятий
          </div>

          <div v-else class="events-shell">
            <TransitionGroup name="list" tag="div" class="events-list">
              <EventCard
                v-for="event in myEventsForCards"
                :key="event.id"
                :event="event"
                :photos="photos[event.id] || []"
                :photos-loading="photosLoading"
                :category-map="categoryMap"
                :is-favorite="favoriteIds.has(event.id)"
                @open-photo="openPhoto"
                @toggle-favorite="onToggleFavorite"
              />
            </TransitionGroup>
          </div>
        </div>

        <template v-else-if="activeTab === 'feed' || activeTab === 'favorites'">
          <div v-if="filteredEvents.length === 0" class="state">
            <template v-if="activeTab === 'favorites'">В избранном пока пусто</template>
            <template v-else>Мероприятия не найдены</template>
          </div>

          <div v-else class="events-shell">
            <TransitionGroup name="list" tag="div" class="events-list">
              <EventCard
                v-for="event in filteredEvents"
                :key="event.id"
                :event="event"
                :photos="photos[event.id] || []"
                :photos-loading="photosLoading"
                :category-map="categoryMap"
                :is-favorite="favoriteIds.has(event.id)"
                @open-photo="openPhoto"
                @toggle-favorite="onToggleFavorite"
              />
            </TransitionGroup>
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
import { ref, computed, onMounted, nextTick } from 'vue'
import EventCard from '../../components/EventCard.vue'
import EventPhotoModal from '../../components/EventPhotoModal.vue'
import FiltersPanel from '../../components/FiltersPanel.vue'
import { useSupabase } from '../../composables/useSupabase'
import { setEventsCache } from '../../composables/eventsCache'

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
  name: 'HomeView',
  components: { EventCard, EventPhotoModal, FiltersPanel },
  props: { globalSearchTerm: { type: String, default: '' } },
  setup(props) {
    const { getEvents, getCategories, getEventPhotos, getUser, getMyPublicUser } = useSupabase()

    const initialLoaded = ref(false)
    const error = ref('')

    // data
    const allEvents = ref([])
    const categories = ref([])
    const categoryMap = ref({})
    const photos = ref({})
    const photosLoading = ref(false)

    // tabs
    const activeTab = ref('feed') // feed | favorites | mine | biz
    const isBusiness = ref(false)
    const userId = ref(null)

    // favorites
    const favoriteIds = ref(new Set())
    const favKey = ref(makeFavKey(null))

    // filters
    const selectedCategoryNames = ref([])
    const onlineOnly = ref(false)

    const priceMode = ref('all') // all | free | paid | custom
    const customPriceMin = ref('')
    const customPriceMax = ref('')

    const dateMode = ref('all') // all | today | tomorrow | on | range
    const dateOn = ref('')
    const dateFrom = ref('')
    const dateTo = ref('')
    const datePivot = ref('')

    // ui
    const drawerOpen = ref(false)
    const photoModalUrl = ref('')

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

    const goToProfile = () => {
      // если у тебя другой путь — поменяй
      const base = import.meta.env.BASE_URL || '/'
      window.location.href = `${base}profile`
    }

    // ✅ ВАЖНО: лента показывает только опубликованные
    const basePublishedFeed = computed(() => (allEvents.value || []).filter((e) => e?.is_published !== false))

    // ✅ Мои мероприятия: те же EventCard, берём из уже загруженных allEvents
    const myEventsForCards = computed(() => {
      if (!userId.value) return []
      return (allEvents.value || []).filter((e) => String(e?.user_id || '') === String(userId.value))
    })

    const applyFilters = (list) => {
      const catsSel = selectedCategoryNames.value
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
      const term = (props.globalSearchTerm || '').trim().toLowerCase()
      let list = basePublishedFeed.value

      if (term) {
        list = list.filter((e) => String(e?.title || '').toLowerCase().includes(term))
      }

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

    const loadUser = async () => {
      const { user } = await getUser()
      userId.value = user?.id || null
      favKey.value = makeFavKey(userId.value)
      favoriteIds.value = new Set(loadFavLS(favKey.value))

      if (!userId.value) {
        isBusiness.value = false
        return
      }

      try {
        const { data: p } = await getMyPublicUser()
        isBusiness.value = p?.It_business === true
      } catch {
        isBusiness.value = false
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

    const loadEvents = async () => {
      const { data, error: e } = await withRetry(() => getEvents())
      if (e) throw e
      allEvents.value = data || []
    }

    const loadPhotos = async () => {
      photosLoading.value = true
      try {
        const ids = (allEvents.value || []).map((e) => e.id)
        if (!ids.length) {
          photos.value = {}
          return
        }

        const { data, error: e } = await withRetry(() => getEventPhotos(ids))
        if (e) throw e

        const grouped = {}
        for (const row of data || []) {
          if (!row?.event_id) continue
          if (!grouped[row.event_id]) grouped[row.event_id] = []
          grouped[row.event_id].push(row)
        }
        photos.value = grouped
      } finally {
        photosLoading.value = false
      }
    }

    const reload = async () => {
      initialLoaded.value = false
      error.value = ''
      try {
        await loadUser()
        await loadCategories()
        await loadEvents()
        await nextTick()
        await loadPhotos()

        // ✅ кладём в кэш, чтобы EventView мог использовать без Supabase
        setEventsCache({
          events: allEvents.value,
          photosByEventId: photos.value,
          categoryMap: categoryMap.value
        })

        initialLoaded.value = true
      } catch (e) {
        error.value = String(e?.message || e)
        initialLoaded.value = true
      }
    }

    onMounted(reload)

    return {
      // state
      initialLoaded,
      error,
      categories,
      categoryMap,
      photos,
      photosLoading,

      // tabs
      activeTab,
      isBusiness,

      // lists
      filteredEvents,
      myEventsForCards,

      // favorites
      favoriteIds,
      onToggleFavorite,

      // ui
      drawerOpen,
      openDrawer,
      closeDrawer,
      openPhoto,
      photoModalUrl,

      // filters
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

      reload,
      goToProfile
    }
  }
}
</script>

<style scoped>
.page { padding: 12px 0; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 12px; }

.topbar{
  display:flex;
  align-items:center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.filter-btn {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.filter-btn:hover { background:#fafafa; }
.filter-icon { width: 18px; height: 18px; }

.tab{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 900;
}
.tab .ico{ font-size: 16px; }
.tab .txt{ font-size: 13px; }
.tab .count{
  margin-left: 2px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(138,117,227,.12);
  border: 1px solid rgba(138,117,227,.22);
}
.tab.active{
  background: #8a75e3;
  border-color: #8a75e3;
  color: #fff;
}
@media (max-width: 520px){ .tab .txt{ display:none; } }

.biz-ad{
  margin-bottom: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(138,117,227,.22);
  background: #fcfcff;
  display: grid;
  gap: 10px;
}
.biz-ad-title{ font-weight: 900; font-size: 16px; }
.biz-ad-text{ font-weight: 800; opacity: .85; line-height: 1.3; }
.biz-ad-btn{
  width: fit-content;
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor: pointer;
  background: #8a75e3;
  color: #fff;
}

.state{
  padding: 18px;
  border: 1px solid #efefef;
  border-radius: 18px;
  background: #fff;
  display:flex;
  align-items:center;
  gap: 10px;
  font-weight: 800;
}
.state.error{ color:#d9534f; display:block; }
.error-title{ font-weight: 900; margin-bottom: 6px; }
.error-sub{ opacity:.85; margin-bottom: 10px; }
.retry{
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor: pointer;
}

.spinner{
  width: 18px; height: 18px; border-radius: 999px;
  border: 2px solid #eaeaea; border-top-color: #8a75e3;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.events-shell { margin-top: 10px; }
.events-list { display: grid; gap: 12px; }

.drawer-root { position: fixed; inset: 0; z-index: 10000; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,.38); backdrop-filter: blur(2px); }
.drawer {
  position: absolute;
  right: 0; top: 0;
  height: 100%;
  width: min(420px, 92vw);
  background: #fff;
  border-left: 1px solid #efefef;
  box-shadow: -10px 0 50px rgba(0,0,0,.12);
  display: flex;
  flex-direction: column;
}
.drawer-head{
  padding: 14px;
  border-bottom: 1px solid #f2f2f2;
  display:flex;
  align-items:center;
  gap: 12px;
}
.drawer-title{ font-weight: 900; }
.close-btn{
  margin-left:auto;
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
}
.drawer-body{ padding: 14px; overflow:auto; }
.drawer-foot{ padding: 14px; border-top: 1px solid #f2f2f2; }
.apply-btn{
  width:100%;
  border:none;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 900;
  cursor: pointer;
  background: #8a75e3;
  color: #fff;
}

.list-enter-active, .list-leave-active { transition: all .18s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(6px); }
</style>
