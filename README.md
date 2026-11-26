# 余光 AFTERGLOW New

艺术家晚宴的 3D 站立版。梵高和达利默认在场，可以邀请欧姬芙和莫奈。点击「听他们聊」开启对谈，或直接说话、打字。提到「星空」或「睡莲」可以进入画中，退出后收进回忆。每幅画有一张回忆卡片，展开可查看各次对话。

- [打开 New 站立版](https://xianyun790-afk.github.io/artist-dinner-game-New/)
- [原版艺术家晚宴](https://xianyun790-afk.github.io/artist-dinner-game/)

站立版默认使用英文，可点左上角「中文」切换，也可用 `?lang=zh` 直接打开中文版。在线版包含预录台词、作品讲解和本地剧本。即兴台词的朗读与麦克风识别取决于浏览器和设备。打开麦克风需要授权，也可随时改用打字。回忆保存在当前浏览器。

## 本地运行

需要 Node.js 24。运行 `npm ci` 和 `npm run dev`，打开终端显示的地址。运行 `npm test` 检查，或用 `npm run build` 和 `npm run preview` 预览生产构建。附加 `?version=dinner` 可以查看餐桌场景。

如需接入 NIA 与音色服务，按 `.env.example` 设置本机服务地址，在服务端用 `.env.server.local` 配置密钥，并运行 `npm run dialogue`。GitHub Pages 构建使用静态前端和内置剧本。

## 夜间露天咖啡座

在站立版用文字或语音对梵高说「我想走入你的生活场景」，即可进入咖啡座。点「返回对话」并确认即可回到对话。如果在咖啡座熄过灯，梵高回来后会聊刚才的街景。也可启动本地开发服务后直接打开 `/cafe.html`。咖啡座在手机上直接以横屏显示。点街上的荧光点可以向前走，拖动或用方向键可以环顾四周，灯光按钮切换壁灯。贴图和改编说明见 [画作记录](public/artworks/cafe-terrace/SOURCE.md)。

## 欧姬芙的世界

邀请欧姬芙后，可以说「我想看看你的世界」，或问「你平时怎么创作」。如果提到一幅具体画作，例如《蓝色与绿色音乐》，会优先打开作品讲解。入场影片开始播放时，步道在后台载入。入场页和探索画面都可以点「返回对话」，确认后继续原来的对话。手机上用左下角摇杆移动，拖动画面环顾。

本地开发默认使用 `http://127.0.0.1:4189/`。GitHub Pages 将 `worlds/okeeffe` 的入场页和版本化的 Unity WebGL 构建一起发布到 `/okeeffe/`。Unity 项目通过 `TrailWebBuild.BuildForPages` 输出 `Builds/AfterglowWeb`。更新 Unity 时，把该目录下的 `index.html` 与 `Build/` 打包为新版本的 GitHub Release 附件，并更新 Pages 工作流里的版本和 SHA-256。独立部署时可用 `VITE_OKEEFFE_WORLD_URL` 指定入场页。

## 画作来源

梵高、莫奈和欧姬芙的作品出处见 [来源记录](public/artworks/SOURCES.md) 与 [欧姬芙来源记录](public/artworks/GEORGIA-SOURCE.md)。《记忆的永恒》图片从 [MoMA 馆藏](https://www.moma.org/collection/works/79018) 加载。角色与对白为艺术家人设演绎。
