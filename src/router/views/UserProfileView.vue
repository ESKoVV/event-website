<template>
  <div class="up-page">
    <div class="up-card" v-if="loading">Загрузка профиля…</div>

    <div v-else-if="error" class="up-card up-error">{{ error }}</div>

    <div v-else-if="!profile" class="up-card">Пользователь не найден.</div>

    <div v-else class="up-card">
      <div class="up-head">
        <div class="up-avatar">
          <img v-if="profile.image_path" :src="profile.image_path" alt="avatar" />
          <span v-else>{{ initial }}</span>
        </div>

        <div class="up-main">
          <h1 class="up-name">{{ displayName(profile) }}</h1>
          <div class="up-sub">@{{ profile.username || 'без username' }}</div>
          <div class="up-sub">Общих друзей: {{ mutualFriendsCount }}</div>
          <div class="up-tags">
            <span class="tag" :class="profile?.It_business ? 'biz' : 'plain'">
              {{ profile?.It_business ? 'Business' : 'Пользователь' }}
            </span>
            <span v-if="profile.description" class="tag soft">{{ profile.description }}</span>
          </div>
        </div>
      </div>

      <div class="up-actions">
        <button class="btn" @click="openChat" v-if="!isMe">Написать</button>
        <button class="btn ghost" @click="toggleFriend" v-if="!isMe">{{ friendBtnText }}</button>
        <button class="btn ghost" v-if="isBusinessProfile" @click="goMyEvents">
          Мероприятия
        </button>
      </div>

      <div class="up-block">
        <div class="up-title">О пользователе</div>
        <div class="up-field" v-if="profile.first_name || profile.last_name">Имя: {{ displayName(profile) }}</div>
        <div class="up-field" v-if="profile.gender">Пол: {{ profile.gender }}</div>
        <div class="up-field" v-if="profile.birth_day">Дата рождения: {{ profile.birth_day }}</div>
        <div class="up-field" v-if="profile.phone">Телефон: {{ profile.phone }}</div>
        <div class="up-field" v-if="profile.email">Email: {{ profile.email }}</div>
      </div>

      <div class="up-block" v-if="isMe">
        <div class="up-title">Мероприятия в профиле</div>
        <p v-if="isBusinessProfile" class="up-sub">Вы можете добавлять мероприятия и управлять ими.</p>
        <p v-else class="up-sub">Добавлять мероприятия могут только бизнес аккаунты.</p>
      </div>

      <div class="up-block">
        <div class="up-title">Друзья ({{ friends.length }})</div>
        <div v-if="friends.length === 0" class="up-sub">Пока нет друзей</div>
        <div v-else class="up-friends">
          <button class="friend" v-for="f in friends" :key="f.id" @click="goProfile(f.id)">
            <span>{{ displayName(f) }}</span>
            <small>@{{ f.username || '—' }}</small>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '@/composables/useSupabase'

