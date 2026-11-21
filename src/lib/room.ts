import type {Artist} from './types';
import {findMentionedPainting,findNamedPainting} from './paintings.ts';
import {currentEverydayText,declinesCreation,declinesTopic,isArtTopic,isDirectedPraise,isDisagreement,isGreeting,isPersonalHostility,isRepair,requestsNoAdvice,requestsQuiet,unquotedConversationText} from './conversationIntent.ts';
export const topicFor=(a:Artist)=>a.id==='monet'?'光影':a.id==='vincent'?'色彩':a.id==='dali'?'梦境':a.id==='georgia'?'日常':'灵感';
const themes:Record<string,RegExp>={
  monet:/光影|阳光|日落|夕阳|影子|风景|睡莲|water\s+lilies|nymph[eé]as|花园|光线|倒影/i,
  vincent:/色彩|颜色|黄色|蓝色|红色|向日葵|星空|星月夜|星夜|starry\s+night|画笔|笔触/i,
  dali:/梦境|做梦|梦见|梦到|奇怪|荒诞|超现实|时钟|想象|梦/,
  georgia:/日常|生活|今天|吃|面包|水果|梨|累|难过|开心|心情|烦|焦虑/,
};
const escapePattern=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const addressNames=(a:Artist)=>[...new Set([a.name,a.fullName,a.english,...(a.id==='georgia'?['欧姬弗','奥姬芙']:[])].filter(Boolean))];

export function directlyAddressedArtists(text:string,guests:Artist[]):Artist[]{
  if(!guests.length)return [];
  const names=guests.flatMap(addressNames).sort((a,b)=>b.length-a.length).map(escapePattern).join('|');
  const nameList=`(?:${names})(?:\\s*(?:和|与|还有|、|&|and)\\s*(?:${names}))*`;
  const prefix='(?:(?:我想问问|我想问|我想请|能不能请|我想找|我想和|我想跟|请问|问问|想问|想请|想和|想跟|请|让|我问|我找|找|嗨|嘿|你好)[，,\\s]*)?';
  // A name must be used as an address, alone or followed by a request. Merely
  // mentioning somebody's work or asking about them must not change seats.
  const pattern=new RegExp(`(?:^|[，,。！？!?；;\\n])\\s*${prefix}(${nameList})\\s*(?=[，,：:！!？?。；;\\n]|$|你|您|来|请|说说|聊聊|谈谈|帮我|能|可|想吃|想喝|想聊|想不想|愿不愿意|会|怎么|觉得|认为|要不要|先说|再说)`,'giu');
  const clean=unquotedConversationText(text),found=new Set<string>(),result:Artist[]=[];
  for(const match of clean.matchAll(pattern)){
    const address=match[1].toLowerCase();
    const positioned=guests.flatMap(artist=>{
      const indices=addressNames(artist).map(name=>address.indexOf(name.toLowerCase())).filter(index=>index>=0);
      return indices.length?[{artist,index:Math.min(...indices)}]:[];
    }).sort((a,b)=>a.index-b.index);
    for(const {artist} of positioned)if(!found.has(artist.id)){found.add(artist.id);result.push(artist);}
  }
  return result;
}
export function responderFor(text:string,guests:Artist[],preferredId:string|null,previousId:string|null):Artist|undefined{
  // A direct address takes precedence over the selected seat and topic.
  const named=directlyAddressedArtists(text,guests)[0];
  if(named)return named;
  if(preferredId){const picked=guests.find(a=>a.id===preferredId);if(picked)return picked;}
  const painting=findNamedPainting(text);
  if(painting){const owner=guests.find(a=>a.id===painting.artistId);if(owner)return owner;}
  // An unaddressed follow-up continues the last speaker, including ordinary
  // words like “今天” or “吃” that would choose a topic on a fresh table.
  const previous=guests.find(a=>a.id===previousId);if(previous)return previous;
  const themed=guests.find(a=>themes[a.id]?.test(text));if(themed)return themed;
  return guests.find(a=>a.id==='georgia')??guests[0];
}
const byArtist=(a:Artist,lines:Record<string,string>,fallback:string)=>lines[a.id]??fallback;

