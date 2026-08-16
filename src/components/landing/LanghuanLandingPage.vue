<template>
  <main class="about-page">
    <nav class="about-nav" aria-label="项目介绍导航">
      <a class="about-brand" href="/about">
        <LanghuanIcon :size="28" title="琅嬛" />
        <span>琅嬛 · 本地开源版</span>
      </a>
      <a class="about-enter" href="/">进入工作台</a>
    </nav>

    <section class="about-hero">
      <p class="about-kicker">LOCAL-FIRST · OPEN SOURCE</p>
      <h1>一座只属于部署者的<br><em>本地叙事工作台。</em></h1>
      <p class="about-lead">
        无需注册或登录。角色、世界资料、对话和设置保存在本机；
        项目不提供管理员后台，也没有作者查看部署者数据的通道。
      </p>
      <div class="about-actions">
        <a class="about-primary" href="/">直接使用</a>
        <a href="#boundaries">查看隐私边界</a>
        <a href="#source">查看源码说明</a>
      </div>
    </section>

    <section id="source" class="about-boundaries">
      <div>
        <p class="about-kicker">SOURCE &amp; LICENSE</p>
        <h2>运行目录就是完整源码包。</h2>
      </div>
      <ul>
        <li>前端、服务端、测试和构建脚本都随发行包提供，没有单独的闭源控制面。</li>
        <li>源码入口与本机部署步骤见仓库根目录 <code>README.md</code>。</li>
        <li><a href="/LICENSE" target="_blank" rel="noreferrer">查看 AGPLv3 完整许可证正文</a></li>
      </ul>
    </section>

    <section class="about-grid" aria-label="主要能力">
      <article>
        <span>01</span>
        <h2>角色与记忆</h2>
        <p>组织角色设定、关系、轨迹与长期记忆，让后续对话能够延续已有经历。</p>
      </article>
      <article>
        <span>02</span>
        <h2>世界资料</h2>
        <p>用世界树整理区域、组织、人物与物品，并把资料带进实际创作流程。</p>
      </article>
      <article>
        <span>03</span>
        <h2>本地数据</h2>
        <p>首发数据库为空。部署者自行创建内容，并可在本地导入、导出和备份。</p>
      </article>
    </section>

    <section id="boundaries" class="about-boundaries">
      <div>
        <p class="about-kicker">PRIVACY BOUNDARIES</p>
        <h2>权限留在本机，边界写在明处。</h2>
      </div>
      <ul>
        <li>仅监听 <code>127.0.0.1</code>，不提供公网部署配置。</li>
        <li>没有账号、登录、注册、邀请、管理员或访客体系。</li>
        <li>没有遥测、作者回传或远程管理通道。</li>
        <li>只有部署者主动配置第三方 AI 或天气服务时，相关请求才会离开本机。</li>
      </ul>
    </section>

    <footer class="about-footer">
      <div>
        <strong>AGPL-3.0-only</strong>
        <p>本发行包随附完整源码与许可证文本。修改后通过网络提供服务时，也应向使用者提供对应源码。</p>
      </div>
      <div class="about-footer-links">
        <a href="/LICENSE" target="_blank" rel="noreferrer">许可证</a>
        <a href="/">返回工作台</a>
      </div>
    </footer>
  </main>
</template>

<script setup lang="ts">
import LanghuanIcon from '../common/LanghuanIcon.vue'
</script>

<style scoped>
.about-page {
  min-height: 100vh;
  overflow: auto;
  background: #f3f0e7;
  color: #25352c;
  font-family: Inter, "Noto Sans SC", system-ui, sans-serif;
}

.about-nav,
.about-hero,
.about-grid,
.about-boundaries,
.about-footer {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
}

.about-nav {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #bec6bc;
}

.about-brand,
.about-enter,
.about-actions a,
.about-footer a {
  color: inherit;
  text-decoration: none;
}

.about-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.about-enter { border-bottom: 1px solid currentColor; padding-bottom: 3px; }

.about-hero { padding: clamp(80px, 12vw, 150px) 0 96px; }
.about-kicker { color: #68796d; font-size: .78rem; font-weight: 700; letter-spacing: .18em; }
.about-hero h1 { margin: 24px 0; max-width: 850px; font-family: "Noto Serif SC", serif; font-size: clamp(3rem, 7vw, 6.8rem); font-weight: 500; line-height: 1.06; }
.about-hero h1 em { color: #627a65; font-style: normal; }
.about-lead { max-width: 680px; font-size: 1.12rem; line-height: 1.9; }
.about-actions { display: flex; gap: 24px; align-items: center; margin-top: 38px; }
.about-actions a { padding: 12px 0; }
.about-actions .about-primary { padding: 13px 26px; border-radius: 999px; background: #2e4035; color: #fff; }

.about-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #bec6bc; border: 1px solid #bec6bc; }
.about-grid article { min-height: 270px; padding: 34px; background: #f8f5ed; }
.about-grid span { color: #829087; font-size: .8rem; }
.about-grid h2 { margin: 48px 0 14px; font-family: "Noto Serif SC", serif; font-size: 1.7rem; }
.about-grid p, .about-footer p { color: #58665d; line-height: 1.8; }

.about-boundaries { display: grid; grid-template-columns: .9fr 1.1fr; gap: 70px; padding: 120px 0; }
.about-boundaries h2 { margin-top: 18px; font-family: "Noto Serif SC", serif; font-size: clamp(2rem, 4vw, 3.7rem); line-height: 1.2; }
.about-boundaries ul { margin: 0; padding: 0; list-style: none; }
.about-boundaries li { padding: 20px 0; border-bottom: 1px solid #c4cbc2; line-height: 1.7; }
.about-boundaries code { padding: 2px 6px; border-radius: 5px; background: #e2e6df; }

.about-footer { display: flex; justify-content: space-between; gap: 40px; padding: 46px 0 70px; border-top: 1px solid #bec6bc; }
.about-footer div { max-width: 680px; }
.about-footer p { margin-bottom: 0; }
.about-footer a { align-self: flex-start; border-bottom: 1px solid currentColor; }
.about-footer-links { display: flex; gap: 22px; }

@media (max-width: 760px) {
  .about-nav, .about-hero, .about-grid, .about-boundaries, .about-footer { width: min(100% - 28px, 1120px); }
  .about-grid, .about-boundaries { grid-template-columns: 1fr; }
  .about-grid article { min-height: 210px; }
  .about-boundaries { gap: 34px; padding: 80px 0; }
  .about-footer { flex-direction: column; }
}
</style>
