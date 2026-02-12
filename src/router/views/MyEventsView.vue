<template>
  <div class="page">
    <div class="container">
      <button class="back" type="button" @click="$router.back()">← Назад</button>

      <div class="title">Мои мероприятия</div>

      <div v-if="loading" class="state">
        <div class="spinner"></div>
        <div>Загрузка…</div>
      </div>

      <div v-else-if="error" class="state error">
        <div class="error-title">Ошибка</div>
        <div class="error-sub">{{ error }}</div>
      </div>

      <div v-else-if="events.length === 0" class="state">
        У вас пока нет мероприятий
      </div>

      <div v-else class="events">
        <div
          v-for="e in events"
          :key="e.id"
          class="event-row"
          @click="$router.push({ name: 'event', params: { id: String(e.id) } })"
        >
          <div class="row-left">
            <div class="row-title">{{ e.title }}</div>
            <div class="row-sub">
              <span v-if="e.is_published" class="pill ok">Опубликовано</span>
              <span v-else class="pill warn">В обработке</span>
              <span v-if="e.is_online" class="pill">Онлайн</span>
              <span v-if="e.is_free" class="pill">Бесплатно</span>
            </div>
          </div>

          <div class="row-right">
            <div class="date">{{ formatDate(e.date_time_event) }}</div>
            <div class="go">→</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

export default {
  name: 'MyEventsView',
  setup() {
    const { getMyEvents } = useSupabase()
    const loading = ref(true)
    const error = ref('')
    const events = ref([])

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
        const { data, error: e } = await getMyEvents(true)
        if (e) throw e
        events.value = data || []
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    onMounted(load)
    return { loading, error, events, formatDate }
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
.title{ font-weight: 900; font-size: 18px; margin: 8px 0 12px; }

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
.pill.ok{ background: rgba(46,125,50,.10); border-color: rgba(46,125,50,.22); color:#2e7d32; }
.pill.warn{ background: rgba(217,83,79,.10); border-color: rgba(217,83,79,.22); color:#d9534f; }

.row-right{ display:flex; align-items:center; gap: 10px; flex: 0 0 auto; }
.date{ font-size: 12px; opacity: .8; font-weight: 800; }
.go{ font-weight: 900; opacity: .6; }
</style>
