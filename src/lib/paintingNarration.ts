/** Each subtitle has its own local recording, in the voice of the work's artist. */
export const paintingNarration: Partial<Record<string, { text: string; audio: string }[]>> = {
  'starry-night': [
    { text: '你看，左边那棵柏树，黑得像一簇火。', audio: '/audio/dialogue/vincent-starry-cypress.mp3' },
    { text: '顺着那圈蓝色往下看，村子里还有几扇窗亮着呢。', audio: '/audio/dialogue/vincent-starry-village.mp3' },
  ],
  'persistence-of-memory': [
    { text: '你瞧，树枝上那只表，挂得倒比我的外套还服帖。', audio: '/audio/dialogue/dali-memory-watch.mp3' },
    { text: '下回赴约要是迟了，就带上这幅画，指给他们看是哪只表的错。', audio: '/audio/dialogue/dali-memory-late.mp3' },
  ],
  'water-lilies': [
    { text: '你看叶子之间那点光。池塘把一小块天空留在了水里。', audio: '/audio/dialogue/monet-water-lilies.mp3' },
  ],
  'blue-green-music': [
    { text: '顺着蓝色和绿色交界的那道曲线看。它带着你的眼睛往上走。', audio: '/audio/dialogue/georgia-blue-green-narration.mp3' },
  ],
};
