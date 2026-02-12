<template>
  <div class="page">
    <div class="container">
      <button class="back" type="button" @click="$router.back()">← Назад</button>

      <div v-if="loading" class="state">
        <div class="spinner"></div>
        <div>Загрузка профиля…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Ошибка</div>
        <div class="error-sub">{{ error }}</div>
        <button class="retry" type="button" @click="load">Повторить</button>
      </div>

      <template v-else>
        <div class="org-card">
          <div class="org-avatar">
            <img v-if="avatar" :src="avatar" alt="avatar" @error="avatar = ''" />
            <div v-else class="org-fallback">{{ letter }}</div>
          </div>

          <div class="org-info">
            <div class="org-name">{{ name }}</div>
            <div class="org-sub">
              <span class="pill" v-if="profile?.It_business">Business</span>
              <span class="pill" v-else>Аккаунт</span>
            </div>
          </div>
        </div>

        <div class="events-shell">
          <div v-if="eventsForCards.length === 0" class="state">
            У организатора нет опубликованных мероприятий
          </div>

          <TransitionGroup v-else name="list" tag="div" class="events-list">
            <EventCard
              v-for="e in eventsForCards"
              :key="e.id"
              :event="e"
              :photos="photosByEventId[Number(e.id)] || []"
              :photos-loading="false"
              :category-map="categoryMap"
              :is-favorite="favoriteIds.has(Number(e.id))"
              @open-photo="openPhoto"
              @toggle-favorite="onToggleFavorite"
            />
          </TransitionGroup>
        </div>
      </template>
    </div>

    <EventPhotoModal v-if="photoModalUrl" :url="photoModalUrl" @close="photoModalUrl = ''" />
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSupabase } from '@/composables/useSupabase'
import { getEventsCache } from '@/composables/eventsCache'
import EventCard from '@/components/EventCard.vue'
import EventPhotoModal from '@/components/EventPhotoModal.vue'

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

const makeFavKey = (userId) => (userId ? `fav_event_ids_v1_${userId}` : 'fav_event_ids_v1_guest')

export default {
  name: 'OrganizerView',
  components: { EventCard, EventPhotoModal },
  setup() {
    const route = useRoute()
    const { getPublicUserById, getOrganizerEvents, getEventPhotos, getUser } = useSupabase()

    const loading = ref(true)
    const error = ref('')

    const profile = ref(null)
    const avatar = ref('')

    const categoryMap = ref({})
    const allEvents = ref([])
    const photosByEventId = ref({})

    const userId = ref(null)
    const favoriteIds = ref(new Set())

    const photoModalUrl = ref('')

    const organizerId = computed(() => String(route.params.id || ''))

    const name = computed(() => {
      const p = profile.value
      const fn = (p?.first_name || '').trim()
      const ln = (p?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || p?.email || 'Пользователь'
    })

    const letter = computed(() => (name.value || 'П')[0].toUpperCase())

    // ✅ обычным показываем ТОЛЬКО опубликованные
    const eventsForCards = computed(() => {
      if (!organizerId.value) return []
      return (allEvents.value || [])
        .filter((e) => String(e?.user_id || '') === organizerId.value)
        .filter((e) => e?.is_published !== false)
    })

    const openPhoto = (url) => { photoModalUrl.value = url || '' }

    const onToggleFavorite = ({ eventId, makeFavorite }) => {
      const id = Number(eventId)
      const next = new Set(favoriteIds.value)
      if (makeFavorite) next.add(id)
      else next.delete(id)
      favoriteIds.value = next
      localStorage.setItem(makeFavKey(userId.value), JSON.stringify(Array.from(next)))
    }

    const load = async () => {
      loading.value = true
      error.value = ''
      try {
        // 1) профиль
        const { data } = await getPublicUserById(organizerId.value)
        profile.value = data || null
        avatar.value = normalizeStoragePublicUrl(data?.avatar_url || data?.image_path || '')

        // 2) попытка из кеша (кеш теперь живёт и после F5)
        const cache = getEventsCache()
        categoryMap.value = cache?.categoryMap || {}
        photosByEventId.value = cache?.photosByEventId || {}
        allEvents.value = Array.isArray(cache?.events) ? cache.events : []

        // 3) ✅ fallback если кэша нет (прямой заход/новая вкладка)
        if (!Array.isArray(allEvents.value) || allEvents.value.length === 0) {
          const { data: evs } = await getOrganizerEvents(organizerId.value, {
            publishedOnly: true,
            excludeEventId: null
          })
          allEvents.value = Array.isArray(evs) ? evs : []

          const ids = allEvents.value.map((e) => e.id)
          if (ids.length) {
            const { data: ph } = await getEventPhotos(ids)
            const grouped = {}
            for (const row of (ph || [])) {
              if (!row?.event_id) continue
              if (!grouped[row.event_id]) grouped[row.event_id] = []
              grouped[row.event_id].push(row)
            }
            photosByEventId.value = grouped
          }
        }

        // 4) фавориты
        const { user } = await getUser()
        userId.value = user?.id || null
        const raw = localStorage.getItem(makeFavKey(userId.value))
        favoriteIds.value = new Set(raw ? JSON.parse(raw) : [])
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(load)

    return {
      loading, error,
      profile, avatar, name, letter,
      eventsForCards, photosByEventId, categoryMap,
      favoriteIds, onToggleFavorite,
      photoModalUrl, openPhoto,
      load
    }
  }
}
</script>

<style scoped>
.page { padding: 12px 0; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 12px; }

.back{
  border: 1px solid #efefef; background:#fff; border-radius: 14px;
  padding: 10px 12px; font-weight: 900; cursor: pointer;
  margin-bottom: 10px;
}

.org-card{
  display:flex; align-items:center; gap: 12px;
  border: 1px solid #efefef; border-radius: 18px;
  padding: 14px; background:#fff; margin-bottom: 12px;
}

.org-avatar{
  width: 64px; height: 64px; border-radius: 999px;
  overflow:hidden; border:1px solid #efefef; background:#f2f2f2;
  display:grid; place-items:center;
}
.org-avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.org-fallback{
  font-weight:900; font-size:18px; color:#fff;
  background: linear-gradient(135deg,#8a75e3,#2e2a4a);
  width:100%; height:100%; display:grid; place-items:center;
}
.org-name{ font-weight:900; font-size:18px; }
.org-sub{ margin-top: 6px; display:flex; gap: 8px; flex-wrap: wrap; }
.pill{
  font-size:12px; font-weight:900;
  padding:6px 10px; border-radius:999px;
  background: rgba(0,0,0,.06);
  border: 1px solid rgba(0,0,0,.06);
}

.state{
  padding: 18px; border: 1px solid #efefef; border-radius: 18px; background:#fff;
  display:flex; align-items:center; gap: 10px; font-weight: 800;
}
.state.error{ color:#d9534f; display:block; }
.error-title{ font-weight: 900; margin-bottom: 6px; }
.error-sub{ opacity: .85; margin-bottom: 10px; }
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
.events-list { display: grid; gap: 14px; }

.list-enter-active, .list-leave-active { transition: all .18s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(6px); }
</style>
