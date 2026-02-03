<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="top">
        <h3 class="title">Обрезка аватара</h3>
        <button class="x" @click="$emit('close')">✕</button>
      </div>

      <div class="crop-area" ref="box">
        <canvas ref="canvas" class="canvas"></canvas>
        <div class="circle-mask"></div>
      </div>

      <div class="controls">
        <div class="row">
          <span class="lbl">Зум</span>
          <input type="range" min="1" max="3" step="0.01" v-model.number="zoom" />
        </div>
      </div>

      <div class="btns">
        <button class="btn" @click="confirm">Готово</button>
        <button class="btn secondary" @click="$emit('close')">Отмена</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export default {
  name: 'AvatarCropModal',
  emits: ['close', 'done'],
  props: {
    file: { type: File, required: true },
    size: { type: Number, default: 360 }, // размер превью
    output: { type: Number, default: 512 } // итоговое изображение
  },
  setup(props, { emit }) {
    const canvas = ref(null)
    const box = ref(null)

    const img = new Image()
    const objectUrl = ref('')
    const zoom = ref(1.2)

    // смещение картинки
    const offsetX = ref(0)
    const offsetY = ref(0)

    let isDragging = false
    let startX = 0
    let startY = 0

    const draw = () => {
      const c = canvas.value
      if (!c) return
      const ctx = c.getContext('2d')

      const w = props.size
      const h = props.size
      c.width = w
      c.height = h

      ctx.clearRect(0, 0, w, h)

      // базовый scale, чтобы картинка покрывала квадрат
      const baseScale = Math.max(w / img.width, h / img.height)
      const scale = baseScale * zoom.value

      const dw = img.width * scale
      const dh = img.height * scale

      const cx = w / 2 + offsetX.value
      const cy = h / 2 + offsetY.value

      const dx = cx - dw / 2
      const dy = cy - dh / 2

      ctx.drawImage(img, dx, dy, dw, dh)
    }

    const onDown = (e) => {
      isDragging = true
      const p = e.touches ? e.touches[0] : e
      startX = p.clientX
      startY = p.clientY
    }

    const onMove = (e) => {
      if (!isDragging) return
      const p = e.touches ? e.touches[0] : e
      const dx = p.clientX - startX
      const dy = p.clientY - startY
      startX = p.clientX
      startY = p.clientY
      offsetX.value += dx
      offsetY.value += dy
      draw()
    }

    const onUp = () => {
      isDragging = false
    }

    const confirm = async () => {
      // делаем итоговый output x output
      const out = document.createElement('canvas')
      out.width = props.output
      out.height = props.output
      const octx = out.getContext('2d')

      // рисуем так же как preview, но в другом размере
      const w = props.output
      const h = props.output

      const baseScale = Math.max(w / img.width, h / img.height)
      const scale = baseScale * zoom.value

      const dw = img.width * scale
      const dh = img.height * scale

      const cx = w / 2 + (offsetX.value * (w / props.size))
      const cy = h / 2 + (offsetY.value * (h / props.size))

      const dx = cx - dw / 2
      const dy = cy - dh / 2

      octx.drawImage(img, dx, dy, dw, dh)

      const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png', 0.92))
      if (!blob) return

      const file = new File([blob], 'avatar.png', { type: 'image/png' })
      emit('done', file)
    }

    watch(zoom, () => draw())

    onMounted(() => {
      objectUrl.value = URL.createObjectURL(props.file)
      img.onload = () => draw()
      img.src = objectUrl.value

      const target = box.value
      target.addEventListener('mousedown', onDown)
      target.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)

      target.addEventListener('touchstart', onDown, { passive: true })
      target.addEventListener('touchmove', onMove, { passive: true })
      window.addEventListener('touchend', onUp)
    })

    onBeforeUnmount(() => {
      if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
      const target = box.value
      if (target) {
        target.removeEventListener('mousedown', onDown)
        target.removeEventListener('mousemove', onMove)
        target.removeEventListener('touchstart', onDown)
        target.removeEventListener('touchmove', onMove)
      }
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    })

    return { canvas, box, zoom, confirm }
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal {
  width: 520px;
  max-width: calc(100vw - 40px);
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 10px 30px rgba(0,0,0,.2);
}

.top { display:flex; align-items:center; justify-content:space-between; }
.title { margin: 0; }
.x { border:none; background:transparent; cursor:pointer; font-size:18px; opacity:.7; }

.crop-area {
  width: 360px;
  height: 360px;
  margin: 14px auto 10px;
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #f5f5f5;
  touch-action: none;
}

.canvas { width: 100%; height: 100%; display:block; }

.circle-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* затемнение + круг в центре */
  background:
    radial-gradient(circle at center,
      transparent 0 45%,
      rgba(0,0,0,.45) 46% 100%);
}

.controls { margin-top: 10px; }
.row { display:flex; align-items:center; gap: 10px; }
.lbl { width: 50px; opacity: .7; font-size: 13px; }
input[type="range"] { flex: 1; }

.btns { display:flex; gap: 10px; margin-top: 14px; }
.btn {
  flex: 1;
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  background: #8A75E3;
  color: #fff;
  font-weight: 700;
}
.secondary { background: #efefef; color: #14181B; }
</style>
