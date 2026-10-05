/**
 * 皮肤表面守卫 —— client half。
 *
 * ## 它防的是什么
 *
 * 皮肤可以重映射官方的 `--dsw-*` 设计 token。有一类改法会**抹掉"浮层"与
 * "它所浮于其上的面"之间的视觉分离**，于是浮层在视觉上融进底下的面 ——
 * 元素在、文字在，但用户看不出那是一个独立的层。
 *
 * 已确认的实例（`xp` 皮肤）：它把**唯一的浮层底色 token**写成不透明，
 * 而该值恰好等于它用 `!important` 强制给输入框卡片的颜色：
 *
 *   --dsw-specific-menu: #ece9d8      （官方是 #f8f9faf0，带 alpha 的半透明）
 *   [data-composer-card] { background: #ece9d8 !important }
 *
 * `--dsw-specific-menu` 不是单个组件的 token —— 它是**整个浮层家族**的底色，
 * 被 12 个以上组件消费（队列条、目标条、任务菜单、调度弹层、子代理菜单、
 * cordis 面板、agent-team 面板…），背景层一律是
 * `::before { background: var(--dsw-specific-menu) }`。
 *
 * 再叠上被压碎的边框 token，浮层连描边也一起消失：
 *
 *   --dsw-alias-border-l1 … -l4                 （压到 6% / 8% 的 alpha）
 *   --dsw-elevation-stroke-color: var(--dsw-alias-border-l3)
 *   --dsw-elevation-stroke:       0 0 0 .5px var(--dsw-elevation-stroke-color)
 *   --dsw-elevation-panel:        var(--dsw-elevation-stroke), 0 3px 8px …
 *
 * ## 它怎么做
 *
 * **面注册表驱动**：每个条目声明一个浮层面、它浮于其上的对照面、以及这个面
 * 自己的官方几何。检测到碰撞时只给**这一个面**打标记，样式全部挂在标记下 ——
 * 健康皮肤零影响；条件消失（换回正常皮肤）时标记自动摘掉。
 *
 * 处理分三层，**逐面声明**（不是一刀切，因为各面的官方几何并不相同）：
 *
 *   1. **还原浮层底色**：把 `--dsw-specific-menu` 就地还原成半透明的
 *      `var(--dsw-menu-surface-fill)`。自定义属性按 DOM 就近继承，设在浮层宿主上
 *      就能覆盖 `:root`、`body` 的写入，**不必跟皮肤比特异性**。
 *   2. **还原描边**：两条不同的杠杆，由条目声明用哪条 ——
 *      `border`（如队列条，`:after` 上的真边框）或 `elevation`（如目标条，
 *      `box-shadow: var(--dsw-elevation-panel)` 里的那圈 `.5px` 环）。
 *      两者都改用 `currentColor` 派生：currentColor 就是该皮肤自己设定的文字色，
 *      天然与它自己的底色成对比，不依赖任何可能被改坏的 token。
 *   3. **还原圆角**（仅在条目声明时）：皮肤的 `* { border-radius: 0 !important }`
 *      会抹掉浮层的轮廓线索。**各面圆角不同** —— 队列条是"上圆下直"以贴住输入框，
 *      目标条是全圆角 —— 所以由条目各自声明，不猜。
 *
 * ## 加一个面
 *
 * 往 `SURFACES` 里加一条即可。`host` / `peer` 一律用契约里的稳定钩子
 * （`data-*` 属性、`role`），**不要用哈希类名**。
 *
 * @module dsh-skin-surface-guard/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-skin-surface-guard',

  factory() {
    /** 样式标签身份，同时是 HMR 重载时的去重键。 */
    const STYLE_ID = 'dsh-skin-surface-guard/surface-guard.css'

    /** 打在浮层宿主上的标记属性；值是该面的 id。 */
    const MARK = 'data-dsh-sg'

    /**
     * 面注册表。
     *
     * - `id`      唯一标识，同时是标记属性的值。
     * - `host`    浮层宿主选择器。标记打在这里，`--dsw-specific-menu` 也在这里
     *             还原（其子树里的背景层因此继承到新值）。
     * - `surface` 相对 host 的浮层本体后缀（默认 `''` = host 自身）。底色、描边、
     *             圆角都作用在它上面。
     * - `layer`   背景层所在的伪元素（官方一律是 `::before`）。
     * - `peer`    对照面选择器：读它的背景色与浮层比较。
     * - `radius`  **可选**。该面自己的官方圆角；不声明就不动圆角。
     * - `edge`    **可选**。`'border'` | `'elevation'`；不声明就不补描边。
     */
    const SURFACES = [
      {
        // 用户真机上报并已修复验证：XP 皮肤下队列条与输入框卡片融成一块。
        id: 'queue-dock',
        host: '[data-queue-dock]',
        surface: ' > *',
        layer: '::before',
        peer: '[data-composer-card]',
        // 官方 dock：border-radius: var(--dsw-radius-lg) var(--dsw-radius-lg) 0 0
        // —— 上圆下直，贴住输入框。与目标条不同，故必须逐面声明。
        radius: 'var(--dsw-radius-lg, 16px) var(--dsw-radius-lg, 16px) 0 0',
        // 官方 dock 的边来自 :after 上的真 border（.5px solid var(--dsw-alias-border-l1)）。
        edge: 'border',
      },
      {
        // 结构推断，非用户上报：同一个 dock 插槽（order 10）、同一个底色 token、
        // 同一个对照面。几何与队列条不同，所以只还原底色与描边，不动圆角。
        id: 'goal-bar',
        host: '[data-goal-bar]',
        surface: '',
        layer: '::before',
        peer: '[data-composer-card]',
        // 官方 goal bar 是 border-radius: var(--dsw-radius-md) —— 全圆角，
        // 与队列条相反，故**不声明** radius。
        // 它的边来自 box-shadow: var(--dsw-elevation-panel)，所以走 elevation 杠杆。
        edge: 'elevation',
      },
    ]

    /**
     * 判定阈值。
     *
     * `MAX_RGB_DISTANCE`：0–441 的 RGB 欧氏距离。24 大致是"同色系肉眼刚能分辨"
     * 的量级 —— 宽到能抓住"看起来是同一块"，严到不会误伤刻意做相近色的皮肤。
     *
     * `MIN_ALPHA`：浮层背景的最小不透明度。官方浮层是 0.94；只有不透明的浮层才
     * 可能与底下同色的面融成一块，半透明的天然分得开。
     */
    const MAX_RGB_DISTANCE = 24
    const MIN_ALPHA = 0.95

    /** 描边回退值：中性半透明灰。`color-mix` 不被支持时用它。 */
    const EDGE_FALLBACK = 'rgba(128, 128, 128, 0.45)'
    /** 由文字色派生的描边：与任何底色都成对比，不依赖可能被改坏的 token。 */
    const EDGE_MIX = 'color-mix(in srgb, currentColor 26%, transparent)'
    /** 浮层底色回退值：皮肤连 --dsw-menu-surface-fill 也改坏时用。 */
    const FILL_FALLBACK = 'rgba(128, 128, 128, 0.35)'

    /** 全部宿主选择器，用于观察过滤与清理。 */
    const HOST_SELECTOR = SURFACES.map((entry) => entry.host).join(', ')
    /** 观察目标 = 宿主 ∪ 对照面。 */
    const WATCHED = `${HOST_SELECTOR}, ${[...new Set(SURFACES.map((entry) => entry.peer))].join(', ')}`

    /**
     * 由注册表生成样式。表与样式同源，改表即改样式。
     *
     * @returns 注入用的 CSS 文本。
     */
    function buildCss() {
      const blocks = []
      for (const entry of SURFACES) {
        const marked = `${entry.host}[${MARK}="${entry.id}"]`
        const body = `${marked}${entry.surface}`

        // 1. 还原浮层底色（就近继承，覆盖祖先的写入，无需比特异性）。
        blocks.push(`${marked} {\n  --dsw-specific-menu: var(--dsw-menu-surface-fill, ${FILL_FALLBACK});\n}`)

        // 2. 还原描边 —— 两条杠杆，逐面声明。
        if (entry.edge === 'border') {
          blocks.push(
            `${body}::after {\n` +
              `  border-color: ${EDGE_FALLBACK} !important;\n` +
              `  border-color: ${EDGE_MIX} !important;\n}`,
          )
        } else if (entry.edge === 'elevation') {
          blocks.push(
            `${body} {\n` +
              `  --dsw-elevation-stroke-color: ${EDGE_FALLBACK} !important;\n` +
              `  --dsw-elevation-stroke-color: ${EDGE_MIX} !important;\n}`,
          )
        }

        // 3. 还原圆角（仅在条目声明时）。!important 压过皮肤的
        //    `* { border-radius: 0 !important }`：两条都 important 时特异性高的胜出。
        //    用 typeof 判断而不是 `!== null`：条目省略该字段时是 undefined，
        //    `undefined !== null` 为真，会生成 `border-radius: undefined` 这种非法声明。
        if (typeof entry.radius === 'string' && entry.radius.length > 0) {
          blocks.push(`${body} {\n  border-radius: ${entry.radius} !important;\n}`)
        }
      }
      return `/* dsh surface guard —— 仅在标记命中时生效 */\n${blocks.join('\n\n')}\n`
    }

    /**
     * 解析 `getComputedStyle` 给出的 `rgb()` / `rgba()` 字符串。
     *
     * @param value - 计算样式里的颜色字符串。
     * @returns 分量与 alpha；无法解析时为 `null`。
     */
    function parseColor(value) {
      const match = /^rgba?\(([^)]+)\)$/.exec(String(value).trim())
      if (match === null) return null
      const parts = match[1].split(/[\s,/]+/).filter((part) => part.length > 0)
      if (parts.length < 3) return null
      const [r, g, b] = parts.slice(0, 3).map(Number)
      const a = parts.length > 3 ? Number(parts[3]) : 1
      if (![r, g, b, a].every(Number.isFinite)) return null
      return { r, g, b, a }
    }

    /**
     * 两个颜色在 RGB 空间的欧氏距离。
     *
     * @param left - 第一个颜色。
     * @param right - 第二个颜色。
     * @returns 0–441 的距离；越小越像。
     */
    function colorDistance(left, right) {
      return Math.sqrt((left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2)
    }

    /**
     * 取某个条目的浮层本体元素。
     *
     * @param entry - 注册表条目。
     * @param host - 该条的宿主元素。
     * @returns 本体元素；不存在时为 `null`。
     */
    function surfaceOf(entry, host) {
      if (entry.surface === '') return host
      return host.querySelector(`:scope ${entry.surface.trim()}`)
    }

    /**
     * 判断一个浮层面是否被皮肤"掩盖"了：背景**不透明**且与对照面**同色**。
     *
     * @param entry - 注册表条目。
     * @param host - 该条的宿主元素。
     * @param peer - 对照面元素。
     * @returns 需要打标记时为 `true`。
     */
    function isCamouflaged(entry, host, peer) {
      const surface = surfaceOf(entry, host)
      if (surface === null) return false
      const own = parseColor(getComputedStyle(surface, entry.layer).backgroundColor)
      const under = parseColor(getComputedStyle(peer).backgroundColor)
      if (own === null || under === null) return false
      // 半透明浮层本来就与底下的面分得开，不用管。
      if (own.a < MIN_ALPHA) return false
      return colorDistance(own, under) <= MAX_RGB_DISTANCE
    }

    /** 最近一次扫描的发现，供外部检查（`window.__dshSurfaceGuard.report`）。 */
    const report = { scannedAt: 0, findings: [] }

    /**
     * 重新评估每个注册面，按需加上或摘掉标记。
     *
     * 幂等：条件消失时标记被摘掉，样式随之失效。
     */
    function scan() {
      const findings = []
      for (const entry of SURFACES) {
        const peers = document.querySelectorAll(entry.peer)
        const peer = peers.length > 0 ? peers[0] : null
        for (const host of document.querySelectorAll(entry.host)) {
          const shouldMark = peer !== null && isCamouflaged(entry, host, peer)
          const marked = host.getAttribute(MARK) === entry.id
          if (shouldMark && !marked) host.setAttribute(MARK, entry.id)
          else if (!shouldMark && marked) host.removeAttribute(MARK)
          if (shouldMark) findings.push({ surface: entry.id, peer: entry.peer })
        }
      }
      report.scannedAt = Date.now()
      report.findings = findings
    }

    return {
      /**
       * 注册守卫。样式标签、两个观察器与待执行的扫描都归属到本插件的 effect，
       * 卸载或 HMR 重载时由同一份清理函数整体撤销。
       *
       * @param ctx - 客户端 Cordis 上下文。
       */
      apply(ctx) {
        ctx.effect(() => {
          // ---- 样式 --------------------------------------------------------
          // 与官方包同一套注册方式：带 data-plugin-css 身份标签的 <style>。
          // 重载时先复用已存在的那一个，避免堆出多份规则。
          let styleTag = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)
          if (styleTag === null) {
            styleTag = document.createElement('style')
            styleTag.dataset.plugin = 'dsh-skin-surface-guard'
            styleTag.dataset.pluginCss = STYLE_ID
            styleTag.textContent = buildCss()
            document.head.appendChild(styleTag)
          }

          // ---- 扫描调度 ----------------------------------------------------
          // 观察器在流式输出期间会频繁触发，所以用 rAF 合并：每帧最多一次。
          let frame = null
          const schedule = () => {
            if (frame !== null) return
            frame = requestAnimationFrame(() => {
              frame = null
              scan()
            })
          }

          /** 一次 DOM 变更是否碰到了我们关心的节点（宿主或对照面）。 */
          const touches = (node) =>
            node.nodeType === 1 && (node.matches(WATCHED) || node.querySelector(WATCHED) !== null)

          // ① 浮层与对照面随状态出现 / 消失。回调里先过滤变更记录 ——
          //    否则流式输出期间的每一批 DOM 变更都会换来一次强制样式重算。
          const domObserver = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.addedNodes) if (touches(node)) return schedule()
              for (const node of record.removedNodes) if (touches(node)) return schedule()
            }
          })
          domObserver.observe(document.documentElement, { childList: true, subtree: true })

          // ② 换皮肤 / 切深浅色只改 html、body 上的属性，不动 DOM 结构 —— 单独盯这些。
          //    data-dsh-backdrop-active 与 data-dsh-skin-center 会改变输入框附近的着色。
          const skinObserver = new MutationObserver(schedule)
          const onHtml = [
            'data-dsh-skin',
            'data-ds-dark-theme',
            'data-platform',
            'data-dsh-backdrop-active',
            'data-dsh-skin-center',
          ]
          skinObserver.observe(document.documentElement, { attributes: true, attributeFilter: onHtml })
          skinObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-dsh-backdrop-active', 'data-dsh-skin-center'],
          })

          // 供检查：DevTools 里读 window.__dshSurfaceGuard。
          const previous = window.__dshSurfaceGuard
          window.__dshSurfaceGuard = { report, surfaces: SURFACES.map((entry) => entry.id) }

          schedule()

          // ---- 清理 --------------------------------------------------------
          return () => {
            domObserver.disconnect()
            skinObserver.disconnect()
            if (frame !== null) cancelAnimationFrame(frame)
            for (const host of document.querySelectorAll(HOST_SELECTOR)) host.removeAttribute(MARK)
            styleTag.remove()
            if (previous === undefined) delete window.__dshSurfaceGuard
            else window.__dshSurfaceGuard = previous
          }
        })
      },
    }
  },
})
