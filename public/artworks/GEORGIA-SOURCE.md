# 欧姬芙真实代表作资源来源

获取与核验日期：2026-11-09。

## 版本与接入 metadata

```js
{
  id: 'blue-green-music',
  title: '蓝与绿的音乐',
  englishTitle: 'Blue and Green Music',
  artist: '乔治娅·欧姬芙',
  year: '1919–1921',
  image: '/artworks/georgia-blue-green-music.jpg',
  museum: '芝加哥艺术博物馆',
  sourceUrl: 'https://www.artic.edu/artworks/24306/blue-and-green-music',
  imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Blue_and_Green_Music_by_Georgia_O%27Keeffe,_1921.jpg'
}
```

- 馆藏编号：1969.835；Alfred Stieglitz Collection, gift of Georgia O’Keeffe。
- 作品材料：布面油画。
- 官方资料核对：[Georgia O’Keeffe Museum / Access O’Keeffe, CR No. 344](https://access-ok.okeeffemuseum.org/object/8445/)。该页明确列出 Blue and Green Music、1919–1921、Art Institute of Chicago、馆藏 1969.835，并链接当前收藏机构。
- 当前馆藏页：[Art Institute of Chicago, 24306](https://www.artic.edu/artworks/24306/blue-and-green-music)。本轮自动读取该馆网页／API返回403，因此具体年代以 Access O’Keeffe 官方记录为准；没有声称读取成功。
- 年份说明：Commons旧文件名和信息栏简写为1921；采用官方现行记录的1919–1921，不把文件名当作唯一创作年代。

## 数字图像来源及权利标记

- 图像页：[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Blue_and_Green_Music_by_Georgia_O%27Keeffe,_1921.jpg)。该文件是2009年上传的馆方旧版数字图像。
- 实际下载原文件：https://upload.wikimedia.org/wikipedia/commons/8/84/Blue_and_Green_Music_by_Georgia_O%27Keeffe%2C_1921.jpg
- Commons记录的原图来源：http://www.artic.edu/aic/collections/citi/images/standard/WebLarge/WebImg_000080/4162_672427.jpg （仅作来源记录，本轮未依赖旧URL下载）。
- Commons 文件页许可区明确标记 **PD-US / Public domain in the United States**，依据美国作品首次发表日期／版权期限条件。该页同时明确提醒：在不采用美国作品较短期限规则的部分国家或地区，图像可能尚未进入公版；示例包括中国大陆、加拿大、德国、墨西哥和瑞士。
- 因此本记录**不宣称该作品全球公版，不宣称馆方授权全部商用，也不将 Commons 结构化数据的 CC0 误当作画作或图片的 CC0**。
- Access O’Keeffe 新版图像页另有 © Art Institute of Chicago、rights statement 和 image licensing 链接，下载规则对其提供的新图像有限制。本次下载来自上列 Commons 旧文件，没有接受该站下载协议，也不将馆方新图像的许可转授到本文件。
- 对于公开、商业或其他地区分发，请以实际发行地和对应授权核实为准；来源标记不是新的版权许可。

## 本地文件验证

- 路径：`public/artworks/georgia-blue-green-music.jpg`。
- 原文件保留：未生成、未调色、未裁切或修改。
- sips 可正常解码，视觉核验为蓝绿白色抽象形态和左侧深色斜带，确为《蓝与绿的音乐》；不是《红色美人蕉》或其AI仿作。
- 规格：JPEG，642 × 768 像素，63654 字节。原始公开文件分辨率较低，全屏放大会体现这一限制；没有通过插值假称高清。
- SHA-256：`0a79b868a74baa18e5b5d4665919b2faaa2551e97b865399f7f8b342f46db576`。

## 较高清官方图像复查

- 同日复查馆方公开 API `https://api.artic.edu/api/v1/artworks/24306`，网页检索工具仍不可访问；没有尝试绕过403。
- 按馆方 [API 文档](https://api.artic.edu/docs/)了解 IIIF 的公开用法；公开旧API示例 [ARTIC-generator README](https://github.com/rararamberg/ARTIC-generator)记录本作品 image_id 为 `702580d8-451e-0b0c-bcc1-bac62e5f6631`，同时保留 `is_public_domain=false`、`copyright_notice=© The Art Institute of Chicago` 和 `max_zoom_window_size=1280`。这是第三方保存的旧API样本，不冒称本轮馆方现行API确认。
- 仅依该已有标识请求官方 IIIF 元数据 `https://www.artic.edu/iiif/2/702580d8-451e-0b0c-bcc1-bac62e5f6631/info.json`，返回403；停止，没有依次猜图像尺寸或替代地址。
- 未取得官方较高清图像，保留上列642×768 Commons原图。
