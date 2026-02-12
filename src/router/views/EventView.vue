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
      </div>

      <template v-else>
        <div class="card">
          <div class="photo">
            <div v-if="!mainPhoto" class="ph-skel"></div>
            <img v-else :src="mainPhoto" alt="event" @click="openPhoto(mainPhoto)" />

            <div v-if="event?.is_online" class="badge-online">🟢 Онлайн</div>
          </div>

          <div class="info">
            <div class="title-row">
              <div class="title">{{ event?.title }}</div>

              <button class="share" type="button" @click="shareEvent" aria-label="Поделиться">🔗</button>
            </div>

            <div class="meta">
              <div class="m"><span>📅</span>{{ formatDate(event?.date_time_event) }}</div>
              <div class="m"><span>📍</span>{{ event?.address || '—' }}</div>
              <div class="m"><span>👤</span>{{ event?.organizer || '—' }}</div>
              <div class="m"><span>💰</span>{{ priceText }}</div>
            </div>

            <div class="desc" v-if="event?.description">{{ event.description }}</div>

            <div class="photos" v-if="photos.length > 1">
              <button
                v-for="p in photos"
                :key="p.id"
                class="thumb"
                type="button"
                @click="openPhoto(p.photo_url)"
              >
                <img :src="p.photo_url" alt="thumb" />
              </button>
            </div>
          </div>
        </div>

        <!-- ✅ Organizer section -->
        <div class="org-tabs">
          <div class="tabs">
            <button class="tab" :class="{ active: orgTab === 'profile' }" @click="orgTab = 'profile'" type="button">
              Профиль организатора
            </button>
            <button class="tab" :class="{ active: orgTab === 'more' }" @click="orgTab = 'more'" type="button">
              Другие мероприятия
            </button>
          </div>

          <div class="panel" v-if="orgTab === 'profile'">
            <div v-if="orgLoading" class="mini-state">Загрузка…</div>
            <div v-else-if="!organizerProfile" class="mini-state">Организатор не найден</div>
            <div v-else class="org-card">
              <div class="avatar">
                <img v-if="orgAvatar" :src="orgAvatar" alt="avatar" @error="orgAvatar = ''" />
                <div v-else class="fallback">{{ orgLetter }}</div>
              </div>

              <div class="org-info">
                <div class="org-name">{{ orgName }}</div>
                <div class="org-sub">
                  <span v-if="organizerProfile.It_business" class="pill">Business</span>
                  <span v-else class="pill">Аккаунт</span>
                </div>
              </div>

              <button
                class="go-org"
                type="button"
                @click="$router.push({ name: 'organizer', params: { id: String(event.user_id) } })"
              >
                Перейти →
              </button>
            </div>
          </div>

          <div class="panel" v-else>
            <div v-if="orgLoading" class="mini-state">Загрузка…</div>
            <div v-else-if="otherEvents.length === 0" class="mini-state">
              Других мероприятий нет
            </div>
            <div v-else class="other-list">
              <div
                v-for="e in otherEvents"
                :key="e.id"
                class="other-row"
                @click="$router.push({ name: 'event', params: { id: String(e.id) } })"
              >
                <div class="other-title">{{ e.title }}</div>
                <div class="other-sub">
                  <span v-if="e.is_online" class="pill">Онлайн</span>
                  <span v-if="e.is_free" class="pill">Бесплатно</span>
                  <span class="date">{{ formatDate(e.date_time_event) }}</span>
                </div>
              </div>
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
import { useRoute } from 'vue-router'
import { useSupabase } from '@/composables/useSupabase'
import EventPhotoModal from '@/components/EventPhotoModal.vue'

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

