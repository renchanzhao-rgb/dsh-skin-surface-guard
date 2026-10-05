/**
 * 给 dsh-skin-surface-guard 的 client.js 跑离线逻辑测试。
 *
 * 用一个极小的假浏览器环境把 client.js 真正 import 进来、真正调 apply()，
 * 然后断言：碰撞场景被打标记、健康皮肤不被误伤、逐面处理方式正确、清理彻底。
 *
 * 这不是替代真机验证 —— 它验的是**判定与接线逻辑**，验不了 CSS 在真实
 * 层叠里是否胜出。但它能抓掉绝大多数实现级 bug。
 *
 * 跑法：node test.mjs
 */

const CLIENT_URL = './client.js'

/* ------------------------------------------------------------------ 假 DOM */

/** 记录注入的 <style> 标签。 */
const styleTags = []

/**
 * 造一个最小元素。
 *
 * @param tag - 标签名。
 * @param attrs - 初始属性（名 → 值）。
 * @returns 假元素。
 */
function makeElement(tag, attrs = {}) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    dataset: {},
    textContent: '',
    firstElementChild: null,
    _attrs: new Map(Object.entries(attrs)),
    setAttribute(name, value) {
      el._attrs.set(name, String(value))
    },
    getAttribute(name) {
      return el._attrs.has(name) ? el._attrs.get(name) : null
    },
    hasAttribute(name) {
      return el._attrs.has(name)
    },
    removeAttribute(name) {
      el._attrs.delete(name)
    },
    remove() {
      const i = styleTags.indexOf(el)
      if (i !== -1) styleTags.splice(i, 1)
    },
    matches() {
      return false
    },
    querySelector() {
      return null
    },
  }
  return el
}

/**
 * 在假环境里建一个场景并跑一次 apply()。
 *
 * @param options - 场景参数；各面背景为 null 表示该面不存在。
 * @returns 场景结果。
 */
async function runScenario({ queueDockBg, goalBarBg, cardBg }) {
  styleTags.length = 0

  const head = makeElement('head')
  const body = makeElement('body')

  let queueHost = null
  let queuePanel = null
  if (queueDockBg !== null) {
    queueHost = makeElement('div', { 'data-queue-dock': '' })
    queuePanel = makeElement('div')
    queueHost.firstElementChild = queuePanel
    queueHost.querySelector = (sel) => (sel === ':scope > *' ? queuePanel : null)
  }

  let goalHost = null
  if (goalBarBg !== null) {
    goalHost = makeElement('div', { 'data-goal-bar': '' })
  }

  const card = cardBg === null ? null : makeElement('div', { 'data-composer-card': '' })

  /** 计算样式：元素 → 伪元素 → 声明。 */
  const styles = new Map()
  if (queuePanel !== null) styles.set(queuePanel, { '::before': { backgroundColor: queueDockBg } })
  if (goalHost !== null) styles.set(goalHost, { '::before': { backgroundColor: goalBarBg } })
  if (card !== null) styles.set(card, { '': { backgroundColor: cardBg } })

  const document = {
    head,
    body,
    documentElement: makeElement('html'),
    createElement: (tag) => {
      const el = makeElement(tag)
      if (tag === 'style') styleTags.push(el)
      return el
    },
    querySelector(selector) {
      if (selector === '[data-composer-card]') return card
      if (selector.startsWith('style[data-plugin-css=')) {
        return styleTags.find((t) => t.dataset.pluginCss !== undefined) ?? null
      }
      return null
    },
    querySelectorAll(selector) {
      if (selector === '[data-queue-dock]') return queueHost === null ? [] : [queueHost]
      if (selector === '[data-goal-bar]') return goalHost === null ? [] : [goalHost]
      if (selector === '[data-composer-card]') return card === null ? [] : [card]
      // 清理用的宿主全集
      if (selector === '[data-queue-dock], [data-goal-bar]') {
        return [queueHost, goalHost].filter((x) => x !== null)
      }
      return []
    },
  }
  head.appendChild = (el) => {
    if (!styleTags.includes(el)) styleTags.push(el)
  }

  globalThis.document = document
  globalThis.getComputedStyle = (el, pseudo) => (styles.get(el) ?? {})[pseudo ?? ''] ?? { backgroundColor: '' }
  // 观察器无需真的工作：apply 内部会先主动 schedule 一次。
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
  // rAF 立刻执行，让扫描同步发生（真实代码里它是每帧最多一次）。
  globalThis.requestAnimationFrame = (cb) => {
    cb()
    return 1
  }
  globalThis.cancelAnimationFrame = () => {}

  let captured = null
  globalThis.window = {
    __ModuleLoader__: { load(entry) { captured = entry } },
  }

  await import(`${CLIENT_URL}?case=${Math.random()}`)
  if (captured === null) throw new Error('client.js 没有调用 window.__ModuleLoader__.load')
  if (captured.id !== 'dsh-skin-surface-guard') throw new Error(`模块 id 不是包名：${captured.id}`)

  const mod = captured.factory()
  if (typeof mod.apply !== 'function') throw new Error('factory 返回值缺少 apply')

  let dispose = null
  mod.apply({ effect: (fn) => { dispose = fn() } })

  const result = {
    queueMarked: queueHost === null ? null : queueHost.getAttribute('data-dsh-sg'),
    goalMarked: goalHost === null ? null : goalHost.getAttribute('data-dsh-sg'),
    styleInjected: styleTags.length > 0,
    css: styleTags.length > 0 ? styleTags[0].textContent : '',
  }

  if (typeof dispose === 'function') dispose()
  result.queueMarkedAfterDispose = queueHost === null ? null : queueHost.getAttribute('data-dsh-sg')
  result.goalMarkedAfterDispose = goalHost === null ? null : goalHost.getAttribute('data-dsh-sg')
  result.styleTagsAfterDispose = styleTags.length

  return result
}

