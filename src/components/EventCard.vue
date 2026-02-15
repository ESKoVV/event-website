<template>
  <div
    class="card"
    role="button"
    tabindex="0"
    @click="openEvent"
    @keydown.enter="openEvent"
    @keydown.space.prevent="openEvent"
  >
    <button ref="photoBtn" class="photo" type="button" @click.stop="handleOpenPhoto" aria-label="Открыть фото">
      <div v-if="!inView || !hasPhotos" class="photo-skeleton" :class="{ shimmer: photosLoading }"></div>

      <div
        v-else
        ref="carouselEl"
        class="photo-carousel"
        @click.stop
        @scroll.passive="onCarouselScroll"
        aria-label="Фотографии мероприятия"
      >
        <button
          v-for="(url, idx) in photoUrls"
          :key="url + '_' + idx"
          class="slide"
          type="button"
          @click.stop="emitOpenPhoto(url)"
          aria-label="Открыть фото"
        >
          <img :src="url" alt="event photo" loading="lazy" decoding="async" @error="onSlideError(idx)" />
        </button>
      </div>

      <div v-if="photoUrls.length > 1" class="arrows" aria-hidden="true">
        <button class="arrow left" type="button" @click.stop="scrollPrev" aria-label="Предыдущее фото">‹</button>
        <button class="arrow right" type="button" @click.stop="scrollNext" aria-label="Следующее фото">›</button>
      </div>

      <div v-if="event.is_online" class="photo-badge" aria-label="Онлайн">🟢 Онлайн</div>

      <div v-if="photoUrls.length > 1" class="dots" aria-hidden="true">
        <span v-for="(_, i) in photoUrls" :key="'dot_' + i" class="dot" :class="{ on: i === activeIndex }" />
      </div>

      <button
        class="like"
        type="button"
        @click.stop="toggleLike"
        :aria-label="isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'"
      >
        <span :class="{ on: isFavorite }">{{ isFavorite ? '❤️' : '🤍' }}</span>
      </button>
    </button>

    <div class="info">
      <div class="top-row">
        <div class="title-row">
          <div class="title">{{ event.title }}</div>

          <div class="right-actions">
            <button class="share" type="button" @click.stop="shareEvent" aria-label="Поделиться">🔗</button>
          </div>
        </div>

        <div class="badges">
          <span v-if="event.is_free" class="badge">🆓 Бесплатно</span>
          <span v-for="c in categoryNames" :key="c" class="badge">{{ c }}</span>
        </div>
      </div>

      <p v-if="event.description" class="desc">
        {{ event.description }}
      </p>

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

      <div v-if="copied" class="copied">Ссылка скопирована ✅</div>
    </div>
  </div>
</template>

