import { describe, expect, it } from 'vitest';
import { nicknameProblem } from './nickname';

describe('nicknameProblem', () => {
  it('accepts ordinary cuber names, including ones that merely contain short bad words', () => {
    for (const ok of [
      'Erik',
      'Speedy_Cuber-99',
      'ClassicCuber',
      'Assassin_7',
      'Cocktail',
      'Scunthorpe',
      'Therapist',
      'Essex_Cuber',
      'Dickens',
      'Sussex',
      'Nazir',
      'Swanky',
      'Alice85752',
      'x'.repeat(20),
    ]) {
      expect(nicknameProblem(ok), ok).toBeNull();
    }
  });

  it('rejects names that break the character rules', () => {
    for (const bad of ['ab', 'x'.repeat(21), 'has space', 'émile', '<b>']) {
      expect(nicknameProblem(bad), bad).toMatch(/^Nicknames are /);
    }
  });

  it('rejects slurs and profanity, including letter-for-digit swaps', () => {
    for (const bad of [
      'fuckyou',
      'F_u_c_k',
      'sh1t',
      'BigDick',
      'big_ass',
      'n1gger',
      'xX_porn_Xx',
    ]) {
      expect(nicknameProblem(bad), bad).toBe('Please pick a different nickname.');
    }
  });

  it('reserves official-looking names', () => {
    for (const bad of ['Admin', 'cuberush_staff', 'The-Admin', 'ADM1N', 'Moderator1', 'support']) {
      expect(nicknameProblem(bad), bad).toMatch(/reserved/);
    }
  });
});
