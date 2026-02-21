<template>
  <div
    ref="cardEl"
    class="card"
    :class="{ compact }"
    role="button"
    tabindex="0"
    @click="openEvent"
    @keydown.enter="openEvent"
    @keydown.space.prevent="openEvent"
  >
    <button ref="photoBtn" class="photo" type="button" @click.stop="handleOpenPhoto" aria-label="Открыть фото">
      <div v-if="!inView || !hasPhotos" class="photo-skeleton" :class="{ shimmer: photosLoading || !inView }"></div>

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
          <ProgressiveImage
            :src="url"
            alt="event photo"
            fit="contain"
            @error="onSlideError(idx)"
          />
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
        :aria-label="isFavorite ? 'Убрать из избранного' : 'Добавить в избранного'"
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
            <button
              v-if="canMessageOrganizer"
              class="share msg-organizer"
              type="button"
              @click.stop="messageOrganizer"
              aria-label="Написать организатору"
              title="Написать"
            >💬</button>
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
import ProgressiveImage from './ProgressiveImage.vue'

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
  components: { ProgressiveImage },
  props: {
    event: { type: Object, required: true },
    photos: { type: Array, default: () => [] },
    photosLoading: { type: Boolean, default: false },
    categoryMap: { type: Object, default: () => ({}) },
    isFavorite: { type: Boolean, default: false },
    canMessageOrganizer: { type: Boolean, default: false },
    compact: { type: Boolean, default: false }
  },
  emits: ['open-photo', 'toggle-favorite', 'need-photos', 'message-organizer'],
  data() {
    return {
      copied: false,
      inView: false,
      activeIndex: 0,
      _raf: null,
      _slideErrors: new Set(),
      _io: null
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
  mounted() {
    try {
      const el = this.$refs.cardEl
      if (!el) {
        this.inView = true
        return
      }

      this._io = new IntersectionObserver(
        (entries) => {
          const e = entries?.[0]
          const visible = !!e?.isIntersecting
          if (visible) {
            this.inView = true
            if (!this.hasPhotos && !this.photosLoading) {
              this.$emit('need-photos', { eventId: this.event?.id })
            }
          }
        },
        { root: null, threshold: 0.01, rootMargin: '700px 0px' }
      )

      this._io.observe(el)
    } catch {
      this.inView = true
    }
  },
  beforeUnmount() {
    try {
      if (this._raf) cancelAnimationFrame(this._raf)
    } catch {}
    try {
      if (this._io) this._io.disconnect()
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
    messageOrganizer() {
      if (!this.event?.user_id) return
      this.$emit('message-organizer', { userId: String(this.event.user_id) })
    },
    async shareEvent() {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
      const url = `${window.location.origin}${base}event/${this.event.id}`
      const title = this.event?.title || 'Мероприятие'

      this.copied = false

      try {
        if (navigator.share) {
          await navigator.share({ title, url })
          return
        }
      } catch {}

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

.card.compact {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.card.compact .photo {
  height: 230px;
}

.card.compact .desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.photo-skeleton {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
}

.photo-skeleton.shimmer {
  background: linear-gradient(90deg, #f0f0f0, #fafafa, #f0f0f0);
  background-size: 200% 100%;
  animation: sk 1.2s infinite linear;
}

@keyframes sk {
  0% { background-position: 0% 0; }
  100% { background-position: 200% 0; }
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
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-weight: 900;
  backdrop-filter: blur(8px);
}

.dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  display: flex;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
}
.dot.on {
  background: rgba(255, 255, 255, 0.95);
}

.like {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 42px;
  height: 42px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(8px);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.like span {
  font-size: 20px;
}
.like span.on {
  transform: scale(1.03);
}

.info {
  display: grid;
  gap: 10px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.title {
  font-weight: 950;
  font-size: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.share {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  border: 1px solid #efefef;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.msg-organizer {
  font-size: 15px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.badge {
  font-size: 12px;
  font-weight: 800;
  padding: 6px 10px;
  border-radius: 999px;
  background: #f3f3f3;
  border: 1px solid #efefef;
}

.desc {
  opacity: 0.85;
  line-height: 1.4;
  margin: 0;
}

.meta {
  display: grid;
  gap: 6px;
}
.meta-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.k {
  width: 20px;
}
.v {
  opacity: 0.85;
}
.price {
  font-weight: 900;
}

.copied {
  font-weight: 900;
  opacity: 0.9;
}
</style>
