<template>
  <div class="page">
    <div class="container">
      <div class="topbar">
        <button class="filter-btn" @click="openDrawer" aria-label="Открыть фильтры">
          <svg viewBox="0 0 24 24" class="filter-icon" aria-hidden="true">
            <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" fill="currentColor" />
          </svg>
        </button>

        <button class="tab" :class="{ active: activeTab === 'feed' }" type="button" @click="activeTab = 'feed'">
          <span class="ico">📰</span><span class="txt">Моя лента</span>
        </button>

        <button class="tab" :class="{ active: activeTab === 'favorites' }" type="button" @click="activeTab = 'favorites'">
          <span class="ico">❤️</span><span class="txt">Избранное</span>
          <span v-if="favoriteIds.size" class="count">{{ favoriteIds.size }}</span>
        </button>

        <!-- ✅ ВСЕГДА "Мои мероприятия" (без вкладки "Бизнес") -->
        <button class="tab" :class="{ active: activeTab === 'mine' }" type="button" @click="activeTab = 'mine'">
          <span class="ico">📌</span><span class="txt">Мои мероприятия</span>
        </button>

        <!-- ✅ красивый refresh -->
        <button class="refresh" type="button" @click="forceReload" title="Обновить" aria-label="Обновить">
          <svg class="refresh-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L14 10h6V4l-2.35 2.35Z"
            />
          </svg>
        </button>
      </div>

      <!-- ✅ мини-реклама для НЕ бизнес внутри "Мои мероприятия" -->
      <div v-if="activeTab === 'mine' && !isBusiness" class="biz-ad">
        <div class="biz-ad-title">💼 Только бизнес-аккаунты могут добавлять мероприятия</div>
        <div class="biz-ad-text">
          Обычные аккаунты могут смотреть ленту, добавлять в избранное и делиться.
          Чтобы публиковать свои мероприятия — включи <b>Business</b> в профиле.
        </div>
        <button class="biz-ad-btn" type="button" @click="goToProfile">Перейти в профиль</button>
      </div>

      <div v-if="!initialLoaded" class="state">
        <div class="spinner" aria-hidden="true"></div>
        <div>Загрузка мероприятий…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Не удалось загрузить мероприятия</div>
        <div class="error-sub">{{ error }}</div>
        <button class="retry" @click="forceReload">Повторить</button>
      </div>

      <template v-else>
        <!-- ✅ Мои мероприятия -->
        <div v-if="activeTab === 'mine'">
          <!-- если бизнес — показываем список, если нет — только реклама выше -->
          <template v-if="isBusiness">
            <div v-if="myEventsForCards.length === 0" class="state">У вас пока нет мероприятий</div>

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
          </template>
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
            />
          </div>

          <div class="drawer-foot">
            <button class="apply-btn" @click="closeDrawer">Применить</button>
          </div>
        </aside>
      </div>
    </teleport>

    <EventPhotoModal v-if="photoModalUrl" :url="photoModalUrl" @close="photoModalUrl = ''" />
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import EventCard from '@/components/EventCard.vue'
import FiltersPanel from '@/components/FiltersPanel.vue'
import EventPhotoModal from '@/components/EventPhotoModal.vue'
import { useSupabase } from '@/composables/useSupabase'
import { setEventsCache } from '@/composables/eventsCache'

const normalizeCategoryNames = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .trim()
      .split(/[,;|]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return [String(raw).trim()].filter(Boolean)
}