/* ------------------------------------------------------------------ 断言 */

const XP_LIGHT = 'rgb(236, 233, 216)' // #ece9d8
const XP_DARK = 'rgb(32, 34, 39)' // #202227

const cases = [
  {
    name: 'XP 亮色：队列条不透明且与输入框同色 → 命中',
    input: { queueDockBg: XP_LIGHT, goalBarBg: null, cardBg: XP_LIGHT },
    expect: { queueMarked: 'queue-dock' },
  },
  {
    name: 'XP 暗色：队列条同色 → 命中',
    input: { queueDockBg: XP_DARK, goalBarBg: null, cardBg: XP_DARK },
    expect: { queueMarked: 'queue-dock' },
  },
  {
    name: '目标条同色 → 命中',
    input: { queueDockBg: null, goalBarBg: XP_LIGHT, cardBg: XP_LIGHT },
    expect: { goalMarked: 'goal-bar' },
  },
  {
    name: '两个面同时同色 → 都命中',
    input: { queueDockBg: XP_LIGHT, goalBarBg: XP_LIGHT, cardBg: XP_LIGHT },
    expect: { queueMarked: 'queue-dock', goalMarked: 'goal-bar' },
  },
  {
    name: '健康皮肤 blue-fantasy：半透明浮层（0.94）→ 放过',
    input: {
      queueDockBg: 'rgba(243, 245, 251, 0.94)',
      goalBarBg: 'rgba(243, 245, 251, 0.94)',
      cardBg: 'rgb(255,255,255)',
    },
    expect: { queueMarked: null, goalMarked: null },
  },
  {
    name: '官方默认 darwin：半透明浮层（0.94）→ 放过',
    input: { queueDockBg: 'rgba(248, 249, 250, 0.94)', goalBarBg: null, cardBg: 'rgb(255,255,255)' },
    expect: { queueMarked: null },
  },
  {
    name: '不透明但明显不同色 → 放过',
    input: { queueDockBg: 'rgb(200, 200, 200)', goalBarBg: null, cardBg: XP_LIGHT },
    expect: { queueMarked: null },
  },
  {
    name: '阈值内（距离约 12）→ 命中',
    input: { queueDockBg: XP_LIGHT, goalBarBg: null, cardBg: 'rgb(240, 237, 220)' },
    expect: { queueMarked: 'queue-dock' },
  },
  {
    name: '阈值外（距离约 29）→ 放过',
    input: { queueDockBg: XP_LIGHT, goalBarBg: null, cardBg: 'rgb(250, 247, 230)' },
    expect: { queueMarked: null },
  },
  {
    name: '队列空（元素不存在）→ 不崩、不标记',
    input: { queueDockBg: null, goalBarBg: null, cardBg: XP_LIGHT },
    expect: { queueMarked: null, goalMarked: null },
  },
  {
    name: '没有输入框对照面 → 不误判',
    input: { queueDockBg: XP_LIGHT, goalBarBg: XP_LIGHT, cardBg: null },
    expect: { queueMarked: null, goalMarked: null },
  },
]

