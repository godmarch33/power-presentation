export const MODEL_MIXES = Object.freeze(['economy', 'all-sonnet', 'opus-orchestrator', 'all-opus']);
export const DEFAULT_MIX = 'opus-orchestrator';

export const ROLES = Object.freeze({
  economy: Object.freeze({ orchestrator: 'inherit', story_director: 'sonnet', frame_worker: 'sonnet', critics: 'sonnet' }),
  'all-sonnet': Object.freeze({ orchestrator: 'inherit', story_director: 'sonnet', frame_worker: 'sonnet', critics: 'sonnet' }),
  'opus-orchestrator': Object.freeze({ orchestrator: 'inherit', story_director: 'opus', frame_worker: 'sonnet', critics: 'sonnet' }),
  'all-opus': Object.freeze({ orchestrator: 'inherit', story_director: 'opus', frame_worker: 'opus', critics: 'opus' }),
});

const pick = (v, allowed) => (typeof v === 'string' && allowed.includes(v.trim()) ? v.trim() : null);

export function runProfile({ intake = null, env = process.env } = {}) {
  const declared = intake?.declared ?? {};
  const mixFlag = pick(intake?.model_mix, MODEL_MIXES) ?? pick(declared.model_mix, MODEL_MIXES);
  const mixOpt = pick(env.CLAUDE_PLUGIN_OPTION_MODEL_MIX, MODEL_MIXES);
  const model_mix = mixFlag ?? mixOpt ?? DEFAULT_MIX;
  const criticFlag = typeof intake?.critic === 'boolean' ? (intake.critic ? 'on' : 'off') : pick(intake?.critic, ['on', 'off']) ?? (typeof declared.critic === 'boolean' ? (declared.critic ? 'on' : 'off') : pick(declared.critic, ['on', 'off']));
  const criticOpt = pick(env.CLAUDE_PLUGIN_OPTION_CRITIC, ['auto', 'on', 'off']);
  const economy = model_mix === 'economy';
  const critic = criticFlag ?? (criticOpt && criticOpt !== 'auto' ? criticOpt : (economy ? 'off' : 'on'));
  return {
    model_mix,
    critic,
    critic_votes: critic === 'off' ? 0 : economy ? 1 : 3,
    agents_at_once: economy ? 2 : null,
    fix_rounds: 1,
    roles: { ...ROLES[model_mix], critics: critic === 'off' ? null : ROLES[model_mix].critics },
    source: {
      model_mix: mixFlag ? 'flag' : mixOpt ? 'userConfig:model_mix' : 'default',
      critic: criticFlag ? 'flag' : criticOpt && criticOpt !== 'auto' ? 'userConfig:critic' : economy ? 'economy profile' : 'default',
    },
  };
}