// Game-authored everyday choices, not claims about the historical artists.
// Unknown custom identities never borrow a built-in artist's habits.
export function everydayReply(a:Artist,text:string):string|null{
  const current=currentEverydayText(text);
  if(!current||isArtTopic(current))return null;
  if(/衣服|裙子|衬衫|外套|穿着|鞋子/.test(current)&&/颜色|色彩|配色|淡|亮|暗/.test(current))return byArtist(a,{
    monet:'衣服淡一点我倒喜欢，穿着不累。',vincent:'衣服的话，我会挑醒目一点的。',dali:'我倒愿意穿得显眼些，认错人的机会少。',georgia:'我喜欢简单一点的，颜色不用太多。',lin:'我先看耐不耐脏，颜色倒是其次。',
  },'衣服穿着舒服最要紧。');
  if(/房间|客厅|卧室|厨房|灯泡|台灯/.test(current)&&/光线|亮|暗/.test(current))return byArtist(a,{
    monet:'我想亮一点，看东西不用费劲。',vincent:'太暗我坐不住，想把灯调亮些。',dali:'亮一点吧，我还想看清自己在吃什么。',georgia:'看得清就够了，不用太亮。',lin:'我怕光太暗，找东西都得摸半天。',
  },'亮到能看清东西就好。');
  if(/电影|影片|片子/.test(current)){
    if(/(?:不想|不要|不愿|不看)(?:再|去|看|这部|那部){0,2}(?:电影|影片|片子)/.test(current))return '那今天就不看，想聊什么再聊。';
    return byArtist(a,{
    monet:'想聊哪一部？我还不知道你说的是哪部电影。',
    vincent:'哪一部？先说说让你记住的那一段。',
    dali:'哪部电影？先给我名字，我再决定要不要装懂。',
    georgia:'哪一部？没看过的，我就直说没看过。',
    lin:'哪一部？你记得最清楚的是什么？',
    },'想聊哪部电影？我还不知道片名。');
  }
  if(/太咸|有点咸|咸了|咸得/.test(current))return byArtist(a,{
    monet:'太咸我也吃不下。我宁愿味道淡一点。',
    vincent:'那吃着不痛快。我还是喜欢能大口吃的。',
    dali:'看来盐比面还抢眼。我还是想吃面。',
    georgia:'太咸我也不喜欢，淡一点就好。',
    lin:'我也怕咸。好好的一碗面，汤别抢了味道。',
  },'太咸确实吃不下，别勉强。');
  if(/吃|面包|晚饭|早饭|早餐|午饭|晚餐|面条|一碗面/.test(current))return byArtist(a,{
    monet:'我想喝点热汤，配块面包就好。',
    vincent:'我可得吃点热的，哪怕只煮一碗汤。',
    dali:'我想加个煎蛋。今晚就让它当大菜吧。',
    georgia:'吃点咸的就够了，甜的先留着。',
    lin:'面包吧，要烤脆一点。软塌塌的我不太想吃。',
  },'我还没想好吃什么。你有想吃的吗？');
  if(/喝什么|想喝|喝点/.test(current))return byArtist(a,{
    monet:'热茶就好，慢慢喝。',vincent:'来点热的吧，我不挑。',dali:'茶吧，这回不加什么奇怪的东西。',georgia:'水就好。',lin:'热水就行，别太烫。',
  },'水就好。');
  if(/出门|出去|散步|懒得动|走走/.test(current))return /不想(?:出门|出去)|不(?:出门|出去)|懒得动/.test(current)?byArtist(a,{
    monet:'那就留着。我不喜欢为了散步，还得先催自己半天。',
    vincent:'我还是想出去走两步，坐久了难受。你歇着。',
    dali:'那就不去。让鞋子失望一晚上也没什么。',
    georgia:'不去也行。我倒想一个人走一会儿。',
    lin:'那就先不去。说不定坐着坐着又想动了。',
  },'那就先不出门，想动的时候再走。'):byArtist(a,{
    monet:'我想再坐会儿。出门也不急在这一会儿。',vincent:'我想出去走两步，坐久了难受。',dali:'我倒想出去。总待着，连个新鲜事也碰不到。',georgia:'我想一个人走一会儿。',lin:'我想去走走，不过得挑双舒服的鞋。',
  },'我还没想好要不要出门。');
  if(/累|难过|焦虑|烦|压力/.test(current))return byArtist(a,{
    monet:'那就歇着吧，不用急着把话说清楚。',
    vincent:'先缓缓。想抱怨两句，我听着。',
    dali:'那我先收起玩笑。你慢慢说。',
    georgia:'那就少做一点。想说什么就说。',
    lin:'先歇会儿。你说多少都行。',
  },'先歇会儿，想说什么就说。');
  if(/开心|高兴|好消息/.test(current))return byArtist(a,{
    monet:'听着不错，是什么好事？',vincent:'那可得说说，今天碰上什么好事了？',dali:'好事值得占一点桌边的时间。说来听听。',georgia:'是什么好事？',lin:'说说吧，我也想听听。',
  },'听着不错，是什么好事？');
  return null;
}

