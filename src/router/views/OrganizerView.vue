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
      </div>

      <template v-else>
        <!-- профиль -->
        <div class="org-card">
          <div class="org-avatar">
            <img v-if="avatar" :src="avatar" alt="avatar" @error="avatar = ''" />
            <div v-else class="org-fallback">{{ letter }}</div>
          </div>

          <div class="org-info">
            <div class="org-name">{{ name }}</div>
            <div class="org-sub">
              <span class="pill" v-if="profile?.It_business">Business</span>
            </div>
          </div>
        </div>

        <!-- мероприятия -->
        <div class="events-shell">
          <div v-if="eventsForCards.length === 0" class="state">
            У организатора нет опубликованных мероприятий
          </div>

          <TransitionGroup v-else name="list" tag="div" class="events-list">
            <EventCard
              v-for="e in eventsForCards"
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

const makeFavKey = (userId) => (userId ? `fav_event_ids_v1_${userId}` : 'fav_event_ids_v1_guest')

export default {
  components: { EventCard, EventPhotoModal },
  setup() {
    const route = useRoute()
    const { getPublicUserById, getUser } = useSupabase()

    const loading = ref(true)
    const error = ref('')

    const profile = ref(null)
    const avatar = ref('')

    const photoModalUrl = ref('')

    const categoryMap = ref({})
    const allEvents = ref([])
    const photosByEventId = ref({})

    const userId = ref(null)
    const favoriteIds = ref(new Set())

    const organizerId = computed(() => String(route.params.id || ''))

    const name = computed(() => {
      const p = profile.value
      const fn = (p?.first_name || '').trim()
      const ln = (p?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || p?.email || 'Пользователь'
    })

    const letter = computed(() => (name.value || 'П')[0].toUpperCase())

    const eventsForCards = computed(() => {
      if (!organizerId.value) return []

      return (allEvents.value || [])
        .filter((e) => String(e?.user_id || '') === organizerId.value)
        .filter((e) => e?.is_published !== false) // ❗ обычным нельзя видеть предложку
    })

    const getPhotosForEvent = (id) => {
      return photosByEventId.value?.[Number(id)] || []
    }

    const openPhoto = (url) => {
      photoModalUrl.value = url || ''
    }

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
        // профиль
        const { data } = await getPublicUserById(organizerId.value)
        profile.value = data || null
        avatar.value = data?.avatar_url || data?.image_path || ''

        // кэш
        const cache = getEventsCache()
        allEvents.value = cache?.events || []
        photosByEventId.value = cache?.photosByEventId || {}
        categoryMap.value = cache?.categoryMap || {}

        // фавориты
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
      loading,
      error,
      profile,
      avatar,
      name,
      letter,

      eventsForCards,
      getPhotosForEvent,
      categoryMap,

      favoriteIds,
      onToggleFavorite,

      photoModalUrl,
      openPhoto
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
.org-avatar img{ width:100%; height:100%; object-fit:cover; }
.org-fallback{
  font-weight:900; font-size:18px; color:#fff;
  background: linear-gradient(135deg,#8a75e3,#2e2a4a);
  width:100%; height:100%; display:grid; place-items:center;
}

.org-name{ font-weight:900; font-size:18px; }
.pill{
  margin-top:6px;
  font-size:12px; font-weight:900;
  padding:6px 10px; border-radius:999px;
  background: rgba(0,0,0,.06);
}

.state{
  padding: 18px; border: 1px solid #efefef; border-radius: 18px; background:#fff;
  font-weight: 800;
}

.events-shell { margin-top: 10px; }
.events-list { display: grid; gap: 12px; }

.list-enter-active, .list-leave-active { transition: all .18s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(6px); }
</style>
