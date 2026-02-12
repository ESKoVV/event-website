import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import EventView from './views/EventView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },

    // ✅ ссылка на конкретное мероприятие
    { path: '/event/:id', name: 'event', component: EventView, props: true }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
