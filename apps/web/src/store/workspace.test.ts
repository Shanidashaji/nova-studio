import { beforeEach, describe, expect, it } from 'vitest';
import { readUrlState, useWorkspace, writeUrlState } from './workspace';

describe('workspace URL state', () => {
  it('round-trips lens, focus and the inspected entity', () => {
    const state = {
      lens: 'schedule' as const,
      focus: { type: 'stage' as const, id: 'EDIT', label: 'Edit' },
      stack: [{ type: 'project' as const, id: 'p1', section: 'tasks' }],
    };
    const url = writeUrlState(state);
    expect(url).toBe('?lens=schedule&focus=stage%3AEDIT%3AEdit&inspect=project%3Ap1%3Atasks');
    expect(readUrlState(url)).toEqual(state);
  });

  it('omits defaults and ignores unknown values', () => {
    expect(writeUrlState({ lens: 'pulse', focus: null, stack: [] })).toBe('');
    expect(readUrlState('?lens=nonsense&focus=planet:x')).toEqual({});
  });
});

describe('workspace store', () => {
  beforeEach(() =>
    useWorkspace.setState({
      lens: 'pulse',
      focus: null,
      stack: [],
      contextMode: 'nova',
      contextOpen: false,
    }),
  );

  it('stacks inspected entities and walks back to NOVA', () => {
    const ws = useWorkspace.getState();
    ws.inspect({ type: 'project', id: 'p1' });
    ws.inspect({ type: 'task', id: 't1' });
    expect(useWorkspace.getState().stack.map((s) => s.id)).toEqual(['p1', 't1']);
    expect(useWorkspace.getState().contextMode).toBe('inspector');
    useWorkspace.getState().back();
    useWorkspace.getState().back();
    expect(useWorkspace.getState().contextMode).toBe('nova');
  });

  it('does not duplicate the entity already on top', () => {
    const ws = useWorkspace.getState();
    ws.inspect({ type: 'project', id: 'p1' });
    ws.inspect({ type: 'project', id: 'p1', section: 'budget' });
    expect(useWorkspace.getState().stack).toEqual([
      { type: 'project', id: 'p1', section: 'budget' },
    ]);
  });

  it('toggles stage focus', () => {
    useWorkspace.getState().focusStage('EDIT', 'Edit');
    expect(useWorkspace.getState().focus?.id).toBe('EDIT');
    useWorkspace.getState().focusStage('EDIT', 'Edit');
    expect(useWorkspace.getState().focus).toBeNull();
  });
});
