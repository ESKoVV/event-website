import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import EventView from './views/EventView.vue'
import OrganizerView from './views/OrganizerView.vue'
import MyEventsView from './views/MyEventsView.vue'
import MessagesView from './views/MessagesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/event/:id', name: 'event', component: EventView, props: true },
    { path: '/organizer/:id', name: 'organizer', component: OrganizerView, props: true },
    { path: '/my-events', name: 'my-events', component: MyEventsView },

    // ✅ Сообщения
    { path: '/messages', name: 'messages', component: MessagesView }
  ]
})

export default router
