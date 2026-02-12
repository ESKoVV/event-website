<!-- src/router/views/EventView.vue -->
<template>
  <div class="page">
    <div class="container">
      <button class="back" type="button" @click="$router.back()">← Назад</button>

      <div v-if="loading" class="state">
        <div class="spinner"></div>
        <div>Загрузка мероприятия…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Ошибка</div>
        <div class="error-sub">{{ error }}</div>
        <button class="retry" type="button" @click="load(routeId)">Повторить</button>
      </div>

      <template v-else>
        <!-- Основная карточка мероприятия -->
        <div class="card">
          <div class="media">
            <div v-if="!mainPhoto" class="photo-skel"></div>

            <img
              v-else
              class="photo"
              :src="mainPhoto"
              alt="event"
              @click="openPhoto(mainPhoto)"
            />

            <!-- Онлайн поверх фото -->
            <div v-if="event?.is_online" class="badge-online">🟢 Онлайн</div>

            <!-- мини-галерея -->
            <div v-if="eventPhotos.length > 1" class="thumbs">
              <button
                v-for="p in eventPhotos"
                :key="p.id"
                class="thumb"
                type="button"
                @click="openPhoto(p.photo_url)"
                aria-label="Открыть фото"
              >
                <img :src="p.photo_url" alt="thumb" />
              </button>
            </div>
          </div>

          <div class="info">
            <div class="title-row">
              <div class="title">{{ event?.title }}</div>

              <div class="actions">
                <!-- лайк -->
                <button
                  class="icon-btn"
                  type="button"
                  :class="{ active: isFavorite }"
                  @click="toggleFavorite()"
                  aria-label="В избранное"
                  title="В избранное"
                >
                  <span v-if="isFavorite">❤️</span>
                  <span v-else>🤍</span>
                </button>

                <!-- поделиться -->
                <button
                  class="icon-btn"
                  type="button"
                  @click="shareEvent"
                  aria-label="Поделиться"
                  title="Поделиться"
                >
                  🔗
                </button>
              </div>
            </div>

            <div v-if="copied" class="copied">✅ Ссылка скопирована</div>

            <div class="meta">
              <div class="m"><span>📅</span>{{ formatDate(event?.date_time_event) }}</div>
              <div class="m"><span>📍</span>{{ event?.address || '—' }}</div>

              <!-- Важно:
                   - тут можно оставить event.organizer как "название организатора/бренда" для конкретного события.
                   - а "Профиль организатора" ниже берётся из users по user_id -->
              <div class="m"><span>👤</span>{{ event?.organizer || '—' }}</div>

              <div class="m"><span>💰</span>{{ priceText }}</div>
            </div>

            <div v-if="event?.description" class="desc">{{ event.description }}</div>
          </div>
        </div>

        <!-- Организатор / Другие мероприятия -->
        <div class="tabs-wrap">
          <div class="tabs">
            <button class="tab" :class="{ active: tab === 'org' }" type="button" @click="tab = 'org'">
              Профиль организатора
            </button>
            <button class="tab" :class="{ active: tab === 'other' }" type="button" @click="tab = 'other'">
              Другие мероприятия
            </button>
          </div>

          <div class="panel" v-if="tab === 'org'">
            <div v-if="orgLoading" class="mini-state">Загрузка…</div>

            <div v-else class="org-card">
              <div class="org-avatar">
                <img v-if="orgAvatar" :src="orgAvatar" alt="avatar" @error="orgAvatar = ''" />
                <div v-else class="org-fallback">{{ orgLetter }}</div>
              </div>

              <div class="org-info">
                <div class="org-name">{{ orgName }}</div>
                <div class="org-sub">
                  <span class="pill" v-if="organizerProfile?.It_business">Business</span>
                  <span class="pill" v-else>Аккаунт</span>
                </div>
              </div>

              <!-- ✅ Переход БЕЗ перезагрузки (router.push), чтобы не умирал eventsCache -->
              <button class="go-org" type="button" @click="goOrganizer" :disabled="!event?.user_id">
                Перейти →
              </button>
            </div>
          </div>

          <div class="panel" v-else>
            <div v-if="otherLoading" class="mini-state">Загрузка…</div>

            <div v-else-if="otherEventsForCards.length === 0" class="mini-state">
              Других мероприятий нет
            </div>

            <!-- ✅ Те же карточки EventCard, без отдельного дизайна -->
            <div v-else class="events-shell">
              <TransitionGroup name="list" tag="div" class="events-list">
                <EventCard
                  v-for="e in otherEventsForCards"
                  :key="e.id"
                  :event="e"
                  :photos="getPhotosForEvent(e.id)"
                  :photos-loading="false"
                  :category-map="categoryMap"
                  :is-favorite="favoriteIds.has(Number(e.id))"
                  @open-photo="openPhoto"
                  @toggle-favorite="onToggleFavorite"
                />
              </TransitionGroup>
            </div>
          </div>
        </div>

        <EventPhotoModal v-if="photoModalUrl" :url="photoModalUrl" @close="photoModalUrl = ''" />
      </template>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EventPhotoModal from '@/components/EventPhotoModal.vue'
