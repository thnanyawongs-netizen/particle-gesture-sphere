# 粒子手势交互技术说明

这份文档解释这个“摄像头背景 + 粒子球 + 手势交互”项目是怎么工作的，也说明别人拿到仓库后如何直接运行、理解和继续修改。

## 一句话概述

这是一个运行在浏览器里的实时交互页面：

- 浏览器用摄像头采集真人画面
- MediaPipe 识别手部关键点
- Three.js 用大量粒子渲染一个发光球体
- 手势结果驱动粒子的炸开、回收、旋转和跟随

核心文件：

- `index.html`
- `main.js`
- `styles.css`

## 技术栈

这个效果主要由 3 层技术组成：

1. 浏览器摄像头
   - 使用 `navigator.mediaDevices.getUserMedia`
   - 负责获取实时视频流

2. 手势识别
   - 使用 `MediaPipe Tasks Vision` 的 `HandLandmarker`
   - 实时输出手部 21 个关键点
   - 用这些关键点判断：
     - 张开手掌
     - 握拳
     - 食指是否伸出
     - 食指是否向左滑动

3. 粒子渲染
   - 使用 `Three.js`
   - 用 `THREE.Points` 和 `PointsMaterial` 渲染大量发光粒子
   - 粒子球不是贴图，而是一堆独立粒子实时计算后绘制出来

## 当前交互定义

当前页面里，手势和效果的对应关系是：

- 张开手掌：粒子球整体炸开
- 握拳：粒子重新回到球体，并且球会跟着拳头位置移动
- 食指滑动：球体会跟着旋转
- 食指向左快速甩动：球体会触发一整圈旋转

## 系统工作流

完整链路如下：

1. 页面加载
2. 点击“启动球体”
3. 浏览器申请摄像头权限
4. 摄像头视频流作为整页背景显示
5. MediaPipe 每帧识别手部关键点
6. 代码把关键点转换成手势状态
7. Three.js 在 `requestAnimationFrame` 中更新粒子位置
8. 渲染出新的球体、炸开、回收和旋转效果

可以把它理解成：

`摄像头 -> 手关键点 -> 手势判定 -> 更新粒子状态 -> WebGL 重绘`

## 代码结构说明

### 页面结构

HTML 里主要有这几层：

- 摄像头视频背景：`video.camera-background`
- Three.js 渲染层：`canvas.scene`
- 手部骨架调试层：`canvas.hand-overlay`
- 启动 UI 和状态文案

### 粒子数据

脚本里维护了几组核心数组：

- `positions`
  - 当前粒子位置
- `baseTargets`
  - 球体收拢时的目标位置
- `velocities`
  - 粒子速度
- `driftVectors`
  - 粒子表面轻微漂浮方向
- `explodeVectors`
  - 炸开时的方向
- `colors`
  - 粒子颜色

这些数组都用于每帧更新粒子状态。

### 粒子球生成

球体不是随机堆出来的，而是通过接近均匀分布的方法生成：

- 使用 `fibonacciSphere(...)`
- 再经过轻微扰动，形成更自然的球面

当前实现里，球体已经做过一次优化：

- 球更小
- 表面起伏更低
- 轮廓更圆、更干净

### 动画更新

页面不是“检测到手势就瞬移变形”，而是使用平滑动画：

- `targetExplosion` / `currentExplosion`
- `targetSpinX/Y` / `currentSpinX/Y`
- `targetSpinVelocityX/Y` / `currentSpinVelocityX/Y`
- `targetFieldX/Y` / `currentFieldX/Y`

这样做的好处是：

- 炸开更顺
- 回球更顺
- 旋转有惯性
- 球体跟拳头移动不会硬跳

## 为什么看起来“有手感”

关键不是只有手势识别，而是后面的“状态缓动”。

页面里大量使用了这种思路：

- 先算目标值
- 再在每一帧逐步逼近目标值
- 同时加入速度衰减和阻尼

所以你看到的不是瞬间跳变，而是：

- 惯性
- 回弹
- 延迟跟随
- 阻尼减速

这也是前端实时交互看起来高级的关键。

## 本地运行方式

在项目目录里启动静态服务器，例如：

```bash
python3 -m http.server 4010
```

然后打开：

```text
http://localhost:4010
```

## 建议浏览器

优先建议：

- Google Chrome

不建议依赖：

- 某些内嵌浏览器
- 对摄像头支持不稳定的 WebView

## 权限要求

要正常运行，这个页面至少需要：

- 浏览器支持 `getUserMedia`
- 页面运行在可访问摄像头的上下文里
- 浏览器已经允许摄像头权限

如果打不开摄像头，优先检查：

1. 当前是不是 Chrome
2. 地址是不是 `localhost` 或 HTTPS 页面
3. 浏览器是否已允许 Camera
4. 相机是否被其他软件占用

## 当前效果的关键参数

下面这些参数最影响视觉效果：

- `PARTICLE_COUNT`
  - 粒子数量
- `mainMaterial.size`
  - 主粒子尺寸
- `glowMaterial.size`
  - 发光外层尺寸
- `glowMaterial.opacity`
  - 发光层强度
- `targetExplosion`
  - 炸开程度
- `targetFieldX/Y`
  - 球体跟拳头移动的位置
- `targetOrbitTurnY`
  - 食指左甩触发的一整圈旋转

如果想改风格，通常先改这些。

## 适合继续优化的方向

- 把粒子球进一步做成更像地球的体积感
- 增加更强的拖尾和辉光
- 增加更多局部手势扰动
- 引入更高级的 shader 粒子材质

这版不是走“科学地球仪”路线，而是走：

- 高亮白粒子
- 明显发光
- 摄像头真人背景
- 中间悬浮球体
- 强手势反馈

所以它更接近：

- 装置艺术感
- 实时交互 demo
- AI / 展览 / 新媒体视觉

而不是传统 3D 地球组件。

## 如果别人要继续迭代，推荐方向

### 视觉方向

- 让球体更圆、更规整
- 做更强的 bloom 和拖尾
- 给球体加南北极、明暗分区
- 让球看起来更像“发光地球”而不是纯白点云

### 交互方向

- 双手控制缩放
- 双手拉开时触发更大的爆炸
- 拳头抓住球体后拖动位置
- 食指滑动改成更强的旋转反馈

### 工程方向

- 把手势识别逻辑拆成单独模块
- 把粒子模拟逻辑拆成单独模块
- 用 shader / GPGPU 提升更高粒子数的性能

## 适合分享给别人的说明话术

可以直接把下面这段发给别人：

> 这是一个基于浏览器摄像头、MediaPipe Hands 和 Three.js 粒子系统做的实时交互页面。摄像头视频作为背景，手势识别用于控制一个高亮粒子球：张开手掌时粒子炸开，握拳时粒子回球并跟随拳头，食指滑动可以带动球体旋转，向左甩动可触发一整圈旋转。页面核心文件是 `particle-gesture-demo.html / .js / .css`，直接用本地静态服务器跑在 `localhost` 下即可。建议用 Chrome。

## 文件定位

最终要看的文件就是这几个：

- [/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/particle-gesture-tech.md](/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/particle-gesture-tech.md)
- [/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/personal-site/particle-gesture-demo.html](/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/personal-site/particle-gesture-demo.html)
- [/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/personal-site/particle-gesture-demo.js](/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/personal-site/particle-gesture-demo.js)
- [/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/personal-site/particle-gesture-demo.css](/Users/ai/Documents/Codex/2026-04-22-github-codex-telegram/personal-site/particle-gesture-demo.css)
