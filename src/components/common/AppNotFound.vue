<template>
  <main class="not-found" aria-labelledby="not-found-title">
    <section class="not-found__card">
      <p class="not-found__eyebrow">404</p>
      <h1 id="not-found-title">这个页面不存在</h1>
      <p>当前版本只提供本地创作工作区。</p>
      <a href="/">返回工作区</a>
    </section>
  </main>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--morandi-text);
  background: var(--morandi-bg);
}

.not-found__card {
  width: min(440px, 100%);
  padding: 32px;
  border: 1px solid var(--morandi-border);
  border-radius: 18px;
  background: var(--morandi-card);
  box-shadow: var(--morandi-shadow);
  text-align: center;
}

.not-found__eyebrow {
  margin: 0 0 8px;
  color: var(--morandi-primary);
  font-weight: 700;
  letter-spacing: 0.14em;
}

h1 {
  margin: 0 0 12px;
}

p {
  color: var(--morandi-text-light);
}

a {
  display: inline-flex;
  margin-top: 12px;
  color: var(--morandi-primary);
  font-weight: 600;
}
</style>
