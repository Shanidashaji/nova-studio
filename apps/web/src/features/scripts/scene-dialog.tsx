'use client';

import {
  SCENE_SETTING_LABELS,
  SCENE_SETTINGS,
  SCENE_TIMES,
  shootDayKeys,
  type SceneView,
  type ShootView,
} from '@nova/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { dayLabel, fieldErrors, listToText } from '@/features/studio/ui';
import { titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';

/** Create or edit a scene of the breakdown, including where and when it is shot. */
type SceneDialogProps = Parameters<typeof SceneForm>[0];

export function SceneDialog(props: SceneDialogProps) {
  return props.open ? <SceneForm {...props} /> : null;
}

function SceneForm({
  open,
  onOpenChange,
  projectId,
  scriptId,
  scene,
  shoots,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  scriptId?: string | null;
  scene?: SceneView | null;
  shoots: ShootView[];
}) {
  const empty = {
    number: '',
    heading: '',
    description: '',
    setting: 'INT' as string,
    timeOfDay: 'DAY' as string,
    location: '',
    characters: '',
    props: '',
    wardrobe: '',
    equipment: '',
    requirements: '',
    estimatedMinutes: '60',
    notes: '',
    shootId: '',
    shootDate: '',
    plannedStart: '',
  };
  const [v, setV] = useState(() =>
    scene
      ? {
          number: scene.number,
          heading: scene.heading,
          description: scene.description ?? '',
          setting: scene.setting as string,
          timeOfDay: scene.timeOfDay as string,
          location: scene.location ?? '',
          characters: listToText(scene.characters),
          props: listToText(scene.props),
          wardrobe: listToText(scene.wardrobe),
          equipment: listToText(scene.equipment),
          requirements: scene.requirements ?? '',
          estimatedMinutes: String(scene.estimatedMinutes),
          notes: scene.notes ?? '',
          shootId: scene.shoot?.id ?? '',
          shootDate: scene.shootDate?.slice(0, 10) ?? '',
          plannedStart: scene.plannedStart ?? '',
        }
      : empty,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onError = (e: { code: string; details?: unknown }) => {
    const f = fieldErrors(e);
    setErrors(f);
    return Object.keys(f).length > 0;
  };
  const body = () => ({
    ...v,
    ...(scene
      ? {
          shootId: v.shootId || null,
          shootDate: v.shootId && v.shootDate ? v.shootDate : null,
          plannedStart: v.plannedStart || null,
        }
      : { projectId, scriptId: scriptId ?? '' }),
  });
  const create = useApiMutation<ReturnType<typeof body>>('POST', '/scenes', {
    success: 'Scene added',
    onSuccess: () => onOpenChange(false),
    onError,
  });
  const update = useApiMutation<ReturnType<typeof body>>('PATCH', `/scenes/${scene?.id}`, {
    success: 'Scene saved',
    onSuccess: () => onOpenChange(false),
    onError,
  });
  const save = () => {
    const b = body();
    if (scene) update.mutate(b);
    else {
      // Scheduling is done after creation (it needs the scene to exist).
      const { shootId: _s, shootDate: _d, plannedStart: _p, ...rest } = b as Record<string, string>;
      create.mutate(rest as ReturnType<typeof body>);
    }
  };
  const set =
    (k: keyof typeof v) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV((x) => ({ ...x, [k]: e.target.value, ...(k === 'shootId' ? { shootDate: '' } : {}) }));
  const shoot = shoots.find((s) => s.id === v.shootId);
  const days = shoot ? shootDayKeys(shoot.startsAt, shoot.endsAt) : [];
  const pending = create.isPending || update.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={scene ? `Scene ${scene.number}` : 'Add a scene'}
      description="What must be in front of the camera, where, and when it is shot."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={save}>
            {scene ? 'Save scene' : 'Add scene'}
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="No." error={errors.number}>
          {(p) => <Input {...p} value={v.number} onChange={set('number')} />}
        </Field>
        <Field label="Heading" error={errors.heading} className="col-span-1 sm:col-span-3">
          {(p) => (
            <Input
              {...p}
              value={v.heading}
              onChange={set('heading')}
              placeholder="INT. KITCHEN - NIGHT"
            />
          )}
        </Field>
        <Field label="Setting" error={errors.setting}>
          {(p) => (
            <Select {...p} value={v.setting} onChange={set('setting')}>
              {SCENE_SETTINGS.map((x) => (
                <option key={x} value={x}>
                  {SCENE_SETTING_LABELS[x]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Time" error={errors.timeOfDay}>
          {(p) => (
            <Select {...p} value={v.timeOfDay} onChange={set('timeOfDay')}>
              {SCENE_TIMES.map((x) => (
                <option key={x} value={x}>
                  {titleCase(x)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Location" error={errors.location} className="col-span-2">
          {(p) => <Input {...p} value={v.location} onChange={set('location')} />}
        </Field>
        <Field label="Description" error={errors.description} className="col-span-2 sm:col-span-4">
          {(p) => <Textarea {...p} rows={2} value={v.description} onChange={set('description')} />}
        </Field>
        <Field
          label="Characters / artists"
          hint="Comma-separated"
          error={errors.characters}
          className="col-span-2"
        >
          {(p) => <Input {...p} value={v.characters} onChange={set('characters')} />}
        </Field>
        <Field label="Props" hint="Comma-separated" error={errors.props} className="col-span-2">
          {(p) => <Input {...p} value={v.props} onChange={set('props')} />}
        </Field>
        <Field label="Wardrobe" error={errors.wardrobe} className="col-span-2">
          {(p) => <Input {...p} value={v.wardrobe} onChange={set('wardrobe')} />}
        </Field>
        <Field label="Equipment" error={errors.equipment} className="col-span-2">
          {(p) => <Input {...p} value={v.equipment} onChange={set('equipment')} />}
        </Field>
        <Field
          label="Shooting requirements"
          error={errors.requirements}
          className="col-span-2 sm:col-span-3"
        >
          {(p) => <Input {...p} value={v.requirements} onChange={set('requirements')} />}
        </Field>
        <Field label="Est. minutes" error={errors.estimatedMinutes}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={v.estimatedMinutes}
              onChange={set('estimatedMinutes')}
            />
          )}
        </Field>
        {scene ? (
          <>
            <Field label="Shoot" error={errors.shootId} className="col-span-2">
              {(p) => (
                <Select {...p} value={v.shootId} onChange={set('shootId')}>
                  <option value="">Not scheduled</option>
                  {shoots
                    .filter((s) => s.status !== 'CANCELLED')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} · {dayLabel(s.startsAt.slice(0, 10))}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Shoot day" error={errors.shootDate}>
              {(p) => (
                <Select {...p} value={v.shootDate} disabled={!shoot} onChange={set('shootDate')}>
                  <option value="">First day</option>
                  {days.map((d, i) => (
                    <option key={d} value={d}>
                      Day {i + 1} · {dayLabel(d)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Planned start" error={errors.plannedStart}>
              {(p) => (
                <Input
                  {...p}
                  type="time"
                  disabled={!shoot}
                  value={v.plannedStart}
                  onChange={set('plannedStart')}
                />
              )}
            </Field>
          </>
        ) : null}
        <Field label="Notes" error={errors.notes} className="col-span-2 sm:col-span-4">
          {(p) => <Textarea {...p} rows={2} value={v.notes} onChange={set('notes')} />}
        </Field>
      </form>
    </Dialog>
  );
}
