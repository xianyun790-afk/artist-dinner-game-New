export const standingModels: Record<string, string> = {
  vincent: '/models/standing/vincent.glb',
  dali: '/models/standing/dali.glb',
  monet: '/models/standing/monet.glb',
  georgia: '/models/standing/georgia.glb',
};

export const defaultStandingGuests = ['vincent', 'dali'] as const;
export const standingSpacing = (count: number) => count > 2 ? 1.44 : 2.15;

export function standingLineup(guestIds: readonly string[]) {
  const order = guestIds.filter(id => id !== 'georgia');
  if (guestIds.includes('georgia')) order.push('georgia');
  return order.map((id, i) => ({
    id,
    x: (i - (order.length - 1) / 2) * standingSpacing(order.length),
    yaw: order.length === 2 ? (i === 0 ? .58 : -.58)
      : order.length > 2 ? (i === 0 ? .28 : i === order.length - 1 ? -.28 : .14) : 0,
  }));
}

export const tiredAside = { artistId: 'vincent', text: '好累啊。', recordingUrl: '/audio/vincent-tired-ahu.mp3' } as const;

const crouchNames = { vincent: '梵高', monet: '莫奈', dali: '达利' } as const;

export function crouchTargets(text: string, guests: string[], selected: string | null) {
  const cue = text.replace(/[，,、。？?！!\s]/gu, '');
  if (!/^(?:请|梵高|莫奈|达利|和|你们俩|你们|你|两位|大家|都|一起|再|先|可以|能不能|可不可以)*(?:蹲一下|蹲下(?:去|来)?|蹲一蹲|蹲一会儿?)(?:看看|吧|吗|呢)?$/u.test(cue)) return null;
  const named = Object.entries(crouchNames).filter(([, name]) => cue.includes(name)).map(([id]) => id);
  const targets = named.length ? named : selected && !/大家|你们|两位|一起|都/u.test(cue) ? [selected] : guests;
  return targets.filter(id => guests.includes(id) && (id === 'vincent' || id === 'monet'));
}

// One event per minute on stage. A busy turn can defer one beat, never queue a backlog.
export function restClock(arrival: number) {
  let due = arrival + 60_000;
  return (now: number, idle: boolean) => {
    if (!idle || now < due) return false;
    due = now + 60_000;
    return true;
  };
}
