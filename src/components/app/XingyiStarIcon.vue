<template>
  <!-- 星依状态星的最小图形原语：五角像素星体 + 三根等粗、长短不一的放射光线。
       颜色仍由使用方附加的 xy-star--{status} 状态类统一提供；本组件暂不处理显隐、换色或动效。 -->
  <svg class="xingyi-star-icon" viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true">
    <g class="xingyi-star-icon__rays">
      <path class="xingyi-star-icon__ray xingyi-star-icon__ray--short" d="M16 7 14 3" />
      <path class="xingyi-star-icon__ray xingyi-star-icon__ray--medium" d="m28 13 6-4" />
      <path class="xingyi-star-icon__ray xingyi-star-icon__ray--long" d="m29 27 8 5" />
    </g>
    <g class="xingyi-star-icon__core">
      <polygon class="xingyi-star-icon__fill" points="20,9 23,16 31,17 25,23 27,31 20,27 13,31 15,23 9,17 17,16" />
      <polygon class="xingyi-star-icon__outline" points="20,9 23,16 31,17 25,23 27,31 20,27 13,31 15,23 9,17 17,16" />
    </g>
  </svg>
</template>

<style scoped>
.xingyi-star-icon {
  overflow: visible;
}

.xingyi-star-icon__fill {
  fill: currentColor;
  fill-opacity: 0;
  transition: fill-opacity 0.3s;
}

.xingyi-star-icon__outline,
.xingyi-star-icon__ray {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: butt;
  stroke-linejoin: miter;
}

.xingyi-star-icon__core,
.xingyi-star-icon__ray {
  transform-box: view-box;
  transform-origin: 20px 20px;
}
</style>
