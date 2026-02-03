<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <button class="close" @click="$emit('close')">✕</button>
      <img class="img" :src="url" alt="event photo" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'EventPhotoModal',
  props: {
    url: { type: String, required: true }
  },
  emits: ['close']
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: grid;
  place-items: center;
  z-index: 20000;
}

.modal {
  width: min(980px, calc(100vw - 40px));
  height: min(680px, calc(100vh - 40px));
  background: #000;
  border-radius: 18px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
}

.close {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  cursor: pointer;
  background: rgba(255,255,255,0.12);
  color: #fff;
  font-size: 16px;
  z-index: 2;
}

.img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
</style>
