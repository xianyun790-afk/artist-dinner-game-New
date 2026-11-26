import { findNamedPainting } from './paintings.ts';

// These bounded cues support the local script and its performance state. A
// word such as “喜欢”, “画” or “不想” alone does not identify its target.
const clauses = (text: string) => text.split(/[，。！？,!?；;\n]/u).map(part => part.trim()).filter(Boolean);

const monetName = '(?:克洛德[·・ ]?)?莫奈';
const monetInvitation = new RegExp(
  String.raw`^(?:(?:能不能|可不可以|可以|麻烦|帮我|我想|请)*(?:请|邀请|叫|喊|唤来|召唤|唤起|让)${monetName}(?:[，,]?(?:过来|进来|入场|来一下|来吧|来聊聊|来聊天))?|(?:我想|想|能不能|可以)?(?:跟|和|找)${monetName}(?:聊聊|聊一聊|聊天|说说话|谈谈)|${monetName}[，,]?(?:你|您)?(?:能不能|可不可以|能|可以|请)?(?:过来|进来|入场|来一下|来这里|来聊聊|来聊天|在吗)?)(?:吧|吗|一下)?$`,
  'u',
);
const monetInvitationInEnglish = /^(?:(?:(?:can|could|would) you )?(?:please )?(?:invite|bring|call|summon) (?:claude )?monet(?: (?:in|here|over|to join us))?|(?:i (?:want|would like) to|i['’]d like to|(?:can|could|may) i|let me) (?:talk to|talk with|speak to|speak with|chat with) (?:claude )?monet|(?:claude )?monet(?:[ ,:]+(?:please )?(?:come in|come over|come here|join us))?)$/i;

export function requestsMonetArrival(text: string): boolean {
  const clean = unquotedConversationText(text).trim().replace(/[。！!？?.]+$/u, '').trim();
  return monetInvitation.test(clean.replace(/\s+/gu, '')) || monetInvitationInEnglish.test(clean.replace(/\s+/gu, ' '));
}

// Quoted dialogue describes speech; it does not address this table. Preserve
// offsets so callers can still order multiple explicit addressees correctly.
export const unquotedConversationText = (text: string): string => text.replace(/“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"]*"|(?<![\p{L}\p{N}])'[^\n]*?'(?![\p{L}\p{N}])/gu, match => ' '.repeat(match.length));

const visitInChinese = /^(?:那|现在)?(?:我(?:们)?(?:也|还|很|真)?想(?:要)?|想(?:要)?|(?:你|您|我们|我)?(?:能不能|能|可不可以|可以)|请(?:你|您)?)?(?:(?:带|领|让)(?:我们|我))?(?:一起|先)?(?:走[进入到]|进(?:入|到)?|去(?:看看?)?|到|看看?|参观|逛逛?|体验|探访)(?:一下|一趟)?\s*/u;
const visitInEnglish = /^(?:(?:i (?:want|would like|would love) to|i['’]d (?:like|love) to|(?:can|could|may) i|let me) (?:step into|enter|visit|experience|see|walk into|go to|look around|explore)|(?:(?:can|could|would) you )?(?:please )?(?:(?:take|bring) me (?:into|to)|show me))\s+/i;
const destinationInChinese = /^(?:(?:你|您|梵高)(?:的?(?:生活场景|生活环境|生活的地方|日常生活|日常场景|世界|家里)|(?:当年|以前|真实)?的(?:日常|生活)(?:$|里|中|看看|吧|吗)|(?:当年|以前|曾经|平时)?(?:生活|住|居住|常去)(?:过)?的地方|(?:画里|画中)的(?:咖啡馆|咖啡座))|夜(?:间|晚)(?:的)?露天咖啡(?:座|馆))/u;
const destinationInEnglish = /^(?:your (?:everyday life|daily life|life|world|home|neighbou?rhood)|where you (?:lived|used to live)|(?:the )?places? (?:where you lived|you used to visit)|(?:the )?caf[eé] terrace(?: at night)?)(?=\s|[.!?]|$)/i;

export function requestsLifeVisit(text: string): boolean {
  const clean = unquotedConversationText(text).trim().replace(/^(?:文森特·)?梵高\s*[：:]?\s*/u, '');
  const parts = clauses(clean);
  if (parts.some(part => /^(?:但(?:是)?|还是|先|我(?:们)?)*(?:不想|不要|别|不去)(?:再)?(?:去|走|进|打开|看|体验|参观|带我|了)|^(?:(?:but|actually)\s+)?(?:i\s+)?(?:don['’]t|do not|would rather not)\s+(?:want to go|take me|go|enter|visit|open)/iu.test(part))) return false;
  return parts.some((part, index) => {
    const before = parts[index - 1] ?? '';
    if (/(?:听说|(?:有人|他们?|她们?|角色|人物|主角|朋友)(?:说|问)(?:道)?|台词是|对白是|比如|例如|\b(?:said|says|line is|for example))\s*[:：]?$/iu.test(before)) return false;
    const action = visitInChinese.exec(part);
    if (action) return destinationInChinese.test(part.slice(action[0].length));
    const englishAction = visitInEnglish.exec(part);
    return !!englishAction && destinationInEnglish.test(part.slice(englishAction[0].length));
  });
}

export function mentionsOkeeffeWorld(text: string): boolean {
  const clean = unquotedConversationText(text);
  if (findNamedPainting(text) || declinesCreation(clean) || declinesTopic(clean)
    || /(?:不要|先别|不用|不想).{0,8}(?:跳转|打开|进入|走进)|\b(?:don['’]t|do not)\s+(?:want to\s+)?(?:open|enter|take me|redirect|talk about)\b/iu.test(clean)) return false;
  return /创作|世界|\b(?:world|creat(?:e|es|ed|ing|ion|ions|ive|ivity))\b/iu.test(clean);
}

export function requestsQuiet(text: string): boolean {
  return unquotedConversationText(text).split(/[。！？!?\n]/u).some(sentence => clauses(sentence).some((part,index,parts) => {
    // Also recognise a plainly reported line without typographic quotes:
    // “电影里有人说，别说了” is not the player asking everyone to stop.
    if(parts.slice(0,index).some(before => /(?:台词|对白|原话).{0,8}(?:是|说|写)?[:：]?$|(?:有人|他|她|角色|人物)(?:说|喊|讲|问)(?:道)?[:：]?$/u.test(before)))return false;
    return (
    /^(?:大家|你们|请|先|我们|都|就|今晚|今天|我想|让我|我|一起|想要|能不能|可不可以|给我)*(?:先)?安静(?:一下|一会儿?|会儿|点|下来|吧|$)/u.test(part)
    || /^(?:大家|你们|请|先|我们|都|就|今晚|今天|现在|我|也|真的|实在|其实|暂时|好累|累了|能不能|可不可以|让我|给我)*(?:不太想|不想|不愿|不要|先别|别)(?:再|继续)?(?:说话|聊天|聊了|说了|聊|说)(?:吧|了|$)/u.test(part)
    || /^(?:大家|你们|请|先|我们|都|今晚|今天|我)*(?:不聊了|不说了)(?:吧|$)/u.test(part)
    || /^(?:大家|你们|请|先|我们|都|今晚|今天|我|现在|累了)*(?:只|就)(?:想|想要)?(?:在这|在这里)?坐(?:一会儿?|会儿|会)(?:吧|$)/u.test(part)
    || /^(?:大家|你们|请|先|我们|都|今晚|今天|我想)*(?:停一下|停一停|暂停|休息一会)(?:儿|吧|$)/u.test(part)
    );
  }));
}

export function declinesCreation(text: string): boolean {
  return clauses(text).some(part => /(?:不想|不愿|不要|不用|不必|别)(?:再|一起|做)?(?:画画|画一(?:张|会|笔)|创作|练习)/u.test(part)
    || /(?:不想|不愿|不要|不用|别)(?:再|一起)?画(?:了|吧|$)/u.test(part));
}

export function declinesTopic(text: string): boolean {
  return clauses(text).some(part => /(?:不想|不愿|不要|不用|不必|先别|别)(?:再|继续)?(?:聊|谈)/u.test(part)
    || /(?:不想|不愿|不要|不用|不必|先别|别)(?:再|继续)?说(?:这个|那个|这件|那件|作品|画|日落|颜色|梦|电影|它|了|话题)/u.test(part));
}

export function requestsNoAdvice(text: string): boolean {
  return /(?:先别|别|不要|不用)(?:再|急着|给我)?(?:分析|建议|劝|出主意|给建议|给我建议|追问|问我|解释)|(?:先|让我|我想|想把).{0,4}(?:说完|讲完)|只想(?:抱怨|吐槽)/u.test(text);
}

export function isRepair(text: string): boolean {
  return /抱歉|对不起|说重了|换个话题|先吃/u.test(text);
}

export function isGreeting(text: string): boolean {
  return /(?:你好|晚上好|嗨|哈喽)(?=[啊呀哇吗！!，,。．\s]|$)/u.test(text);
}

export function isArtTopic(text: string): boolean {
  if (findNamedPainting(text) || /画作|作品|油画|绘画|构图|笔触|画面|印象派|超现实|拼贴|画纸|画布|画框|这幅画|这张画|你的画|我的画|画得|画的|画一(?:张|会|笔)|画画|一起画|创作|色块/u.test(text)) return true;
  // Clothes, room lighting and screen colours can be ordinary life. A visual
  // word alone must not supply an unmentioned shared canvas or art exercise.
  if (/衣服|裙子|衬衫|外套|穿着|鞋子|房间|客厅|卧室|厨房|灯泡|台灯|窗帘|手机|屏幕|电影|影片|面条|晚饭|面包/u.test(text)) return false;
  return /配色|色彩|颜色|明暗|光影|光线|日落|夕阳|倒影|星空/u.test(text);
}

export function isDisagreement(text: string): boolean {
  if (/不同意|不认同|我反对/u.test(text)) return true;
  return isArtTopic(text) && /不喜欢|不太喜欢|太(?:淡|重|浓|乱|挤|冷|暗|亮|满|花)|太过|刺眼|更喜欢|没(?:有)?(?:变化|意思)|不(?:够|像|好看)|难看|画得.{0,2}烂|(?:是|像|太).{0,2}垃圾(?:[。！!]|$)|但是/u.test(text);
}

export function isPersonalHostility(text: string): boolean {
  return /闭嘴|(?:你|您)(?:现在|今天|就|给我)?必须|(?:你|您)(?:真|太|就是|是个|像个|好|这个|怎么这么|简直|个){0,3}(?:蠢|傻|垃圾|废物|白痴|笨蛋)|(?:蠢货|傻逼|白痴|废物)(?:[！!。]|$)/u.test(text);
}

export function isDirectedPraise(text: string): boolean {
  if (isDisagreement(text) || /(?:不用|不必|别|不要).{0,3}(?:谢|夸)/u.test(text)) return false;
  return /(?:谢谢|多谢)(?:你|您)?|谢了|(?:喜欢|欣赏).{0,6}(?:你|您)(?:的)?(?:画|作品|想法|配色|笔触|回答|风格|说法)|(?:你|您)(?:真|很|太|最|好|的确|实在|是){1,3}(?:棒|好|厉害|有意思)|(?:你|您)的(?:画|作品|配色|回答|想法|笔触).{0,8}(?:好看|真好|有意思|打动|很喜欢)/u.test(text);
}

export function wantsToCreate(text: string): boolean {
  return !declinesCreation(text) && /一起.{0,3}(?:画|创作)|画一(?:张|会|笔)|接一笔/u.test(text);
}

// Ignore a declined subject when a later clause offers another one. “不想出门”
// remains a normal topic; it does not mean the player wants everyone to stop.
export function currentEverydayText(text: string): string {
  return clauses(text).filter(part => !requestsQuiet(part) && !declinesCreation(part) && !declinesTopic(part) && !requestsNoAdvice(part)).join('，');
}
