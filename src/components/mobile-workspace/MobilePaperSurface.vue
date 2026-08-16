<template>
  <div class="mobile-paper-surface">
    <slot />
  </div>
</template>

<style scoped>
.mobile-paper-surface {
  /* 钉死视口高度：移动壳是固定视口外壳，内部各页面自带 .lhm-scroll 滚动区；
     若改回 min-height 会被内容撑高、超出被祖先 #app(overflow:hidden) 裁切且无法滚动。 */
  height: 100vh;
  height: 100dvh;
  background:
    radial-gradient(circle at 18% 12%, rgba(139, 115, 85, 0.055) 0 1px, transparent 1.6px) 0 0 / 18px 18px,
    linear-gradient(rgba(248, 244, 238, 0.96), rgba(248, 244, 238, 0.96)),
    var(--morandi-bg, #f8f4ee);
  color: var(--morandi-text, #333);
  overflow: hidden;
}

:global([data-theme="dark"]) .mobile-paper-surface {
  background: var(--morandi-bg, #2a2825);
}
</style>