import EventCard from '@/components/EventCard.vue'
import { useSupabase } from '@/composables/useSupabase'
import { getEventsCache } from '@/composables/eventsCache'

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', 'true')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
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
  name: 'EventView',
  components: { EventPhotoModal, EventCard },
  setup() {
    const route = useRoute()
    const router = useRouter()

    const api = useSupabase()
    const { getEventById, getEventPhotos, getPublicUserById, getUser } = api
    // optional fallback when cache is empty
    const getOrganizerEvents = api.getOrganizerEvents

    const loading = ref(true)
    const error = ref('')

    const event = ref(null)
    const eventPhotos = ref([])

    const photoModalUrl = ref('')

    // tabs
    const tab = ref('org') // org | other

    // organizer
    const organizerProfile = ref(null)
    const orgAvatar = ref('')
    const orgLoading = ref(false)

    // other events
    const otherLoading = ref(false)
    const cachedAllEvents = ref(null) // from eventsCache
    const cachedPhotosByEventId = ref(null)
    const categoryMap = ref({})

    // favorites
    const userId = ref(null)
    const favoriteIds = ref(new Set())
    const favKey = ref(makeFavKey(null))
    const copied = ref(false)

    const routeId = computed(() => route.params.id)

    const mainPhoto = computed(() => {
      const p = eventPhotos.value?.[0]?.photo_url
      return (p || '').trim()
    })

    const priceText = computed(() => {
      if (!event.value) return '—'
      if (event.value.is_free) return 'Бесплатно'
      const p = Number(event.value.price ?? 0)
      if (!Number.isFinite(p) || p <= 0) return 'Бесплатно'
      return `${p} ₽`
    })

    // ✅ ИМЯ ОРГАНИЗАТОРА ТОЛЬКО ИЗ users (НЕ из events.organizer)
    const orgName = computed(() => {
      const p = organizerProfile.value
      const fn = (p?.first_name || '').trim()
      const ln = (p?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || (p?.email || 'Пользователь')
    })
    const orgLetter = computed(() => (orgName.value || 'П')[0].toUpperCase())

    const formatDate = (v) => {
      if (!v) return '—'
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) return String(v)
      return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    }

    const openPhoto = (url) => {
      photoModalUrl.value = url || ''
    }

    const buildEventUrl = (id) => {
      let base = import.meta.env.BASE_URL || '/'
      if (base === './' || base === '.') base = '/'
      base = base.replace(/\/+$/, '/')
      return `${window.location.origin}${base}event/${id}`
    }

    const shareEvent = async () => {
      if (!event.value?.id) return
      const url = buildEventUrl(event.value.id)
      const title = event.value?.title || 'Мероприятие'

      copied.value = false

      try {
        if (navigator.share) {
          await navigator.share({ title, url })
          return
        }
      } catch {}

      const ok = await copyText(url)
      if (ok) {
        copied.value = true
        setTimeout(() => (copied.value = false), 1200)
      } else {
        window.prompt('Скопируй ссылку:', url)
      }
    }

    const onToggleFavorite = ({ eventId, makeFavorite }) => {
      const idNum = Number(eventId)
      if (!Number.isFinite(idNum)) return

      const next = new Set(favoriteIds.value)
      if (makeFavorite) next.add(idNum)
      else next.delete(idNum)
      favoriteIds.value = next
      saveFavLS(favKey.value, favoriteIds.value)
    }

    const isFavorite = computed(() => {
      const idNum = Number(event.value?.id)
      if (!Number.isFinite(idNum)) return false
      return favoriteIds.value.has(idNum)
    })

    const toggleFavorite = () => {
      const idNum = Number(event.value?.id)
      if (!Number.isFinite(idNum)) return
      onToggleFavorite({ eventId: idNum, makeFavorite: !favoriteIds.value.has(idNum) })
    }

    const getPhotosForEvent = (eventId) => {
      const idNum = Number(eventId)
      if (!Number.isFinite(idNum)) return []
      const map = cachedPhotosByEventId.value
      if (map && map[idNum]) return map[idNum]
      return []
    }

    const otherEventsForCards = computed(() => {
      const orgId = String(event.value?.user_id || '')
      const currentId = Number(event.value?.id)
      const source = Array.isArray(cachedAllEvents.value) ? cachedAllEvents.value : []
      if (!orgId || !source.length) return []

      // ✅ НЕ грузим заново, если есть кэш: просто фильтруем
      return source
        .filter((e) => String(e?.user_id || '') === orgId)
        .filter((e) => Number(e?.id) !== currentId)
        .filter((e) => e?.is_published !== false) // обычным пользователям только опубликованные
    })

    const goOrganizer = () => {
      if (!event.value?.user_id) return
      // ✅ SPA-переход, без перезагрузки (иначе кеш пропадёт)
      router.push({ path: `/organizer/${event.value.user_id}` })
    }

    const loadFromCache = () => {
      const cache = getEventsCache()
      cachedAllEvents.value = Array.isArray(cache?.events) ? cache.events : null
      cachedPhotosByEventId.value = cache?.photosByEventId || null
      categoryMap.value = cache?.categoryMap || {}
    }

    const loadUserFavs = async () => {
      const { user } = await getUser()
      userId.value = user?.id || null
      favKey.value = makeFavKey(userId.value)
      favoriteIds.value = new Set(loadFavLS(favKey.value))
    }

    const loadOrganizerBlock = async () => {
      if (!event.value?.user_id) return
      orgLoading.value = true
      try {
        const { data: p } = await getPublicUserById(String(event.value.user_id))
        organizerProfile.value = p || null
        const a = (p?.avatar_url || '').trim()
        const b = (p?.image_path || '').trim()
        orgAvatar.value = normalizeStoragePublicUrl(a || b)
      } finally {
        orgLoading.value = false
      }
    }

    const loadOtherFallbackIfNoCache = async () => {
      // если кэша нет (прямой заход по ссылке) — один раз догружаем other через supabase
      if (Array.isArray(cachedAllEvents.value) && cachedAllEvents.value.length) return
      if (!event.value?.user_id) return
      if (typeof getOrganizerEvents !== 'function') return

      otherLoading.value = true
      try {
        const { data } = await getOrganizerEvents(String(event.value.user_id), {
          publishedOnly: true,
          excludeEventId: event.value.id
        })
        cachedAllEvents.value = Array.isArray(data) ? data : []
        // фото специально не догружаем (как договаривались), чтобы не плодить запросы
      } finally {
        otherLoading.value = false
      }
    }

    const load = async (idRaw) => {
      loading.value = true
      error.value = ''
      event.value = null
      eventPhotos.value = []
      organizerProfile.value = null
      orgAvatar.value = ''
      tab.value = 'org'

      try {
        const id = Number(idRaw)
        if (!Number.isFinite(id)) throw new Error('Некорректный id мероприятия')

        loadFromCache()
        await loadUserFavs()

        // 1) пытаемся найти событие в кэше (без supabase)
        const fromCache =
          Array.isArray(cachedAllEvents.value) && cachedAllEvents.value.length
            ? cachedAllEvents.value.find((e) => Number(e?.id) === id)
            : null

        if (fromCache) {
          event.value = fromCache
          const ph = cachedPhotosByEventId.value && cachedPhotosByEventId.value[id]
          eventPhotos.value = Array.isArray(ph) ? ph.filter((x) => x?.photo_url) : []
        } else {
          // 2) иначе — грузим только текущее событие
          const { data: e, error: e1 } = await getEventById(id)
          if (e1) throw e1
          if (!e) throw new Error('Мероприятие не найдено')
          event.value = e

          // фото текущего события (один запрос)
          const { data: ph, error: e2 } = await getEventPhotos([id])
          if (e2) throw e2
          eventPhotos.value = (ph || []).filter((x) => x?.photo_url)
        }

        await loadOrganizerBlock()
        await loadOtherFallbackIfNoCache()
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(() => load(routeId.value))

    watch(
      () => routeId.value,
      (v) => {
        if (v) load(v)
      }
    )

    return {
      routeId,
      loading,
      error,
      event,
      eventPhotos,
      mainPhoto,
      priceText,
      formatDate,

      photoModalUrl,
      openPhoto,

      tab,
      organizerProfile,
      orgAvatar,
      orgName,
      orgLetter,
      orgLoading,
      goOrganizer,

      otherLoading,
      otherEventsForCards,
      getPhotosForEvent,
      categoryMap,

      favoriteIds,
      isFavorite,
      toggleFavorite,
      onToggleFavorite,

      shareEvent,
      copied,

      load
    }
  }
}
</script>

<style scoped>
.page { padding: 12px 0; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 12px; }

.back{
  border: 1px solid #efefef; background: #fff; border-radius: 14px;
  padding: 10px 12px; font-weight: 900; cursor: pointer;
  margin-bottom: 10px;
}

.state{
  padding: 18px; border: 1px solid #efefef; border-radius: 18px; background:#fff;
  display:flex; align-items:center; gap: 10px; font-weight: 800;
}
.state.error{ color:#d9534f; display:block; }
.error-title{ font-weight: 900; margin-bottom: 6px; }
.error-sub{ opacity: .85; margin-bottom: 10px; }
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

.card{
  border: 1px solid #efefef; background:#fff; border-radius: 18px;
  overflow:hidden; display:grid; grid-template-columns: 420px 1fr;
}
@media (max-width: 900px){
  .card{ grid-template-columns: 1fr; }
}

.media{ position: relative; background:#f2f2f2; }
.photo-skel{ width:100%; height: 280px; background:#f0f0f0; }
.photo{ width:100%; height: 280px; object-fit: cover; display:block; cursor:pointer; }

.badge-online{
  position:absolute; left: 12px; top: 12px;
  padding: 7px 10px; border-radius: 999px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,.25);
  color:#fff; font-weight: 900; font-size: 12px;
  backdrop-filter: blur(6px);
}

.thumbs{
  position:absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display:flex;
  gap: 8px;
  overflow:auto;
  padding-bottom: 2px;
}
.thumbs::-webkit-scrollbar{ height: 6px; }
.thumbs::-webkit-scrollbar-thumb{ background: rgba(0,0,0,.15); border-radius: 999px; }

.thumb{
  width: 56px; height: 56px;
  border-radius: 14px;
  overflow:hidden;
  border: 1px solid rgba(255,255,255,.35);
  background: rgba(0,0,0,.12);
  flex: 0 0 auto;
  padding: 0;
  cursor: pointer;
}
.thumb img{ width:100%; height:100%; object-fit: cover; display:block; }

.info{ padding: 14px; display:grid; gap: 10px; }
.title-row{ display:flex; align-items:flex-start; gap: 10px; }
.title{ flex:1 1 auto; font-weight: 900; font-size: 20px; overflow-wrap:anywhere; }

.actions{ display:flex; gap: 8px; flex: 0 0 auto; }
.icon-btn{
  width: 40px; height: 40px; border-radius: 14px;
  border: 1px solid #efefef; background:#fafafa;
  cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  font-size: 16px;
}
.icon-btn.active{ background: rgba(217,83,79,.10); border-color: rgba(217,83,79,.22); }

.copied{
  width: fit-content;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(46,125,50,.22);
  background: rgba(46,125,50,.10);
  color:#2e7d32;
  font-weight: 900;
  font-size: 12px;
}

.meta{ display:grid; gap: 8px; font-weight: 800; }
.m{ display:flex; gap: 8px; align-items:flex-start; opacity:.9; }
.m span{ width: 18px; }

.desc{ white-space: pre-line; line-height: 1.35; opacity:.9; }

.tabs-wrap{
  margin-top: 12px;
  border: 1px solid #efefef;
  background:#fff;
  border-radius: 18px;
  overflow:hidden;
}
.tabs{
  display:flex;
  border-bottom: 1px solid #f2f2f2;
}
.tab{
  flex: 1 1 50%;
  padding: 12px 14px;
  font-weight: 900;
  background:#fff;
  border:none;
  cursor:pointer;
}
.tab.active{ background: rgba(138,117,227,.10); }

.panel{ padding: 14px; }
.mini-state{ font-weight: 900; opacity:.8; }

.org-card{
  display:flex; align-items:center; gap: 12px;
  border: 1px solid #efefef; border-radius: 18px; padding: 12px;
}
.org-avatar{
  width: 56px; height: 56px; border-radius: 999px; overflow:hidden;
  border: 1px solid #efefef; background:#f2f2f2; display:grid; place-items:center;
}
.org-avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.org-fallback{
  font-weight: 900; font-size: 18px; color:#fff;
  background: linear-gradient(135deg,#8a75e3,#2e2a4a);
  width:100%; height:100%; display:grid; place-items:center;
}

.org-info{ flex: 1 1 auto; min-width:0; }
.org-name{ font-weight: 900; font-size: 16px; overflow-wrap:anywhere; }
.org-sub{ margin-top: 6px; display:flex; gap: 8px; flex-wrap: wrap; }
.pill{
  font-size: 12px; font-weight: 900; padding: 6px 10px; border-radius: 999px;
  background: rgba(0,0,0,.06); border: 1px solid rgba(0,0,0,.06);
}

.go-org{
  border:none; border-radius: 14px;
  padding: 10px 12px;
  background:#8a75e3; color:#fff;
  font-weight: 900; cursor:pointer;
}
.go-org:disabled{ opacity:.6; cursor:not-allowed; }

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

.list-enter-active, .list-leave-active { transition: all .18s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(6px); }
</style>