export default {
  name: 'HomeView',
  components: { EventCard, FiltersPanel, EventPhotoModal },
  props: {
    globalSearchTerm: { type: String, default: '' }
  },
  setup(props, { emit }) {
    const api = useSupabase()

    const drawerOpen = ref(false)
    const openDrawer = () => (drawerOpen.value = true)
    const closeDrawer = () => (drawerOpen.value = false)

    const initialLoaded = ref(false)
    const error = ref('')

    const activeTab = ref('feed') // feed | favorites | mine

    const categories = ref([])
    const categoryMap = ref({})

    const events = ref([])
    const myEvents = ref([])
    const photos = ref({})
    const photosLoading = ref(false)

    const selectedCategoryNames = ref([])
    const onlineOnly = ref(false)
    const priceMode = ref('all')
    const customPriceMin = ref('')
    const customPriceMax = ref('')

    const photoModalUrl = ref('')
    const openPhoto = (url) => (photoModalUrl.value = url || '')

    const session = ref(null)
    const profile = ref(null)

    const isBusiness = computed(() => profile.value?.It_business === true)

    const favoriteIds = ref(new Set())
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

    const favKey = ref(makeFavKey(null))

    const onToggleFavorite = ({ eventId, makeFavorite }) => {
      const idNum = Number(eventId)
      if (!Number.isFinite(idNum)) return
      const next = new Set(favoriteIds.value)
      if (makeFavorite) next.add(idNum)
      else next.delete(idNum)
      favoriteIds.value = next
      saveFavLS(favKey.value, favoriteIds.value)
    }

    const goToProfile = () => {
      // у тебя профиль открывается через кнопку в header (App.vue),
      // поэтому просто диспатчим событие — App.vue уже умеет открывать профиль/авторизацию
      window.dispatchEvent(new CustomEvent('open-profile'))
    }

    const fetchAll = async () => {
      error.value = ''
      photosLoading.value = true
      try {
        // session + profile
        const { session: s } = await api.getSession()
        session.value = s || null

        const { user } = await api.getUser()
        favKey.value = makeFavKey(user?.id || null)
        favoriteIds.value = new Set(loadFavLS(favKey.value))

        if (user) {
          await api.ensurePublicUserRow(user)
          const { data: p } = await api.getMyPublicUser()
          profile.value = p || null
        } else {
          profile.value = null
        }

        // categories
        const { data: cats } = await api.getCategories()
        categories.value = cats || []
        const map = {}
        for (const c of categories.value) map[String(c.id)] = c.name
        for (const c of categories.value) map[String(c.name)] = c.name
        categoryMap.value = map

        // events
        const { data: ev, error: e1 } = await api.getEvents()
        if (e1) throw e1
        events.value = (ev || []).filter((x) => x?.is_published !== false)

        // my events (только если бизнес)
        if (profile.value?.It_business === true) {
          const { data: mine, error: e2 } = await api.getMyEvents(true)
          if (e2) throw e2
          myEvents.value = mine || []
        } else {
          myEvents.value = []
        }

        // photos
        const ids = Array.from(new Set([...(events.value || []).map((x) => Number(x.id)), ...(myEvents.value || []).map((x) => Number(x.id))]))
          .filter((n) => Number.isFinite(n))

        const { data: ph, error: e3 } = await api.getEventPhotos(ids)
        if (e3) throw e3

        const grouped = {}
        for (const row of ph || []) {
          const eid = Number(row.event_id)
          if (!Number.isFinite(eid)) continue
          if (!grouped[eid]) grouped[eid] = []
          grouped[eid].push(row)
        }
        photos.value = grouped

        // cache
        setEventsCache({
          events: events.value,
          photosByEventId: photos.value,
          categoryMap: categoryMap.value
        })

        initialLoaded.value = true
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        photosLoading.value = false
      }
    }

    const forceReload = async () => {
      initialLoaded.value = false
      await fetchAll()
    }

    const filteredEvents = computed(() => {
      let list = events.value || []

      // tab favorites filter
      if (activeTab.value === 'favorites') {
        list = list.filter((e) => favoriteIds.value.has(Number(e.id)))
      }

      // global search
      const s = String(props.globalSearchTerm || '').trim().toLowerCase()
      if (s) {
        list = list.filter((e) => {
          const hay = `${e.title || ''} ${e.description || ''} ${e.address || ''} ${e.organizer || ''}`.toLowerCase()
          return hay.includes(s)
        })
      }

      // category filter
      const selected = selectedCategoryNames.value || []
      if (selected.length) {
        list = list.filter((e) => {
          const cats = normalizeCategoryNames(e.selectCategory)
          return cats.some((c) => selected.includes(c))
        })
      }

      // online only
      if (onlineOnly.value) list = list.filter((e) => e.is_online === true)

      // price mode
      if (priceMode.value === 'free') list = list.filter((e) => e.is_free === true || Number(e.price) <= 0)
      if (priceMode.value === 'paid') list = list.filter((e) => !(e.is_free === true || Number(e.price) <= 0))

      if (priceMode.value === 'custom') {
        const min = Number(String(customPriceMin.value || '').replace(',', '.'))
        const max = Number(String(customPriceMax.value || '').replace(',', '.'))
        list = list.filter((e) => {
          const p = Number(e.price ?? 0)
          if (!Number.isFinite(p)) return false
          if (Number.isFinite(min) && String(customPriceMin.value).trim() !== '' && p < min) return false
          if (Number.isFinite(max) && String(customPriceMax.value).trim() !== '' && p > max) return false
          return true
        })
      }

      return list
    })

    const myEventsForCards = computed(() => (myEvents.value || []).slice().sort((a, b) => Number(b.id) - Number(a.id)))

    // слушаем глобальный “открыть профиль”
    const onOpenProfile = () => {
      // App.vue сам откроет модалку, тут ничего не надо
    }

    onMounted(async () => {
      window.addEventListener('open-profile', onOpenProfile)
      await fetchAll()
    })

    watch(
      () => props.globalSearchTerm,
      () => {
        if (activeTab.value === 'mine') return
      }
    )

    return {
      drawerOpen,
      openDrawer,
      closeDrawer,

      initialLoaded,
      error,
      activeTab,

      categories,
      categoryMap,

      events,
      myEvents,
      myEventsForCards,

      photos,
      photosLoading,

      selectedCategoryNames,
      onlineOnly,
      priceMode,
      customPriceMin,
      customPriceMax,

      photoModalUrl,
      openPhoto,

      favoriteIds,
      onToggleFavorite,

      filteredEvents,

      isBusiness,
      forceReload,
      goToProfile
    }
  }
}
</script>