export default {
  name: 'UserProfileView',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { getUser, getPublicUserById, getFriendships, getAcceptedFriendsOf, sendFriendRequest, removeFriendOrRequest, acceptFriendRequest } = useSupabase()

    const loading = ref(false)
    const error = ref('')
    const myId = ref('')
    const profile = ref(null)
    const friends = ref([])
    const relation = ref('none')
    const mutualFriendsCount = ref(0)

    const isMe = computed(() => String(profile.value?.id || '') === String(myId.value || ''))
    const isBusinessProfile = computed(() => profile.value?.It_business === true)
    const initial = computed(() => (displayName(profile.value)[0] || 'П').toUpperCase())

    const displayName = (u) => {
      const full = `${String(u?.first_name || '').trim()} ${String(u?.last_name || '').trim()}`.trim()
      return full || u?.email || 'Пользователь'
    }

    const buildRelationIndex = (rows = []) => {
      const idx = new Map()
      for (const f of rows) {
        const isRequesterMe = f.requester_id === myId.value
        const otherId = isRequesterMe ? f.addressee_id : f.requester_id
        if (!otherId) continue
        if (f.status === 'accepted') idx.set(otherId, 'friend')
        else if (f.status === 'pending') idx.set(otherId, isRequesterMe ? 'outgoing' : 'incoming')
      }
      return idx
    }

    const load = async () => {
      loading.value = true
      error.value = ''
      try {
        const targetId = String(route.params.id || '').trim()
        const { user } = await getUser()
        myId.value = user?.id || ''

        const { data: p } = await getPublicUserById(targetId)
        profile.value = p
        if (!p?.id) return

        const { data: friendIds } = await getAcceptedFriendsOf(targetId)
        const friendUsers = await Promise.all(friendIds.map(async (id) => (await getPublicUserById(id)).data))
        friends.value = friendUsers.filter((x) => x?.id)

        if (myId.value) {
          const { data: rows } = await getFriendships()
          const idx = buildRelationIndex(rows || [])
          relation.value = idx.get(targetId) || 'none'

          const myFriends = new Set([...idx.entries()].filter((x) => x[1] === 'friend').map((x) => x[0]))
          let common = 0
          for (const fid of friendIds) if (myFriends.has(fid)) common += 1
          mutualFriendsCount.value = common
        }
      } catch (e) {
        error.value = String(e?.message || e)
      } finally {
        loading.value = false
      }
    }

    const friendBtnText = computed(() => {
      if (relation.value === 'friend') return 'Удалить из друзей'
      if (relation.value === 'incoming') return 'Принять заявку'
      if (relation.value === 'outgoing') return 'Заявка отправлена'
      return 'Добавить в друзья'
    })

    const toggleFriend = async () => {
      const uid = profile.value?.id
      if (!uid) return
      if (relation.value === 'incoming') await acceptFriendRequest(uid)
      else if (relation.value === 'friend' || relation.value === 'outgoing') await removeFriendOrRequest(uid)
      else await sendFriendRequest(uid)
      await load()
    }

    const openChat = () => router.push({ name: 'messages', query: { with: profile.value?.id } })
    const goProfile = (id) => router.push({ name: 'user-profile', params: { id } })
    const goMyEvents = () => router.push({ name: 'my-events' })

    watch(() => route.params.id, load)
    onMounted(load)

    return {
      loading,
      error,
      profile,
      friends,
      mutualFriendsCount,
      friendBtnText,
      isMe,
      isBusinessProfile,
      initial,
      displayName,
      toggleFriend,
      openChat,
      goProfile,
      goMyEvents
    }
  }
}
</script>

<style scoped>
.up-page{max-width:980px;margin:0 auto;padding:20px}
.up-card{background:linear-gradient(180deg,#fff,#fcfbff);border-radius:18px;padding:18px;border:1px solid rgba(138,117,227,.18);box-shadow:0 14px 38px rgba(75,49,153,.08)}
.up-head{display:flex;gap:14px;align-items:center}
.up-main{min-width:0}
.up-avatar{width:88px;height:88px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#8a75e3,#2f2752);display:grid;place-items:center;color:#fff;font-weight:900;font-size:28px}
.up-avatar img{width:100%;height:100%;object-fit:cover}
.up-name{margin:0}
.up-sub{opacity:.75}
.up-tags{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.tag{padding:5px 10px;border-radius:999px;font-size:12px;font-weight:800}
.tag.biz{background:rgba(59,130,246,.13);color:#1d4ed8}
.tag.plain{background:rgba(15,23,42,.08)}
.tag.soft{background:rgba(138,117,227,.11);color:#4c3d8f}
.up-actions{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}
.btn{border:0;border-radius:12px;padding:10px 14px;background:#8A75E3;color:#fff;font-weight:800;cursor:pointer}
.ghost{background:#f2efff;color:#3a3174}
.up-block{margin-top:16px}.up-title{font-weight:900;margin-bottom:8px}.up-friends{display:grid;gap:8px}
.friend{text-align:left;border:1px solid #ece7ff;border-radius:12px;padding:10px;background:#fff}
.up-error{color:#b00020}
</style>