export function everydayFallback(a:Artist,text:string):string{
  return everydayReply(a,text)??byArtist(a,{
    monet:'这件事我还没听清，你接着说。',
    vincent:'你说具体一点，我想听明白。',
    dali:'这回我先不猜。你说的是什么事？',
    georgia:'说说具体的事吧。',
    lin:'刚才那一点我还没听明白，你接着说。',
  },'这件事我还没听清，你接着说。');
}
export function roomReply(a:Artist,text:string):string|null{
  if(requestsQuiet(text)||declinesTopic(text)||declinesCreation(text)||requestsNoAdvice(text)||isPersonalHostility(text)||isRepair(text)||isDisagreement(text)||isDirectedPraise(text))return null;
  if(isGreeting(text))return a.greeting;
  const everyday=everydayReply(a,text);if(everyday)return everyday;
  if(!isArtTopic(text)&&a.id!=='dali')return null;
  const painting=findMentionedPainting(text);
  if(a.id==='dali'&&painting?.id==='persistence-of-memory')return '那些软下来的钟，还留着表盘。一个原本用来计量时间的东西，忽然没了硬骨头。这个小麻烦，我很喜欢。';
  if(a.id==='georgia'&&painting?.id==='blue-green-music')return '我会看蓝和绿相接的边缘，还有形状弯过去的地方。目光能顺着它们走一会儿，先不急着给每个形状取名字。';
  if(a.id==='monet'&&themes.monet.test(text)){
    if(/睡莲|water\s+lilies|nymph[eé]as/i.test(text))return '我更在意睡莲之间那些空出来的水面。花、倒影和水下的暗处，要放在一起看。';
    if(/日落|夕阳/.test(text))return '日落最有意思的，是你刚想记住它，它已经换了一种颜色。我常常来不及，只好明天再等。';
    return '我会先看光落在哪里。同一块白色，在不同光线里会变。我倒愿意多看一会儿。';
  }
  if(a.id==='vincent'&&themes.vincent.test(text)){
    if(/星月夜|星夜|starry\s+night/i.test(text))return '《星月夜》里，蓝色的天空和明亮的星星拉着彼此。我想留下天空转动的感觉。';
    if(/蓝色/.test(text))return '我会想试试蓝旁边放一点黄。两种颜色挨着时，和单独看不太一样。';
    if(/黄色|向日葵/.test(text))return '我偏爱有力的黄。可只看黄还不够，旁边放什么颜色，也得一起看。';
    return '我在意两种颜色挨着时发生了什么。有时只改旁边那一小块，感觉就完全变了。';
  }
  if(a.id==='dali'&&themes.dali.test(text))return /梦见|梦到/.test(text)?'我先不替梦找寓意。你说的那个意外，倒值得接着听。':'如果在想象里只改一条规则，我会先让椅子自己挑客人。它得有点眼光。';
  return null;
}