<style scoped>
.page {
  padding: 12px 0;
}
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 12px;
}

.topbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.filter-icon {
  width: 20px;
  height: 20px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #efefef;
  background: #fff;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 900;
}
.tab.active {
  background: rgba(138, 117, 227, 0.1);
  border-color: rgba(138, 117, 227, 0.22);
}
.ico {
  width: 18px;
}
.count {
  font-size: 12px;
  font-weight: 900;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.refresh {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  margin-left: auto;
  transition: transform 0.12s ease, background 0.12s ease;
}
.refresh:hover {
  background: #fafafa;
}
.refresh:active {
  transform: scale(0.98);
}
.refresh-ico {
  width: 20px;
  height: 20px;
  opacity: 0.9;
}

.biz-ad {
  border: 1px solid rgba(138, 117, 227, 0.22);
  background: rgba(138, 117, 227, 0.08);
  border-radius: 18px;
  padding: 14px;
  margin-bottom: 12px;
}
.biz-ad-title {
  font-weight: 900;
  margin-bottom: 8px;
}
.biz-ad-text {
  opacity: 0.9;
  line-height: 1.35;
}
.biz-ad-btn {
  margin-top: 10px;
  border: none;
  border-radius: 14px;
  padding: 10px 12px;
  background: #8a75e3;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.state {
  padding: 18px;
  border: 1px solid #efefef;
  border-radius: 18px;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
}
.state.error {
  color: #d9534f;
  display: block;
}
.error-title {
  font-weight: 900;
  margin-bottom: 6px;
}
.error-sub {
  opacity: 0.85;
  margin-bottom: 10px;
}
.retry {
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor: pointer;
}

/* ✅ более “красивый” spinner */
.spinner {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgba(0, 0, 0, 0.08);
  border-top-color: rgba(138, 117, 227, 1);
  box-shadow: 0 0 0 3px rgba(138, 117, 227, 0.08) inset;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.events-shell {
  margin-top: 10px;
}
.events-list {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(280px, 520px);
  justify-content: center;
}
@media (max-width: 760px) {
  .events-list {
    grid-template-columns: 1fr;
    justify-content: stretch;
  }
}

/* drawer */
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 50;
}
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}
.drawer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: min(420px, 92vw);
  background: #fff;
  border-right: 1px solid #efefef;
  display: flex;
  flex-direction: column;
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid #f2f2f2;
}
.drawer-title {
  font-weight: 900;
}
.close-btn {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}
.drawer-body {
  padding: 14px;
  overflow: auto;
}
.drawer-foot {
  padding: 14px;
  border-top: 1px solid #f2f2f2;
}
.apply-btn {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 12px;
  background: #8a75e3;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.18s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