export default {
  name: 'EventView',
  components: { EventPhotoModal },
  props: { id: { type: String, default: '' } },
  setup(props) {
    const route = useRoute()
    const { getEventById, getEventPhotos, getPublicUserById, getOrganizerEvents } = useSupabase()

    const loading = ref(true)
    const error = ref('')
    const event = ref(null)
    const photos = ref([])
    const photoModalUrl = ref('')

    // organizer
    const orgTab = ref('profile')
    const orgLoading = ref(false)
    const organizerProfile = ref(null)
    const otherEvents = ref([])
    const orgAvatar = ref('')

    const mainPhoto = computed(() => (photos.value?.[0]?.photo_url || '').trim())
    const priceText = computed(() => {
      if (!event.value) return '—'
      if (event.value.is_free) return 'Бесплатно'
      const p = Number(event.value.price ?? 0)
      if (!Number.isFinite(p) || p <= 0) return 'Бесплатно'
      return `${p} ₽`
    })

    const orgName = computed(() => {
      const p = organizerProfile.value
      const fn = (p?.first_name || '').trim()
      const ln = (p?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || (p?.email || 'Организатор')
    })
    const orgLetter = computed(() => (orgName.value || 'О')[0].toUpperCase())

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

      try {
        if (navigator.share) {
          await navigator.share({ title, url })
          return
        }
      } catch {}

      const ok = await copyText(url)
      if (!ok) window.prompt('Скопируй ссылку:', url)
    }

    const loadOrganizerBlock = async () => {
      if (!event.value?.user_id) return
      orgLoading.value = true
      try {
        const orgId = String(event.value.user_id)

        const { data: p } = await getPublicUserById(orgId)
        organizerProfile.value = p || null

        const a = (p?.avatar_url || '').trim()
        const b = (p?.image_path || '').trim()
        orgAvatar.value = normalizeStoragePublicUrl(a || b)

        const { data: ev } = await getOrganizerEvents(orgId, {
          publishedOnly: true,
          excludeEventId: event.value.id
        })
        otherEvents.value = ev || []
      } finally {
        orgLoading.value = false
      }
    }

    const load = async (eventId) => {
      loading.value = true
      error.value = ''
      event.value = null
      photos.value = []
      organizerProfile.value = null
      otherEvents.value = []
      orgAvatar.value = ''
      try {
        const id = Number(eventId)
        if (!Number.isFinite(id)) throw new Error('Некорректный id мероприятия')

        const { data: e, error: e1 } = await getEventById(id)
        if (e1) throw e1
        if (!e) throw new Error('Мероприятие не найдено')

        event.value = e

        const { data: ph, error: e2 } = await getEventPhotos([id])
        if (e2) throw e2

        photos.value = (ph || []).filter((x) => x?.photo_url)

        await loadOrganizerBlock()
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(() => load(props.id || route.params.id))

    watch(
      () => route.params.id,
      (v) => {
        if (v) load(v)
      }
    )

    return {
      loading,
      error,
      event,
      photos,
      mainPhoto,
      priceText,
      photoModalUrl,
      openPhoto,
      shareEvent,
      formatDate,

      orgTab,
      orgLoading,
      organizerProfile,
      otherEvents,
      orgAvatar,
      orgName,
      orgLetter
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
.error-sub{ opacity: .85; }

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

.photo{ position: relative; background:#f2f2f2; }
.ph-skel{ width:100%; height: 280px; background:#f0f0f0; }
.photo img{ width:100%; height: 280px; object-fit: cover; display:block; cursor:pointer; }

.badge-online{
  position:absolute; left: 12px; top: 12px;
  padding: 7px 10px; border-radius: 999px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,.25);
  color:#fff; font-weight: 900; font-size: 12px;
  backdrop-filter: blur(6px);
}

.info{ padding: 14px; display:grid; gap: 10px; }
.title-row{ display:flex; align-items:flex-start; gap: 10px; }
.title{ flex:1 1 auto; font-weight: 900; font-size: 20px; overflow-wrap:anywhere; }
.share{
  width: 40px; height: 40px; border-radius: 14px;
  border: 1px solid #efefef; background:#fafafa;
  cursor:pointer;
}

.meta{ display:grid; gap: 8px; font-weight: 800; }
.m{ display:flex; gap: 8px; align-items:flex-start; opacity:.9; }
.m span{ width: 18px; }

.desc{ white-space: pre-line; line-height: 1.35; opacity:.9; }

.photos{ display:flex; gap: 8px; flex-wrap: wrap; }
.thumb{
  width: 60px; height: 60px; border-radius: 14px; overflow:hidden;
  border: 1px solid #efefef; background:#fff; padding:0; cursor:pointer;
}
.thumb img{ width:100%; height:100%; object-fit:cover; display:block; }

.org-tabs{
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
.tab.active{
  background: rgba(138,117,227,.10);
}

.panel{ padding: 14px; }
.mini-state{ font-weight: 900; opacity:.8; }

.org-card{
  display:flex; align-items:center; gap: 12px;
  border: 1px solid #efefef; border-radius: 18px; padding: 12px;
}
.avatar{
  width: 56px; height: 56px; border-radius: 999px; overflow:hidden;
  border: 1px solid #efefef; background:#f2f2f2; display:grid; place-items:center;
}
.avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.fallback{
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

.other-list{ display:grid; gap: 10px; }
.other-row{
  border: 1px solid #efefef; border-radius: 18px; padding: 12px;
  cursor:pointer;
}
.other-row:hover{ background:#fafafa; }
.other-title{ font-weight: 900; overflow-wrap:anywhere; }
.other-sub{ margin-top: 6px; display:flex; gap: 8px; flex-wrap: wrap; align-items:center; }
.date{ font-size: 12px; opacity:.8; font-weight: 800; }
</style>