let passed = 0
const failures = []

for (const testCase of cases) {
  let result
  try {
    result = await runScenario(testCase.input)
  } catch (error) {
    failures.push(`${testCase.name}\n    抛错: ${error.message}`)
    console.log(`  ✗ ${testCase.name}\n      抛错: ${error.message}`)
    continue
  }

  const problems = []
  for (const [key, want] of Object.entries(testCase.expect)) {
    if (result[key] !== want) {
      problems.push(`${key}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(result[key])}`)
    }
  }
  if (!result.styleInjected) problems.push('样式标签没注入')
  if (result.styleTagsAfterDispose !== 0) problems.push(`清理后残留 ${result.styleTagsAfterDispose} 个样式标签`)
  if (result.queueMarkedAfterDispose !== null) problems.push('清理后队列条标记没摘掉')
  if (result.goalMarkedAfterDispose !== null) problems.push('清理后目标条标记没摘掉')

  if (problems.length === 0) {
    passed++
    console.log(`  ✓ ${testCase.name}`)
  } else {
    failures.push(`${testCase.name}\n      ${problems.join('\n      ')}`)
    console.log(`  ✗ ${testCase.name}`)
    for (const p of problems) console.log(`      ${p}`)
  }
}

/* --------------------------------------- 结构性断言：逐面处理方式是否正确 */

console.log('\n=== 样式生成的结构断言 ===')
const probe = await runScenario({ queueDockBg: XP_LIGHT, goalBarBg: XP_LIGHT, cardBg: XP_LIGHT })
const css = probe.css
const struct = [
  [
    '队列条走 border 杠杆（:after 上的 border-color）',
    /\[data-queue-dock\]\[data-dsh-sg="queue-dock"\] > \*::after[^}]*border-color/.test(css),
  ],
  [
    '目标条走 elevation 杠杆（--dsw-elevation-stroke-color）',
    /\[data-goal-bar\]\[data-dsh-sg="goal-bar"\]\s*\{[^}]*--dsw-elevation-stroke-color/.test(css),
  ],
  ['目标条没被套上圆角（几何与队列条相反）', !/\[data-goal-bar\]\[data-dsh-sg="goal-bar"\][^}]*border-radius/.test(css)],
  [
    '队列条有上圆角',
    /\[data-queue-dock\]\[data-dsh-sg="queue-dock"\] > \* \{[^}]*border-radius: var\(--dsw-radius-lg/.test(css),
  ],
  ['两个面都还原了 --dsw-specific-menu', (css.match(/--dsw-specific-menu:/g) ?? []).length === 2],
  ['描边都用 color-mix(currentColor) 派生', (css.match(/color-mix\(in srgb, currentColor/g) ?? []).length === 2],
]
let structOk = 0
for (const [label, ok] of struct) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (ok) structOk++
  else failures.push(`结构断言失败：${label}`)
}

console.log(`\n结果：逻辑 ${passed}/${cases.length} 通过，结构 ${structOk}/${struct.length} 通过`)
if (failures.length > 0) {
  console.log('\n失败详情：')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
