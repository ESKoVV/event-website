<template>
  <div class="pimg" :style="wrapStyle">
    <!-- низкое качество (быстрое) -->
    <img
      v-if="thumbSrc"
      class="pimg-thumb"
      :class="{ hide: fullLoaded }"
      :src="thumbSrc"
      :alt="alt"
      loading="eager"
      decoding="async"
      draggable="false"
    />

    <!-- полное качество -->
    <img
      class="pimg-full"
      :class="{ show: fullLoaded }"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @load="onFullLoad"
      @error="onFullError"
      draggable="false"
    />

    <!-- если вдруг нет thumb — показываем легкий скелет -->
    <div v-if="!thumbSrc && !fullLoaded" class="pimg-skeleton"></div>
  </div>
</template>

<script>
const thumbCache = new Map() // src -> thumbSrc

const isDataUrl = (u) => typeof u === 'string' && u.startsWith('data:image')
const isSupabasePublicObjectUrl = (u) =>
  typeof u === 'string' && u.includes('/storage/v1/object/public/')

/**
 * Supabase render endpoint:
 * .../storage/v1/render/image/public/<bucket>/<path>?width=...&quality=...
 * Работает если у тебя включены image transformations на проекте.
 */
const buildSupabaseThumbUrl = (publicObjectUrl, width = 48, quality = 20) => {
  try {
    const u = new URL(publicObjectUrl, window.location.origin)
    const marker = '/storage/v1/object/public/'
    const idx = u.pathname.indexOf(marker)
    if (idx === -1) return ''
    const rest = u.pathname.slice(idx + marker.length) // bucket/path...
    const renderPath = `/storage/v1/render/image/public/${rest}`
    const out = new URL(u.origin + renderPath)
    out.searchParams.set('width', String(width))
    out.searchParams.set('quality', String(quality))
    // можно добавить resize=cover/contain если нужно:
    // out.searchParams.set('resize', 'contain')
    return out.toString()
  } catch {
    return ''
  }
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/**
 * Делает маленькую JPEG-миниатюру из data:image.
 * Важно: работает быстро и не требует network.
 */
const makeDataUrlThumb = async (dataUrl, maxW = 48, quality = 0.35) => {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth || img.width || 1
  const h = img.naturalHeight || img.height || 1
  const scale = Math.min(1, maxW / w)
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(img, 0, 0, tw, th)

  try {
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // fallback — если jpeg не получится
    try {
      return canvas.toDataURL('image/webp', quality)
    } catch {
      return ''
    }
  }
}

export default {
  name: 'ProgressiveImage',
  props: {
    src: { type: String, required: true },
    alt: { type: String, default: '' },
    // contain / cover — чтобы совпадало с твоим дизайном EventCard
    fit: { type: String, default: 'contain' },
    // можно отключить thumb, если нужно
    enableThumb: { type: Boolean, default: true }
  },
  data() {
    return {
      thumbSrc: '',
      fullLoaded: false,
      failed: false
    }
  },
  computed: {
    wrapStyle() {
      return {
        '--fit': this.fit === 'cover' ? 'cover' : 'contain'
      }
    }
  },
  async mounted() {
    const src = String(this.src || '').trim()
    if (!src || !this.enableThumb) return

    // already cached
    if (thumbCache.has(src)) {
      this.thumbSrc = thumbCache.get(src) || ''
      return
    }

    // Supabase render thumb
    if (isSupabasePublicObjectUrl(src)) {
      const t = buildSupabaseThumbUrl(src, 52, 18)
      if (t) {
        this.thumbSrc = t
        thumbCache.set(src, t)
        return
      }
    }

    // data:image -> generate tiny thumb
    if (isDataUrl(src)) {
      try {
        const t = await makeDataUrlThumb(src, 52, 0.33)
        this.thumbSrc = t
        thumbCache.set(src, t)
      } catch {
        this.thumbSrc = ''
      }
    }
  },
  methods: {
    onFullLoad() {
      this.fullLoaded = true
    },
    onFullError() {
      this.failed = true
      // если full упало, то хотя бы thumb покажем
      this.fullLoaded = false
    }
  }
}
</script>

<style scoped>
.pimg {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.pimg-thumb,
.pimg-full {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: var(--fit);
  object-position: center;
  display: block;
}

/* thumb: размытый, слегка увеличенный, быстро даёт картинку вместо белого */
.pimg-thumb {
  filter: blur(14px);
  transform: scale(1.08);
  opacity: 1;
  transition: opacity 160ms ease;
}

/* full: сначала прозрачен, потом плавно появляется */
.pimg-full {
  opacity: 0;
  transition: opacity 180ms ease;
}

.pimg-full.show {
  opacity: 1;
}

.pimg-thumb.hide {
  opacity: 0;
}

.pimg-skeleton {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #f0f0f0, #fafafa, #f0f0f0);
  background-size: 200% 100%;
  animation: sk 1.15s infinite linear;
}

@keyframes sk {
  0% { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}
</style>
