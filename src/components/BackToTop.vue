<template>
  <Transition name="back-top">
    <button v-if="visible" class="back-to-top" :class="{ 'on-torrents': view === 'torrents' }" aria-label="回到顶部" @click="backToTop"><ArrowUp /></button>
  </Transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowUp } from '@lucide/vue';
const props = defineProps({ view: String });
const scrollY = ref(0);
const visible = computed(() => ['cards', 'torrents', 'tasks', 'logs'].includes(props.view) && scrollY.value > 400);
function update() { scrollY.value = window.scrollY; }
function backToTop() {
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
watch(() => props.view, update);
onMounted(() => { update(); window.addEventListener('scroll', update, { passive: true }); });
onUnmounted(() => window.removeEventListener('scroll', update));
</script>
