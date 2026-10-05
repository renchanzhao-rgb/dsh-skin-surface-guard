# dsh-skin-surface-guard

**当皮肤把"浮层"和它下方那个面涂成同一种颜色时，把浮层的底色、描边和圆角还原回来。**

有些皮肤会重映射官方的 `--dsw-*` 设计 token，而有一类改法会**抹掉浮层与底面的视觉
分离** —— 浮层在视觉上融进底下的面。元素在、文字在，但用户看不出那是一个独立的层。

本插件只在这种情况下生效：**先检测碰撞，再给那一个面打标记，样式全部挂在标记下**。
健康皮肤完全不受影响；换回正常皮肤时标记自动摘掉。

---

## 它防的是哪一类皮肤

已确认的实例（`xp` 皮肤，Windows XP Luna）做了三件事：

```css
/* ① 唯一的浮层底色 token 写成不透明，官方是带 alpha 的 #f8f9faf0 */
--dsw-specific-menu: #ece9d8;

/* ② 同一个值又用 !important 强制给输入框卡片 —— 于是浮层与底面同色 */
[data-composer-card] { background: #ece9d8 !important; }

/* ③ 抹掉浮层的轮廓线索 */
* { border-radius: 0 !important; }
--dsw-alias-border-l1: #0000000f;    /* 四级边框 token 全被压到 6% / 8% alpha */
```

结果：agent 工作时排队的消息和输入框**融成一块矩形**，用户看不到它。

### `--dsw-specific-menu` 不是单个组件的 token

它是**整个浮层家族的底色**，被 **12 个以上组件**消费，背景层一律是
`::before { background: var(--dsw-specific-menu) }`：

| 包 | 组件 |
|---|---|
| `dsh-client-ui-conversation` | 队列条、面板 |
| `dsh-client-ui-goal` | 目标条（与队列条同一个 dock 插槽） |
| `dsh-client-ui-chat` | 统计对话框 |
| `dsh-client-ui-jobs` / `-schedule` / `-subagent` / `-input-trigger` | 各类菜单与弹层 |
| `dsh-client-ui-cordis` / `-agent-team` | 面板 |

**所以这一类皮肤破坏的不是一个组件，而是整个浮层家族。**

### 描边有两条不同的杠杆

被压碎的边框 token 会顺着这条链一路传下去：

```css
--dsw-alias-border-l1 … -l4                            /* 被皮肤压碎 */
--dsw-elevation-stroke-color: var(--dsw-alias-border-l3)
--dsw-elevation-stroke:       0 0 0 .5px var(--dsw-elevation-stroke-color)
--dsw-elevation-panel:        var(--dsw-elevation-stroke), 0 3px 8px …
```

但**各浮层用不同的方式画边**，所以处理方式必须逐面声明：

| 面 | 圆角 | 描边 |
|---|---|---|
| 队列条 `[data-queue-dock]` | `radius-lg radius-lg 0 0`（上圆下直，贴住输入框） | `::after` 上的**真 border** |
| 目标条 `[data-goal-bar]` | `radius-md`（**全圆角**） | **`box-shadow: elevation-panel`**（`border: 0`） |

把它们混为一谈会出事：给目标条套上队列条的"上圆角"是错的，给只有 box-shadow 的
目标条设 `border-color` 也不会有效果。

---

## 它是怎么判定的

对注册表里的每个「面 ↔ 对照面」对，**同时**满足两条才打标记：

1. 浮层背景**不透明**（alpha ≥ `0.95`）—— 半透明浮层本来就分得开；
2. 该背景与对照面背景的 **RGB 欧氏距离 ≤ 24** —— 大致是"同色系肉眼刚能分辨"的量级。

阈值与面表都在 `client.js` 顶部。

命中后在**那一个面**上做三件事（逐面声明，不是一刀切）：

| 处理 | 做法 | 为什么这样 |
|---|---|---|
| **还原浮层底色** | 把 `--dsw-specific-menu` 还原成 `var(--dsw-menu-surface-fill)` | 自定义属性按 **DOM 就近继承**，设在浮层宿主上就能覆盖 `:root`/`body` 的写入，**不必跟皮肤比特异性** |
| **还原描边** | 由 `currentColor` 派生（`color-mix(in srgb, currentColor 26%, transparent)`） | `currentColor` 就是该皮肤自己设定的文字色，**天然与它自己的底色成对比**，不依赖任何可能被改坏的 token |
| **还原圆角** | 该面声明的官方圆角，带 `!important` | 压过皮肤的 `* { border-radius: 0 !important }`：两条都 important 时特异性高的胜出 |

---

