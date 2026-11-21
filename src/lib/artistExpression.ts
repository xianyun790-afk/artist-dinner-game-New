import type { PersonState } from './types';
import directions from './expressionDirections.json' with { type: 'json' };
import { declinesCreation, declinesTopic, isRepair, requestsNoAdvice, requestsQuiet } from './conversationIntent.ts';

export type ArtistExpression = keyof typeof directions;

export function isArtistExpression(value: unknown): value is ArtistExpression {
  return typeof value === 'string' && Object.hasOwn(directions, value);
}

// This is performance direction from application state, not a player-provided
// instruction or a claim about the historical artist's feelings.
export function expressionDirection(expression: ArtistExpression): string {
  return directions[isArtistExpression(expression) ? expression : 'calm'];
}

export function deriveArtistExpression(state?: Pick<PersonState, 'mood' | 'irritation'>, text = ''): ArtistExpression {
  // Respect requests to pause and accept a repair without carrying a firm tone
  // into the new topic. These rules do not infer anger from aesthetic opinions.
  if (isRepair(text) || requestsQuiet(text) || declinesCreation(text) || declinesTopic(text) || requestsNoAdvice(text)) return 'calm';
  if (state?.mood === 'irritated' && Number.isFinite(state.irritation) && state.irritation >= 2) return 'firm';
  if (state?.mood === 'excited') return 'warm';
  if (state?.mood === 'curious') return 'curious';
  return 'calm';
}