<script>
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
    const parts = raw
      .trim()
      .split(/[,;|]+/g)
      .map((x) => x.trim())
      .filter(Boolean)

    return Array.from(new Set(parts.map(toName).filter(Boolean)))
  }

  const one = toName(raw)
  return one ? [one] : []
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
  name: 'EventCard',
  props: {
    event: { type: Object, required: true },
    photos: { type: Array, default: () => [] },
    photosLoading: { type: Boolean, default: false },
    categoryMap: { type: Object, default: () => ({}) },
    isFavorite: { type: Boolean, default: false }
  },
  emits: ['open-photo', 'toggle-favorite'],
  data() {
    return {
      copied: false,
      inView: true,
      activeIndex: 0,
      _raf: null,
      _slideErrors: new Set()
    }
  },
  computed: {
    photoUrls() {
      const list = Array.isArray(this.photos) ? this.photos : []
      return list
        .map((p) => String(p?.photo_url || '').trim())
        .filter(Boolean)
        .filter((_, idx) => !this._slideErrors.has(idx))
    },
    hasPhotos() {
      return this.photoUrls.length > 0
    },
    imageUrl() {
      const first = this.photoUrls?.[0]
      return (first || '').trim()
    },
    categoryNames() {
      return normalizeCategoryNames(this.event?.selectCategory, this.categoryMap)
    },
    formattedDateTime() {
      const v = this.event?.date_time_event
      if (!v) return '—'
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) return String(v)
      return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    },
    formattedPrice() {
      if (!this.event) return '—'
      if (this.event.is_free) return 'Бесплатно'
      const p = Number(this.event.price ?? 0)
      if (!Number.isFinite(p) || p <= 0) return 'Бесплатно'
      return `${p} ₽`
    }
  },
  beforeUnmount() {
    try {
      if (this._raf) cancelAnimationFrame(this._raf)
    } catch {}
  },
  methods: {
    emitOpenPhoto(url) {
      this.$emit('open-photo', url)
    },
    handleOpenPhoto() {
      if (!this.imageUrl) return
      this.emitOpenPhoto(this.imageUrl)
    },
    openEvent() {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
      window.history.pushState({}, '', `${base}event/${this.event.id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    toggleLike() {
      this.$emit('toggle-favorite', { eventId: this.event.id, makeFavorite: !this.isFavorite })
    },
    onSlideError(idx) {
      try {
        this._slideErrors.add(Number(idx))
      } catch {}
    },
    onCarouselScroll() {
      try {
        const el = this.$refs.carouselEl
        if (!el) return

        if (this._raf) cancelAnimationFrame(this._raf)
        this._raf = requestAnimationFrame(() => {
          const w = el.clientWidth || 1
          const i = Math.round(el.scrollLeft / w)
          const clamped = Math.max(0, Math.min(i, this.photoUrls.length - 1))
          this.activeIndex = clamped
        })
      } catch {}
    },
    scrollPrev() {
      const el = this.$refs.carouselEl
      if (!el) return
      const w = el.clientWidth || 1
      el.scrollBy({ left: -w, behavior: 'smooth' })
    },
    scrollNext() {
      const el = this.$refs.carouselEl
      if (!el) return
      const w = el.clientWidth || 1
      el.scrollBy({ left: w, behavior: 'smooth' })
    },
    async shareEvent() {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
      const url = `${window.location.origin}${base}event/${this.event.id}`
      const title = this.event?.title || 'Мероприятие'

      this.copied = false

      // 1) native share (если доступно)
      try {
        if (navigator.share) {
          await navigator.share({ title, url })
          return
        }
      } catch {
        // если share отклонён/не сработал — идём копировать
      }

      // 2) copy with fallback
      const ok = await copyText(url)
      if (ok) {
        this.copied = true
        setTimeout(() => (this.copied = false), 1200)
      } else {
        window.prompt('Скопируй ссылку:', url)
      }
    }
  }
}
</script>

<style scoped>
.card,
.info,
.title,
.desc,
.meta,
.meta-item,
.v {
  min-width: 0;
}

.card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid #efefef;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  cursor: pointer;
}

.photo {
  width: 100%;
  height: 500px;
  overflow: hidden;
  background: white;
  border: none;
  position: relative;
  padding: 0;
}

.photo-skeleton {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
}

.photo-carousel {
  width: 100%;
  height: 100%;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.photo-carousel::-webkit-scrollbar {
  display: none;
}
.slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  scroll-snap-align: start;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.slide img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
}

.arrows {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.arrow {
  pointer-events: auto;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 42px;
  height: 42px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 24px;
  font-weight: 900;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}
.arrow.left {
  left: 10px;
}
.arrow.right {
  right: 10px;
}
@media (min-width: 900px) {
  .photo:hover .arrow {
    display: inline-flex;
  }
}

.photo-badge {
  position: absolute;
  left: 10px;
  top: 10px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(6px);
}

.dots {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(6px);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
}
.dot.on {
  background: rgba(255, 255, 255, 1);
}

.like {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(6px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.like span {
  font-size: 18px;
}

.shimmer {
  position: relative;
  overflow: hidden;
}
.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}

.info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}
.top-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.title {
  flex: 1 1 auto;
  font-size: 18px;
  font-weight: 900;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.2;
}

.right-actions {
  display: flex;
  gap: 8px;
}

.share {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  border: 1px solid #efefef;
  background: #fafafa;
  cursor: pointer;
  font-size: 16px;
}
.share:hover {
  background: #f0f0f0;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow: hidden;
}
.badge {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(138, 117, 227, 0.12);
  border: 1px solid rgba(138, 117, 227, 0.22);
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
}

.desc {
  margin: 0;
  font-size: 14px;
  opacity: 0.85;
  line-height: 1.35;
  text-indent: 1.2em;
  white-space: pre-line;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  overflow: hidden;
}
.meta-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
  overflow: hidden;
}
.k {
  width: 18px;
  flex: 0 0 18px;
}
.v {
  overflow-wrap: anywhere;
  word-break: break-word;
  opacity: 0.9;
}
.price {
  font-weight: 900;
}

.copied {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 900;
  color: #2e7d32;
}

@media (max-width: 760px) {
  .photo {
    height: 260px;
  }
  .meta {
    grid-template-columns: 1fr;
  }
  .arrow {
    display: none !important;
  }
}
</style>
