# Particle Gesture Sphere

一个基于 `Three.js + MediaPipe Hands` 的实时手势粒子交互示例。

整页使用摄像头作为背景，中间是一颗高亮白色粒子球：

- 张开手掌：粒子球炸开
- 握拳：粒子回到球体，并跟随拳头位置
- 食指滑动：带动球体旋转
- 食指向左快速甩动：触发球体完整转一圈

## 预览特点

- 摄像头真人背景
- 高密度发光粒子球
- 手势识别驱动粒子状态
- 平滑阻尼、惯性和跟随动画
- 单文件静态部署，无构建步骤

## 技术栈

- `Three.js`
- `MediaPipe Tasks Vision`
- 原生 `WebGL`
- 原生 `getUserMedia`

依赖通过 CDN 加载，不需要安装 npm 包。

## 快速开始

在仓库目录运行一个静态服务器：

```bash
python3 -m http.server 4010
```

然后在 Chrome 打开：

```text
http://localhost:4010
```

第一次进入时允许摄像头权限。

## 文件结构

- `index.html`：页面结构
- `styles.css`：视觉样式
- `main.js`：Three.js 场景、粒子系统、MediaPipe 手势识别和动画逻辑
- `TECH.md`：技术说明与可调参数

## 使用建议

- 建议使用最新版 Chrome
- 本地开发推荐 `localhost`
- 如果部署到线上，请使用 HTTPS，否则浏览器可能不允许相机

## 后续可扩展方向

- 更像地球的体积感和明暗层次
- 更强的粒子拖尾和辉光
- 双手交互
- 基于 shader 的更高级粒子材质