## 已注册的面

| id | 宿主钩子 | 对照面 | 圆角 | 描边杠杆 | 来源 |
|---|---|---|---|---|---|
| `queue-dock` | `[data-queue-dock]` | `[data-composer-card]` | 上圆下直 | `border` | 真机上报并修复验证 |
| `goal-bar` | `[data-goal-bar]` | `[data-composer-card]` | *不声明* | `elevation` | 结构推断（同插槽、同 token、同对照面） |

### 加一个面

往 `client.js` 的 `SURFACES` 里加一条，跑一遍离线测试即可。字段：

```js
{
  id: 'your-surface',              // 唯一标识，同时是标记属性的值
  host: '[data-your-hook]',        // 宿主：标记打这里，底色也在这里还原
  surface: ' > *',                 // 相对 host 的本体后缀（'' = host 自身）
  layer: '::before',               // 背景层所在的伪元素（官方一律 ::before）
  peer: '[data-composer-card]',    // 对照面
  radius: 'var(--dsw-radius-md)',  // 可选：该面自己的官方圆角；省略则不动圆角
  edge: 'border',                  // 可选：'border' | 'elevation'；省略则不补描边
}
```

**只用契约里的稳定钩子**（`data-*` 属性、`role`），**不要用哈希类名**（`_0TPaqG_*`）。

---

## 文件

| 文件 | 作用 |
|---|---|
| `package.json` | bundle manifest：`dsh.bundle.patch` + `dsh.client`（web，`immediately`） |
| `cordis.patch.yml` | 插入一行 loader 条目 |
| `index.js` | Host half —— 空的 `apply()`，本插件不需要宿主侧任何东西 |
| `client.js` | 全部逻辑：面注册表 → 生成样式 → 碰撞检测 → 观察 → 清理 |

---

## 安装与验证

**从 GitHub 安装**：

```sh
dsh plugin --profile web add github:renchanzhao-rgb/dsh-skin-surface-guard
```

**桌面客户端**：设置 → 插件 → 添加插件，填仓库地址或本地目录的**绝对路径**。

无论哪种方式，装完都要**重启客户端进程**——client 模块由宿主在启动时组进模块图，
刷新页面不够。

**验证**（DevTools Console，若可用）：

```js
// 插件是否加载
!!document.querySelector('style[data-plugin-css$="surface-guard.css"]')

// 哪些面被判成碰撞、已接管
window.__dshSurfaceGuard.report.findings

// 某个面是否被打了标记
document.querySelector('[data-queue-dock]')?.getAttribute('data-dsh-sg')
```

**健康皮肤下应该什么都不发生**：切回「官方默认」或 `blue-fantasy`，
`report.findings` 应为空数组，标记属性应为 `null`。

---

## 已知限制

- **只处理"背景同色"这一种掩盖。** 文字对比度过低、z-index 遮挡、几何错位都不在
  范围内。这是刻意的范围控制。
- **依赖 `data-*` / `role` 钩子。** 官方若改名，对应条目会静默失效（不报错、不破坏别的）。
- **`goal-bar` 是结构推断，不是用户上报。** 它同插槽、同 token、同对照面，所以很可能
  有同样的病；但目标条只在存在 goal 时才渲染，作者未在真机上验证过。
- **不做持久化配置。** 阈值写在源码里；要做界面可调得加宿主侧 Config。
- **还原 `--dsw-specific-menu` 会改变该皮肤的浮层观感。** 对健康皮肤不生效；对命中的
  皮肤，这是修复本身要付的代价（XP 的菜单本来就是实心米色，会被还原成半透明）。

---

## 给皮肤作者的上游修法

如果想让皮肤自己修好，**补上 alpha 通道**即可：

```diff
-  --dsw-specific-menu: #ece9d8;
+  --dsw-specific-menu: #ece9d8f0;
```

```diff
-  --dsw-specific-menu: #202227;
+  --dsw-specific-menu: #202227f0;
```

⚠️ 但市场安装的皮肤带 `dsh-market.provenance.json`（逐文件 sha256），**手改会令
hooks 层被持续拒绝** —— 对 `xp` 就是丢掉标题栏、状态栏、绿色开始按钮和 favicon。
所以这是**上游修复**，用户侧不要手改，应报给皮肤作者。

---

## 开发

```bash
node test.mjs
```

用假 DOM 真 import `client.js` 并调 `apply()`，覆盖 11 个逻辑场景（命中 / 放过 /
阈值边界 / 元素缺失 / 对照面缺失 / 清理彻底性）与 6 条样式生成的结构断言
（逐面的描边杠杆与圆角是否正确）。
