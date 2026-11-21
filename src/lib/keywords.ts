export type Keyword = 'art' | 'works' | 'invite' | 'settings' | 'memory' | 'end';
export const keywordInfo: Record<Keyword,{title:string;action:string}>={
  art:{title:'要一起画一会儿吗？',action:'铺一张纸'},
  works:{title:'把作品拿出来看看？',action:'打开作品夹'},
  invite:{title:'再邀请一位喜欢的艺术家？',action:'看看来宾册'},
  memory:{title:'看看我们记下的小事？',action:'打开晚宴手记'},
  end:{title:'把今晚收好，下次接着聊？',action:'收好今晚'},
  settings:{title:'调整一下声音？',action:'声音设置'},
};
export function detectKeyword(text:string):Keyword|null {
  // A suggestion is offered only for an affirmative clause, never executed here.
  const rules:[Keyword,RegExp][]=[['end',/今晚.*到这里|今天.*到这里|结束晚宴|下次再聊/],['memory',/晚宴手记|看看.{0,3}(记忆|回忆)/],['art',/一起.{0,3}(画|创作)|画一(张|会|笔)|接一笔/],['works',/(看|打开|拿出|展示).{0,5}(作品|画夹)|作品夹/],['invite',/邀请|换.{0,3}(艺术家|人设)|来宾册|加.{0,2}(朋友|来宾)/],['settings',/声音设置|调整.{0,3}(声音|音色)|开启语音/]];
  for(const raw of text.split(/[，。！？,!?；;]/)){
    const clause=raw.replace(/要不要|能不能|可不可以/g,'想');
    if(/不想|不要|不用|不必|别|不愿|不需要|不打算|不看|不画|不邀请/.test(clause))continue;
    for(const [key,pattern] of rules)if(pattern.test(clause))return key;
  }
  return null;
}
