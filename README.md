# Live Weather · 表情天气实验室

浏览器直播 AR 原型。微笑持续时产生雨幕，持续张嘴触发一次烟花。向左右移动头部时，烟花会被随人脸移动的轮廓推开。

## 体验

1. 打开 [GitHub Pages 公开预览](https://ycm0704.github.io/live-weather-ar/) 并允许使用摄像头。
2. 正脸入镜，先自然放松约半秒。试试持续微笑、恢复自然表情、持续张嘴，再移动头部。
3. 在手机界面可以点赞、关注、发表评论和送出模拟礼物。
4. 勾选「显示碰撞轮廓」观察轮廓位置与诊断区的碰撞计数。摄像头关闭时，也可以按按钮预览雨幕和烟花，移动指针或触摸拖动模拟头部。

只请求视频权限。帧在设备内完成推理和渲染，页面不上传或保存图像。首次开启时会下载同源模型与 WebAssembly 运行库。

## 本地运行

项目无需构建。在仓库根目录执行以下命令。

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
node --test tests/demo.test.mjs
```

用浏览器打开 [本地预览](http://127.0.0.1:8765/)。部署时将 `dist/` 作为 HTTPS 站点根目录。

## 实现

| 文件 | 职责 |
| --- | --- |
| `dist/app.mjs` | 摄像头生命周期、单帧在途调度、显示与诊断 |
| `dist/live-room.mjs` | 模拟观众、滚动评论、爱心和礼物连击 |
| `dist/tracking-worker.js`、`dist/tracker.mjs` | MediaPipe Face Landmarker 模型、Worker CPU 推理与兼容模式 |
| `dist/expressions.mjs` | 微笑／张口系数、平滑与持续门槛、单次触发锁和镜像裁切坐标 |
| `dist/physics.mjs`、`dist/effects.mjs` | 移动椭圆扫掠碰撞、反射速度、雨幕和烟花渲染 |

推理输入最长边为 320 像素，Worker 最多约 15 次每秒且同一时刻仅处理一帧。兼容路径依据实际推理耗时降低采样频率。Canvas 按显示尺寸渲染，DPR 上限 1.5，烟花粒子池上限 180。切换到后台时暂停推理和渲染。

## Vibecoding 复盘

最容易漏掉的性能陷阱是高速火花一帧内穿过头部。逐帧只测当前位置会漏判，盲目加密子步也增加开销。我改用粒子与移动椭圆的相对运动求首次交点，再按法线反射速度。纠偏 Prompt：「写一个高速粒子一帧穿过头部的用例。用扫掠碰撞保证反弹，禁止靠提高更新频率补漏。」

## 第三方依赖

MediaPipe Tasks Vision 0.10.21 的浏览器运行库随站点提供，许可文本位于 `dist/vendor/mediapipe/LICENSE`。模型来自 Google AI Edge 推荐的 Face Landmarker float16 版本 1。 [MediaPipe Web 文档](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) · [运行库](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21) · [模型下载](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
