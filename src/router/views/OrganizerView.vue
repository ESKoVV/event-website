<template>
  <div class="page">
    <div class="container">
      <button class="back" type="button" @click="$router.back()">← Назад</button>

      <div v-if="loading" class="state">
        <div class="spinner"></div>
        <div>Загрузка организатора…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Ошибка</div>
        <div class="error-sub">{{ error }}</div>
      </div>

      <template v-else>
        <div class="org-card">
          <div class="avatar">
            <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" @error="avatarUrl = ''" />
            <div v-else class="fallback">{{ letter }}</div>
          </div>

          <div class="org-info">
            <div class="name">{{ displayName }}</div>
            <div class="sub">
              <span v-if="profile?.It_business" class="badge">Business</span>
              <span v-else class="badge off">Обычный аккаунт</span>

              <span v-if="isOwner" class="badge owner">Это вы</span>
            </div>
          </div>
        </div>

        <div class="toolbar" v-if="isOwner">
          <div class="hint">
            Здесь показаны ваши мероприятия: и опубликованные, и те, что в обработке.
          </div>
        </div>

        <div class="list-title">Мероприятия организатора</div>

        <div v-if="events.length === 0" class="state">
          Пока нет мероприятий
        </div>

        <div v-else class="events">
          <div
            v-for="e in events"
            :key="e.id"
            class="event-row"
            @click="$router.push({ name: 'event', params: { id: String(e.id) } })"
            role="button"
            tabindex="0"
          >
            <div class="row-left">
              <div class="row-title">{{ e.title }}</div>
              <div class="row-sub">
                <span v-if="e.is_online" class="pill">Онлайн</span>
                <span v-if="e.is_free" class="pill">Бесплатно</span>
                <span v-if="isOwner && e.is_published === false" class="pill warn">В обработке</span>
              </div>
            </div>

            <div class="row-right">
              <div class="date">{{ formatDate(e.date_time_event) }}</div>
              <div class="go">→</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

const normalizeStoragePublicUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (u.includes('/storage/v1/object/public/')) return u
  if (u.includes('/storage/v1/object/')) return u.replace('/storage/v1/object/', '/storage/v1/object/public/')
  return u
}

export default {
  name: 'OrganizerView',
  props: { id: { type: String, required: true } },
  setup(props) {
    const { getUser, getPublicUserById, getOrganizerEvents } = useSupabase()

    const loading = ref(true)
    const error = ref('')
    const profile = ref(null)
    const events = ref([])

    const isOwner = ref(false)

    const avatarUrl = ref('')
    const displayName = computed(() => {
      const p = profile.value
      const fn = (p?.first_name || '').trim()
      const ln = (p?.last_name || '').trim()
      const full = `${fn} ${ln}`.trim()
      return full || (p?.email || 'Организатор')
    })
    const letter = computed(() => (displayName.value || 'О')[0].toUpperCase())

    const formatDate = (v) => {
      if (!v) return '—'
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) return String(v)
      return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    }

    const load = async () => {
      loading.value = true
      error.value = ''
      try {
        const organizerId = String(props.id)

        const { user } = await getUser()
        isOwner.value = !!user?.id && String(user.id) === organizerId

        const { data: p, error: e1 } = await getPublicUserById(organizerId)
        if (e1) throw e1
        profile.value = p

        const a = (p?.avatar_url || '').trim()
        const b = (p?.image_path || '').trim()
        avatarUrl.value = normalizeStoragePublicUrl(a || b)

        const { data: ev, error: e2 } = await getOrganizerEvents(organizerId, {
          publishedOnly: !isOwner.value
        })
        if (e2) throw e2
        events.value = ev || []
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(load)

    return { loading, error, profile, events, isOwner, avatarUrl, displayName, letter, formatDate }
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

.org-card{
  display:flex; gap: 12px; align-items:center;
  border: 1px solid #efefef; background:#fff; border-radius: 18px;
  padding: 14px; margin-bottom: 12px;
}
.avatar{
  width: 64px; height: 64px; border-radius: 999px; overflow:hidden;
  border: 1px solid #efefef; background:#f2f2f2;
  display:grid; place-items:center; flex: 0 0 auto;
}
.avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
.fallback{ font-weight: 900; font-size: 22px; color:#fff; background: linear-gradient(135deg,#8a75e3,#2e2a4a); width:100%; height:100%; display:grid; place-items:center; }

.org-info{ min-width:0; }
.name{ font-weight: 900; font-size: 18px; }
.sub{ margin-top: 6px; display:flex; gap: 8px; flex-wrap: wrap; }
.badge{
  font-size: 12px; font-weight: 900; padding: 6px 10px; border-radius: 999px;
  background: rgba(138,117,227,.12); border: 1px solid rgba(138,117,227,.22);
}
.badge.off{ opacity: .7; }
.badge.owner{ background: rgba(46,125,50,.10); border-color: rgba(46,125,50,.22); color:#2e7d32; }

.toolbar .hint{
  padding: 12px 14px; border: 1px solid #efefef; background:#fff;
  border-radius: 18px; font-weight: 800; margin-bottom: 12px;
}
.list-title{ font-weight: 900; margin: 10px 0; }

.events{ display:grid; gap: 10px; }
.event-row{
  border: 1px solid #efefef; background:#fff; border-radius: 18px;
  padding: 14px; display:flex; align-items:center; gap: 12px;
  cursor:pointer;
}
.event-row:hover{ background:#fafafa; }
.row-left{ flex: 1 1 auto; min-width: 0; }
.row-title{ font-weight: 900; font-size: 16px; overflow-wrap:anywhere; }
.row-sub{ margin-top: 6px; display:flex; gap: 8px; flex-wrap: wrap; }
.pill{
  font-size: 12px; font-weight: 900; padding: 6px 10px; border-radius: 999px;
  background: rgba(0,0,0,.06); border: 1px solid rgba(0,0,0,.06);
}
.pill.warn{ background: rgba(217,83,79,.10); border-color: rgba(217,83,79,.22); color:#d9534f; }

.row-right{ display:flex; align-items:center; gap: 10px; flex: 0 0 auto; }
.date{ font-size: 12px; opacity: .8; font-weight: 800; }
.go{ font-weight: 900; opacity: .6; }
</style>
