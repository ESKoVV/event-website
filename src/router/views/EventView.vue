<template>
  <div class="page">
    <div class="topbar">
      <button class="back" @click="goBack">← Назад</button>

      <button class="share" @click="share" :disabled="loading || !event">
        🔗 Поделиться
      </button>
    </div>

    <div v-if="loading" class="state">Загрузка мероприятия…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="!event" class="state">Мероприятие не найдено</div>

    <div v-else class="card">
      <!-- фото -->
      <div class="photos" v-if="photos.length">
        <button
          v-for="(p, idx) in photos"
          :key="p.id || (p.photo_url + '_' + idx)"
          class="photo"
          type="button"
          @click="openPhoto(p.photo_url)"
          aria-label="Открыть фото"
        >
          <img :src="p.photo_url" alt="event photo" loading="lazy" decoding="async" />
        </button>
      </div>
      <div v-else class="no-photo">Фото отсутствуют</div>

      <!-- инфа -->
      <div class="title-row">
        <h1 class="title">{{ event.title }}</h1>

        <div v-if="copied" class="copied">Ссылка скопирована ✅</div>
      </div>

      <div class="badges">
        <span v-if="event.is_online" class="badge">🟢 Онлайн</span>
        <span v-if="event.is_free" class="badge">🆓 Бесплатно</span>
        <span v-for="c in categoryNames" :key="c" class="badge">{{ c }}</span>
      </div>

      <div class="meta">
        <div class="meta-item">
          <span class="k">📅</span>
          <span class="v">{{ formattedDateTime }}</span>
        </div>
        <div class="meta-item">
          <span class="k">📍</span>
          <span class="v">{{ event.address || '—' }}</span>
        </div>
        <div class="meta-item">
          <span class="k">👤</span>
          <span class="v">{{ event.organizer || '—' }}</span>
        </div>
        <div class="meta-item">
          <span class="k">💰</span>
          <span class="v price">{{ formattedPrice }}</span>
        </div>
      </div>

      <div class="desc">
        <div class="desc-title">Описание</div>
        <div class="desc-text">{{ event.description }}</div>
      </div>
    </div>

    <EventPhotoModal v-if="photoModalUrl" :url="photoModalUrl" @close="photoModalUrl = ''" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '../composables/useSupabase.js'
import EventPhotoModal from '../components/EventPhotoModal.vue'

const route = useRoute()
const router = useRouter()
const { getEventById, getEventPhotos, getCategories } = useSupabase()

const loading = ref(true)
const error = ref('')
const event = ref(null)
const photos = ref([])
const photoModalUrl = ref('')

const categories = ref([])
const categoryMap = computed(() => {
  const map = {}
  for (const c of categories.value || []) {
    if (!c) continue
    map[String(c.id)] = c.name
    map[String(c.name)] = c.name
  }
  return map
})

const normalizeCategoryNames = (raw, map) => {
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
  if (Array.isArray(raw)) return Array.from(new Set(raw.map((x) => toName(x)).filter(Boolean)))
  if (typeof raw === 'string') {
    return Array.from(
      new Set(
        raw
          .trim()
          .split(/[,;|]+/g)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => toName(x))
          .filter(Boolean)
      )
    )
  }
  const one = toName(raw)
  return one ? [one] : []
}

const categoryNames = computed(() => normalizeCategoryNames(event.value?.selectCategory, categoryMap.value))

const formattedDateTime = computed(() => {
  if (!event.value?.date_time_event) return '—'
  const d = new Date(event.value.date_time_event)
  if (Number.isNaN(d.getTime())) return String(event.value.date_time_event)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

const formattedPrice = computed(() => {
  if (event.value?.is_free) return 'Бесплатно'
  if (event.value?.price === 0 || event.value?.price === null) return 'Бесплатно'
  return `${event.value.price} ₽`
})

const buildUrl = (id) => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
  return `${window.location.origin}${base}event/${id}`
}

const copied = ref(false)
let copiedTimer = null

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

const share = async () => {
  if (!event.value?.id) return
  const url = buildUrl(event.value.id)
  const title = event.value.title || 'Мероприятие'

  try {
    if (navigator.share) {
      await navigator.share({ title, url })
      return
    }
  } catch {}

  const ok = await copyText(url)
  if (ok) {
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1800)
  } else {
    window.prompt('Скопируй ссылку:', url)
  }
}

