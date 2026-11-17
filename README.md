# Live Weather · 表情天气实验室

浏览器直播 AR 原型。微笑时产生雨幕，大笑触发一轮烟花；烟花错开绽放与消散，并响应头部移动。

## 体验

1. 打开 [GitHub Pages 公开预览](https://ycm0704.github.io/live-weather-ar/) 并允许使用摄像头。
2. 正脸入镜，先自然放松约半秒。试试微笑、大笑，再移动头部。
3. 在手机界面可以点赞、关注、发表评论和送出模拟礼物。
4. 手机竖屏打开时，直播间会铺满浏览器画面。点击摄像头按钮开始体验。

只请求视频权限。帧在设备内完成推理和渲染，页面不上传或保存图像。首次开启时会下载同源模型与 WebAssembly 运行库。

## 本地运行

项目无需构建。在仓库根目录执行以下命令。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

用浏览器打开 [本地预览](http://127.0.0.1:8765/)。该仓库根目录即为 GitHub Pages 站点根目录。

## 实现

| 文件 | 职责 |
| --- | --- |
| `app.mjs` | 摄像头生命周期、表情识别与特效调度 |
| `live-room.mjs` | 模拟观众、滚动评论、爱心和礼物连击 |
| `tracking-worker.js`、`tracker.mjs` | MediaPipe Face Landmarker 及兼容模式 |
| `expressions.mjs` | 微笑识别、大笑触发和人脸坐标 |
| `effects.mjs`、`firework-composition.js` | 雨幕、烟花和头部互动渲染 |

推理和渲染在浏览器本机进行，切换到后台时暂停。

## Vibecoding 复盘

最容易漏掉的性能陷阱是高速火花一帧内穿过头部。逐帧只测当前位置会漏判，盲目加密子步也增加开销。我改用粒子与移动椭圆的相对运动求首次交点，再按法线反射速度。纠偏 Prompt：「写一个高速粒子一帧穿过头部的用例。用扫掠碰撞保证反弹，禁止靠提高更新频率补漏。」

## 第三方依赖

MediaPipe Tasks Vision 0.10.21 的浏览器运行库随站点提供，许可文本位于 `dist/vendor/mediapipe/LICENSE`。模型来自 Google AI Edge 推荐的 Face Landmarker float16 版本 1。 [MediaPipe Web 文档](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) · [运行库](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21) · [模型下载](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
