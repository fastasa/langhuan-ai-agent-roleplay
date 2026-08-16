<template>
  <div class="app-stepper">
    <div class="app-stepper__steps" role="tablist" aria-label="步骤">
      <template v-for="(step, index) in steps" :key="step.key">
        <button
          type="button"
          class="app-stepper__indicator"
          :class="getIndicatorClass(index)"
          :disabled="disableStepIndicators"
          @click="selectStep(index + 1)"
        >
          <span class="app-stepper__indicator-inner">
            <span v-if="index + 1 < currentStep" aria-hidden="true">✓</span>
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="app-stepper__label">{{ step.label }}</span>
        </button>
        <span
          v-if="index < steps.length - 1"
          class="app-stepper__connector"
          :class="{ complete: index + 1 < currentStep }"
          aria-hidden="true"
        />
      </template>
    </div>

    <Transition :name="transitionName" mode="out-in">
      <section :key="activeStep?.key || currentStep" class="app-stepper__content">
        <slot :name="activeStep?.key" :step="currentStep" />
      </section>
    </Transition>

    <div v-if="!hideFooter" class="app-stepper__footer">
      <button
        v-if="currentStep > 1"
        type="button"
        class="app-stepper__button app-stepper__button--ghost"
        @click="goBack"
      >
        {{ backText }}
      </button>
      <button
        type="button"
        class="app-stepper__button app-stepper__button--primary"
        :disabled="nextDisabled"
        @click="goNext"
      >
        {{ isLastStep ? completeText : nextText }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface AppStepperStep {
  key: string
  label: string
}

const props = withDefaults(defineProps<{
  steps: AppStepperStep[]
  modelValue?: number
  initialStep?: number
  backText?: string
  nextText?: string
  completeText?: string
  nextDisabled?: boolean
  disableStepIndicators?: boolean
  hideFooter?: boolean
}>(), {
  modelValue: undefined,
  initialStep: 1,
  backText: '上一步',
  nextText: '下一步',
  completeText: '完成',
  nextDisabled: false,
  disableStepIndicators: false,
  hideFooter: false
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  stepChange: [value: number]
  complete: []
}>()

const internalStep = ref(clampStep(props.modelValue ?? props.initialStep))
const direction = ref(1)

const currentStep = computed(() => clampStep(props.modelValue ?? internalStep.value))
const activeStep = computed(() => props.steps[currentStep.value - 1])
const isLastStep = computed(() => currentStep.value === props.steps.length)
const transitionName = computed(() => direction.value >= 0 ? 'app-stepper-forward' : 'app-stepper-backward')

watch(() => props.modelValue, (value) => {
  if (value === undefined) return
  internalStep.value = clampStep(value)
})

function clampStep(step: number) {
  const total = Math.max(1, props.steps.length)
  const next = Math.floor(Number(step) || 1)
  return Math.min(total, Math.max(1, next))
}

function updateStep(step: number) {
  const next = clampStep(step)
  internalStep.value = next
  emit('update:modelValue', next)
  emit('stepChange', next)
}

function goBack() {
  if (currentStep.value <= 1) return
  direction.value = -1
  updateStep(currentStep.value - 1)
}

function goNext() {
  direction.value = 1
  if (isLastStep.value) {
    emit('complete')
    return
  }
  updateStep(currentStep.value + 1)
}

function selectStep(step: number) {
  if (props.disableStepIndicators || step === currentStep.value) return
  direction.value = step > currentStep.value ? 1 : -1
  updateStep(step)
}

function getIndicatorClass(index: number) {
  const step = index + 1
  return {
    active: step === currentStep.value,
    complete: step < currentStep.value,
    inactive: step > currentStep.value
  }
}
</script>

<style scoped>
.app-stepper {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

.app-stepper__steps {
  display: flex;
  align-items: center;
  width: 100%;
}

.app-stepper__indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--morandi-text-light);
  font: inherit;
  cursor: pointer;
}

.app-stepper__indicator:disabled {
  cursor: default;
}

.app-stepper__indicator-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 1px solid var(--morandi-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-card) 86%, transparent);
  color: var(--morandi-text-light);
  font-size: 13px;
  font-weight: 700;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.app-stepper__indicator.active .app-stepper__indicator-inner,
.app-stepper__indicator.complete .app-stepper__indicator-inner {
  border-color: rgba(125, 109, 92, 0.5);
  background: #7d6d5c;
  color: #fffaf2;
}

.app-stepper__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.app-stepper__connector {
  height: 1px;
  flex: 1 1 24px;
  margin: 0 10px;
  background: rgba(122, 105, 85, 0.18);
  position: relative;
  overflow: hidden;
}

.app-stepper__connector::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 0;
  background: rgba(125, 109, 92, 0.72);
  transition: width 0.2s ease;
}

.app-stepper__connector.complete::after {
  width: 100%;
}

.app-stepper__content {
  min-height: 120px;
}

.app-stepper__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--morandi-border);
  padding-top: 14px;
}

.app-stepper__button {
  height: 32px;
  border-radius: 7px;
  padding: 0 14px;
  font: inherit;
  cursor: pointer;
}

.app-stepper__button--ghost {
  border: 1px solid var(--morandi-border);
  background: transparent;
  color: var(--morandi-text-light);
}

.app-stepper__button--primary {
  border: 1px solid rgba(125, 109, 92, 0.45);
  background: #7d6d5c;
  color: #fffaf2;
}

.app-stepper__button:disabled {
  cursor: default;
  opacity: 0.45;
}

.app-stepper-forward-enter-active,
.app-stepper-forward-leave-active,
.app-stepper-backward-enter-active,
.app-stepper-backward-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.app-stepper-forward-enter-from {
  opacity: 0;
  transform: translateX(18px);
}

.app-stepper-forward-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.app-stepper-backward-enter-from {
  opacity: 0;
  transform: translateX(-18px);
}

.app-stepper-backward-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