const openPhoto = (url) => {
  if (!url) return
  photoModalUrl.value = url
}

const goBack = () => {
  // если пришли по прямой ссылке — вернём на главную
  if (window.history.length <= 1) router.push({ name: 'home' })
  else router.back()
}

const load = async () => {
  loading.value = true
  error.value = ''
  event.value = null
  photos.value = []

  const id = route.params.id
  const idNum = Number(id)
  if (!Number.isFinite(idNum)) {
    loading.value = false
    error.value = 'Некорректная ссылка (id)'
    return
  }

  // категории (чтобы красиво показать названия)
  const { data: cats } = await getCategories()
  categories.value = cats ?? []

  const { data, error: e1 } = await getEventById(idNum)
  if (e1) {
    loading.value = false
    error.value = String(e1.message || e1)
    return
  }

  // если мероприятие не опубликовано — считаем как “не найдено” для пользователей
  if (!data || data.is_published === false) {
    loading.value = false
    event.value = null
    return
  }

  event.value = data

  const { data: ph, error: e2 } = await getEventPhotos([idNum])
  if (e2) console.warn(e2)
  photos.value = (ph || []).filter((p) => p?.event_id === idNum && p?.photo_url)

  loading.value = false
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped>
.page {
  padding: 12px;
  max-width: 980px;
  margin: 0 auto;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.back, .share {
  border: 1px solid #efefef;
  background: #fafafa;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 900;
  cursor: pointer;
}
.back:hover, .share:hover { background: #f0f0f0; }
.share:disabled { opacity: .6; cursor: not-allowed; }

.state {
  padding: 18px;
  border: 1px solid #efefef;
  border-radius: 18px;
  background: #fff;
  font-weight: 800;
}
.state.error { color: #d9534f; }

.card {
  border: 1px solid #efefef;
  border-radius: 18px;
  background: #fff;
  padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
}

.photos{
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  margin-bottom: 12px;
}
.photo{
  flex: 0 0 92%;
  height: 240px;
  border: none;
  background: #f3f3f3;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  scroll-snap-align: start;
  padding: 0;
}
.photo img{
  width: 100%;
  height: 100%;
  object-fit: cover;
  display:block;
}

.no-photo{
  padding: 14px;
  border: 1px dashed #e6e6e6;
  border-radius: 16px;
  margin-bottom: 12px;
  opacity: .75;
  font-weight: 800;
}

.title-row{
  display:flex;
  align-items:flex-end;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.title{
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.copied{
  font-size: 12px;
  font-weight: 900;
  color: #2e7d32;
}

.badges{
  display:flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.badge{
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(138, 117, 227, 0.12);
  border: 1px solid rgba(138, 117, 227, 0.22);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.meta{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  margin-top: 12px;
}
@media (max-width: 760px){
  .meta{ grid-template-columns: 1fr; }
  .photo{ flex-basis: 94%; height: 210px; }
}

.meta-item{
  display:flex;
  gap: 8px;
  align-items:flex-start;
}
.k{ width:18px; flex: 0 0 18px; }
.v{ overflow-wrap:anywhere; word-break:break-word; }
.price{ font-weight: 900; }

.desc{
  margin-top: 14px;
  border-top: 1px solid #f2f2f2;
  padding-top: 12px;
}
.desc-title{
  font-weight: 900;
  margin-bottom: 6px;
}
.desc-text{
  white-space: pre-line;
  opacity: .9;
  line-height: 1.35;
  overflow-wrap:anywhere;
  word-break: break-word;
}
</style>
