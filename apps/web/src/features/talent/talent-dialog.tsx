'use client';

import { TALENT_KIND_LABELS, TALENT_KINDS, type TalentDetail } from '@nova/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { fieldErrors, listToText } from '@/features/studio/ui';
import type { ApiRequestError } from '@/lib/api';
import { useApiMutation } from '@/lib/mutations';
import { useWorkspace } from '@/store/workspace';

const blank = {
  name: '',
  kind: 'ACTOR' as string,
  email: '',
  phone: '',
  agency: '',
  skills: '',
  languages: '',
  playingAgeMin: '',
  playingAgeMax: '',
  experienceYears: '0',
  baseCity: 'Kozhikode',
  willTravel: true,
  dayRate: '',
  portfolioUrl: '',
  notes: '',
};

/** Create or edit an artist profile. Field errors from the API appear next to their field. */
type TalentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talent?: TalentDetail;
};

export function TalentDialog(props: TalentDialogProps) {
  // Mounted only while open, so the form starts fresh every time.
  return props.open ? <TalentForm {...props} /> : null;
}

function initial(talent?: TalentDetail) {
  return talent
    ? {
        name: talent.name,
        kind: talent.kind as string,
        email: talent.email ?? '',
        phone: talent.phone ?? '',
        agency: talent.agency ?? '',
        skills: listToText(talent.skills),
        languages: listToText(talent.languages),
        playingAgeMin: talent.playingAgeMin?.toString() ?? '',
        playingAgeMax: talent.playingAgeMax?.toString() ?? '',
        experienceYears: String(talent.experienceYears),
        baseCity: talent.baseCity,
        willTravel: talent.willTravel,
        dayRate: String(talent.dayRate),
        portfolioUrl: talent.portfolioUrl ?? '',
        notes: talent.notes ?? '',
      }
    : blank;
}

function TalentForm({ open, onOpenChange, talent }: TalentDialogProps) {
  const inspect = useWorkspace((s) => s.inspect);
  const [v, setV] = useState(() => initial(talent));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onError = (e: ApiRequestError) => {
    const fields = fieldErrors(e);
    setErrors(fields);
    return Object.keys(fields).length > 0;
  };
  const create = useApiMutation<typeof v, TalentDetail>('POST', '/talent', {
    success: (t) => `${t.name} added to the roster`,
    onSuccess: (t) => {
      onOpenChange(false);
      inspect({ type: 'talent', id: t.id });
    },
    onError,
  });
  const update = useApiMutation<typeof v, TalentDetail>('PATCH', `/talent/${talent?.id}`, {
    success: 'Profile updated',
    onSuccess: () => onOpenChange(false),
    onError,
  });
  const m = talent ? update : create;
  const set =
    (k: keyof typeof v) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={talent ? `Edit ${talent.name}` : 'Add an artist'}
      description="Contact details, casting profile, availability and day rate."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate(v)}>
            {talent ? 'Save' : 'Add artist'}
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate(v);
        }}
      >
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} value={v.name} onChange={set('name')} autoFocus />}
        </Field>
        <Field label="Profile type" error={errors.kind}>
          {(p) => (
            <Select {...p} value={v.kind} onChange={set('kind')}>
              {TALENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TALENT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" value={v.email} onChange={set('email')} />}
        </Field>
        <Field label="Phone" error={errors.phone}>
          {(p) => <Input {...p} type="tel" value={v.phone} onChange={set('phone')} />}
        </Field>
        <Field
          label="Skills"
          hint="Comma-separated, e.g. Drama, Dance, Malayalam dialogue"
          error={errors.skills}
          className="sm:col-span-2"
        >
          {(p) => <Input {...p} value={v.skills} onChange={set('skills')} />}
        </Field>
        <Field label="Languages" hint="Comma-separated" error={errors.languages}>
          {(p) => <Input {...p} value={v.languages} onChange={set('languages')} />}
        </Field>
        <Field label="Agency" error={errors.agency}>
          {(p) => <Input {...p} value={v.agency} onChange={set('agency')} />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Plays age from" error={errors.playingAgeMin}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={99}
                value={v.playingAgeMin}
                onChange={set('playingAgeMin')}
              />
            )}
          </Field>
          <Field label="to" error={errors.playingAgeMax}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={99}
                value={v.playingAgeMax}
                onChange={set('playingAgeMax')}
              />
            )}
          </Field>
        </div>
        <Field label="Experience (years)" error={errors.experienceYears}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={70}
              value={v.experienceYears}
              onChange={set('experienceYears')}
            />
          )}
        </Field>
        <Field label="Base city" error={errors.baseCity}>
          {(p) => <Input {...p} value={v.baseCity} onChange={set('baseCity')} />}
        </Field>
        <Field label="Day rate (₹)" error={errors.dayRate}>
          {(p) => (
            <Input {...p} type="number" min={0} value={v.dayRate} onChange={set('dayRate')} />
          )}
        </Field>
        <Field label="Portfolio link" error={errors.portfolioUrl}>
          {(p) => (
            <Input
              {...p}
              type="url"
              placeholder="https://"
              value={v.portfolioUrl}
              onChange={set('portfolioUrl')}
            />
          )}
        </Field>
        <div className="flex items-end pb-1">
          <Checkbox
            label="Travels for shoots"
            checked={v.willTravel}
            onChange={(e) => setV((x) => ({ ...x, willTravel: e.target.checked }))}
          />
        </div>
        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
          {(p) => <Textarea {...p} value={v.notes} onChange={set('notes')} />}
        </Field>
      </form>
    </Dialog>
  );
}
