/**
 * DEMONSTRATION DATA for the production-studio layer: an artist roster, creative documents with
 * versions and scene breakdowns, artist bookings, shoot-day details, budget plans, post-production
 * assignments and a few prepared client messages. Every person and company is fictional.
 *
 * Runs after the core and ERP seeds and builds on the projects, shoots and team they created.
 */
import { breakdownScript, DEFAULT_SHOOT_CHECKLIST, shootDayKeys, istDayKey } from '@nova/shared';
import type { Database } from '../database';
import type { BudgetGroup, ScriptStatus, CreativeKind } from '../models/enums';
import type { Project, Shoot, TeamMember } from '../models/types';

const DAY = 24 * 3600 * 1000;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

const TALENT = [
  {
    name: 'Meera Krishnan',
    kind: 'ACTOR',
    skills: ['Drama', 'Emotional scenes', 'Nurse', 'Mother', 'Malayalam dialogue'],
    languages: ['Malayalam', 'English', 'Tamil'],
    ages: [28, 40],
    exp: 9,
    city: 'Kozhikode',
    rate: 18000,
  },
  {
    name: 'Faisal Rahman',
    kind: 'ACTOR',
    skills: ['Comedy', 'Father', 'Doctor', 'Corporate presenter'],
    languages: ['Malayalam', 'English', 'Hindi'],
    ages: [35, 50],
    exp: 12,
    city: 'Kochi',
    rate: 22000,
  },
  {
    name: 'Ananya Iyer',
    kind: 'MODEL',
    skills: ['Fashion', 'Saree draping', 'Runway', 'Hand model'],
    languages: ['Tamil', 'English'],
    ages: [20, 30],
    exp: 5,
    city: 'Chennai',
    rate: 15000,
  },
  {
    name: 'Rahul Varghese',
    kind: 'ACTOR',
    skills: ['Engineer', 'Young professional', 'Interview', 'Bike riding'],
    languages: ['Malayalam', 'English'],
    ages: [24, 34],
    exp: 4,
    city: 'Kozhikode',
    rate: 12000,
  },
  {
    name: 'Lakshmi Narayanan',
    kind: 'ANCHOR',
    skills: ['Presenter', 'Host', 'Corporate', 'Teleprompter'],
    languages: ['Tamil', 'English', 'Hindi'],
    ages: [30, 45],
    exp: 11,
    city: 'Chennai',
    rate: 20000,
  },
  {
    name: 'Joseph Mathew',
    kind: 'VOICE_ARTIST',
    skills: ['Narration', 'Voice over', 'Warm baritone', 'Documentary'],
    languages: ['Malayalam', 'English'],
    ages: [40, 60],
    exp: 15,
    city: 'Kochi',
    rate: 9000,
  },
  {
    name: 'Sana Sheikh',
    kind: 'INFLUENCER',
    skills: ['Food', 'Lifestyle', 'Reels', 'Beach', 'Summer'],
    languages: ['English', 'Hindi', 'Malayalam'],
    ages: [21, 28],
    exp: 3,
    city: 'Kozhikode',
    rate: 14000,
  },
  {
    name: 'Devika Menon',
    kind: 'DANCER',
    skills: ['Contemporary', 'Bharatanatyam', 'Choreography', 'Reels'],
    languages: ['Malayalam', 'English'],
    ages: [19, 30],
    exp: 6,
    city: 'Kozhikode',
    rate: 11000,
  },
  {
    name: 'Karthik Raja',
    kind: 'ACTOR',
    skills: ['Traveller', 'Adventure', 'Couple', 'Monsoon', 'Swimming'],
    languages: ['Tamil', 'English'],
    ages: [26, 36],
    exp: 7,
    city: 'Chennai',
    rate: 16000,
  },
  {
    name: 'Nila Thomas',
    kind: 'ACTOR',
    skills: ['Traveller', 'Couple', 'Student', 'Natural performance'],
    languages: ['Malayalam', 'English'],
    ages: [22, 32],
    exp: 4,
    city: 'Kozhikode',
    rate: 13000,
  },
  {
    name: 'Aarav Pillai',
    kind: 'CHILD_ARTIST',
    skills: ['Son', 'School kid', 'Natural performance'],
    languages: ['Malayalam', 'English'],
    ages: [8, 12],
    exp: 2,
    city: 'Kozhikode',
    rate: 6000,
  },
  {
    name: 'Gopal Weaver',
    kind: 'OTHER',
    skills: ['Handloom weaver', 'Artisan', 'Real person'],
    languages: ['Malayalam'],
    ages: [50, 70],
    exp: 1,
    city: 'Kozhikode',
    rate: 4000,
    travel: false,
  },
  {
    name: 'Priya Subramaniam',
    kind: 'MODEL',
    skills: ['Hand model', 'Product', 'Earbuds', 'Macro close-ups'],
    languages: ['Tamil', 'English'],
    ages: [22, 35],
    exp: 6,
    city: 'Chennai',
    rate: 10000,
  },
  {
    name: 'Irfan Ali',
    kind: 'ACTOR',
    skills: ['Patient', 'Elderly', 'Grandfather', 'Emotional scenes'],
    languages: ['Malayalam', 'Hindi'],
    ages: [60, 75],
    exp: 20,
    city: 'Kozhikode',
    rate: 15000,
  },
] as const;

/** Scripts per project tag: kind, title, status, body. */
const SCRIPTS: Record<
  string,
  {
    kind: CreativeKind;
    title: string;
    status: ScriptStatus;
    versions: number;
    body: string;
    instructions?: string;
  }[]
> = {
  'carefirst-ad': [
    {
      kind: 'BRIEF',
      title: 'A Day of Care — client brief',
      status: 'APPROVED',
      versions: 1,
      body: 'Objective: show CareFirst nurses as calm, skilled and human.\nAudience: families choosing a clinic.\nTone: warm, observational, no stock-hospital clichés.\nMust have: the CareFirst teal uniform, real clinic interiors, a patient moment of trust.\nLength: 60s hero, 15s cut-down.',
    },
    {
      kind: 'SCRIPT',
      title: 'A Day of Care',
      status: 'APPROVED',
      versions: 3,
      instructions: 'Keep the clinic logo visible but never centred. No needles on screen.',
      body: `1. INT. NURSE'S HOME - DAWN
MEERA (34) ties her hair and checks her PHONE. A cup of TEA goes cold on the table.

MEERA
Another day.

2. EXT. CAREFIRST CLINIC - MORNING
Meera walks in through the main gate. Tracking shot as she greets the guard.

3. INT. CLINIC WARD - DAY
Meera checks on an elderly patient, IRFAN (68). She adjusts his BLANKET and shares a joke.

IRFAN
You remember everything.

MEERA
That's the job.

4. INT. CLINIC CORRIDOR - NIGHT
The ward is quiet. Meera writes in a CHART. Slow motion as she finally sits down.

5. EXT. CLINIC ROOFTOP - DUSK
Meera looks over the city. Super: "CareFirst. Care, every hour."`,
    },
  ],
  'neotech-corp': [
    {
      kind: 'SCRIPT',
      title: 'Building Tomorrow — interview plan',
      status: 'APPROVED',
      versions: 2,
      body: `1. INT. NEOTECH LOBBY - DAY
LAKSHMI (36), our presenter, walks to camera through the lobby.

LAKSHMI
At NeoTech, tomorrow is built by people.

2. INT. ENGINEERING FLOOR - DAY
Tracking shot along the desks. RAHUL (28) works on a LAPTOP with two monitors.

3. INT. MEETING ROOM - DAY
Interview: the CTO talks to camera about engineering culture. Lavalier mics, two cameras.

4. EXT. CAMPUS GARDEN - DAY
Team lunch, natural light. Aerial establishing shot of the campus.`,
    },
  ],
  'vibe-reels': [
    {
      kind: 'SCRIPT',
      title: 'Summer Reels — six beats',
      status: 'IN_REVIEW',
      versions: 2,
      instructions:
        'Every reel opens on the can within the first second. Hindi + English captions.',
      body: `1. EXT. KOZHIKODE BEACH - DAY
SANA (24) cracks open a can of VIBE. Slow motion splash. Music: upbeat track.

2. EXT. BEACH PROMENADE - DAY
DEVIKA (22) dances along the promenade; tracking shot. Playback speaker.

3. EXT. BEACH SHACK - SUNSET
Sana and Devika share the COOLER. Golden hour backlight.`,
    },
  ],
  'malabar-skyline': [
    {
      kind: 'SCRIPT',
      title: 'Skyline Residences — launch film',
      status: 'APPROVED',
      versions: 1,
      body: `1. EXT. RIVERSIDE SITE - DAWN
Aerial drone reveal over the river to the tower. No people.

2. EXT. TOWER TERRACE - DUSK
FAISAL (42) and his family on the terrace. AARAV (10) points at the river.

FAISAL
That's where we'll watch the boats.

3. INT. SHOW APARTMENT - DAY
Gimbal walkthrough of the living room; natural light, no people.`,
    },
  ],
  'coastline-ad': [
    {
      kind: 'BRIEF',
      title: 'Monsoon Escape — creative brief',
      status: 'DRAFT',
      versions: 1,
      body: 'Objective: sell monsoon packages to young couples from Bengaluru and Chennai.\nIdea: slow travel in the rain — books, chai, the sound of rain on a tiled roof.\nDeliverables: 45s film, three 15s reels.\nOpen question: real rain or rain machine?',
    },
    {
      kind: 'SCRIPT',
      title: 'Monsoon Escape',
      status: 'CHANGES_REQUESTED',
      versions: 1,
      instructions: 'Client wants less dialogue and more ambient sound.',
      body: `1. EXT. RESORT ENTRANCE - DAY
KARTHIK (30) and NILA (27) run in from the rain under one UMBRELLA. Rain machine.

KARTHIK
We should have checked the forecast.

NILA
I did.

2. INT. RESORT VERANDA - DAY
They read BOOKs while rain falls on the tiled roof. Macro on raindrops.

3. EXT. BEACH - DUSK
They walk barefoot in the drizzle. Drone top shot.`,
    },
  ],
  'brightpath-stories': [
    {
      kind: 'SCRIPT',
      title: 'Campus Stories — episode outline',
      status: 'APPROVED',
      versions: 2,
      body: `Scene 1: Morning assembly
Students arrive; RAHUL (26), the mentor, greets them. Tracking shot through the gate.

Scene 2: The lab
Interview with a student at the robotics bench. Lavalier mics.

Scene 3: Library at dusk
Quiet montage, slow motion page turns.`,
    },
  ],
  'aurora-film': [
    {
      kind: 'SCRIPT',
      title: 'Woven Light',
      status: 'APPROVED',
      versions: 4,
      body: `1. EXT. WEAVERS' VILLAGE - DAWN
Mist over the paddy fields. Aerial drone reveal of the village.

2. INT. HANDLOOM UNIT - DAY
GOPAL (62) works the LOOM. Macro on THREAD and hands.

3. EXT. VILLAGE LANE - DAY
ANANYA (24) walks in a handloom SAREE; tracking shot.`,
    },
  ],
  'zenpods-hero': [
    {
      kind: 'SHOT_LIST',
      title: 'Feel the Sound — macro shot list',
      status: 'APPROVED',
      versions: 1,
      body: `1. INT. STUDIO TABLE - DAY\nPRIYA (28) hand model lifts the EARBUDS case. Macro, slow motion.\n\n2. INT. STUDIO TABLE - NIGHT\nEarbuds glow in the dark; light painting.`,
    },
  ],
};

export async function buildStudioWorld(
  db: Database,
  users: { adminId: string; producerUserId: string; creativeUserId: string },
): Promise<Record<string, number>> {
  const m = db.models;
  const projects = await m.Project.find().lean<Project[]>();
  const byCode = new Map<string, Project>();
  // Project tags are not stored: match on title, as the fixtures define them.
  const TITLE_TAG: Record<string, string> = {
    'A Day of Care': 'carefirst-ad',
    'Building Tomorrow': 'neotech-corp',
    'Summer Reels': 'vibe-reels',
    'Skyline Residences': 'malabar-skyline',
    'Monsoon Escape': 'coastline-ad',
    'Campus Stories': 'brightpath-stories',
    'Woven Light': 'aurora-film',
    'Feel the Sound': 'zenpods-hero',
  };
  for (const p of projects) if (TITLE_TAG[p.title]) byCode.set(TITLE_TAG[p.title]!, p);
  const members = await m.TeamMember.find().lean<TeamMember[]>();
  const memberBy = (re: RegExp) => members.find((x) => re.test(x.title));
  const producer = memberBy(/producer/i) ?? members[0]!;
  const editor = memberBy(/editor/i);
  const colourist = memberBy(/colou?rist/i);
  const motion = memberBy(/motion/i);

  // ── Artists ─────────────────────────────────────────────────────────────────
  const talent = await m.Talent.insertMany(
    TALENT.map((t, i) => ({
      name: t.name,
      kind: t.kind,
      email: `${t.name.split(' ')[0]!.toLowerCase()}@talent.example`,
      phone: `+91 90000 ${String(10000 + i * 137).slice(0, 5)}`,
      agency: i % 3 === 0 ? 'Malabar Talent Co. (demo)' : null,
      skills: [...t.skills],
      languages: [...t.languages],
      playingAgeMin: t.ages[0],
      playingAgeMax: t.ages[1],
      experienceYears: t.exp,
      baseCity: t.city,
      willTravel: 'travel' in t ? t.travel : true,
      dayRate: t.rate,
      portfolioUrl: `https://portfolio.example/${t.name.toLowerCase().replace(/\s+/g, '-')}`,
      notes: 'Demo profile — fictional artist.',
      unavailable:
        t.name === 'Karthik Raja'
          ? [
              {
                from: new Date(now.getTime() + 2 * DAY),
                to: new Date(now.getTime() + 4 * DAY),
                reason: 'Another production (demo)',
              },
            ]
          : [],
    })),
  );
  const talentByFirst = new Map(talent.map((t) => [t.name.split(' ')[0]!.toUpperCase(), t]));

  // ── Shoot-day details ───────────────────────────────────────────────────────
  const shoots = await m.Shoot.find().sort({ startsAt: 1 }).lean<Shoot[]>();
  for (const s of shoots) {
    const past = s.endsAt < now;
    const soon = s.startsAt.getTime() - now.getTime() < 4 * DAY;
    await m.Shoot.updateOne(
      { _id: s._id },
      {
        $set: {
          productionManagerId: producer._id,
          crewCallTime: s.callTime ? shiftTime(s.callTime, -30) : '07:00',
          callSheetNotes:
            'Parking at the rear gate. Nearest hospital: listed on the printed sheet (demo). Carry ID.',
          callSheetPublishedAt:
            past || (soon && s.status === 'CONFIRMED') ? daysAgo(past ? 14 : 1) : null,
          checklist: DEFAULT_SHOOT_CHECKLIST.map((label, i) => ({
            label,
            done: past || (soon && i < 4),
            doneAt: past ? s.startsAt : null,
            doneBy: past ? 'Karthik Subramanian' : null,
          })),
          footageStatus: past ? (s.endsAt < daysAgo(10) ? 'WITH_EDITOR' : 'BACKED_UP') : 'PENDING',
          startedAt: past ? s.startsAt : null,
          wrappedAt: past ? s.endsAt : null,
          wrapNotes: past
            ? 'All planned scenes covered. Footage backed up to two drives (demo).'
            : null,
        },
      },
    );
  }

  // ── Creative documents and scenes ───────────────────────────────────────────
  let scriptCount = 0;
  let sceneCount = 0;
  const characterNeeds: { shootId: string; character: string }[] = [];
  for (const [tag, docs] of Object.entries(SCRIPTS)) {
    const project = byCode.get(tag);
    if (!project) continue;
    const projectShoots = shoots.filter(
      (s) => s.projectId === project._id && s.status !== 'CANCELLED',
    );
    let order = 1;
    for (const d of docs) {
      const submittedAt =
        d.status === 'IN_REVIEW' ? daysAgo(3) : d.status === 'DRAFT' ? null : daysAgo(12);
      const script = await m.Script.create({
        projectId: project._id,
        kind: d.kind,
        title: d.title,
        status: d.status,
        currentVersion: d.versions,
        clientInstructions: d.instructions ?? null,
        notes: null,
        submittedAt,
        decidedAt: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(d.status)
          ? daysAgo(9)
          : null,
        decidedBy: ['APPROVED', 'CHANGES_REQUESTED'].includes(d.status) ? 'Client (demo)' : null,
        decisionNote:
          d.status === 'CHANGES_REQUESTED' ? 'Less dialogue, more ambient sound in scene 1.' : null,
        createdById: users.creativeUserId,
        createdAt: daysAgo(20),
      });
      scriptCount++;
      for (let v = 1; v <= d.versions; v++) {
        await m.ScriptVersion.create({
          scriptId: script._id,
          number: v,
          body: v === d.versions ? d.body : `${d.body}\n\n(Earlier draft v${v}.)`,
          changeNote: v === 1 ? 'First draft' : `Revisions after review round ${v - 1}`,
          authorId: users.creativeUserId,
          createdAt: daysAgo(20 - v * 2),
        });
      }
      if (d.kind !== 'SCRIPT' && d.kind !== 'SHOT_LIST') continue;
      const result = breakdownScript(d.body);
      for (const [i, sc] of result.scenes.entries()) {
        // Spread the scenes over the project's shoots and their days.
        const shoot = projectShoots.length
          ? projectShoots[
              Math.min(
                projectShoots.length - 1,
                Math.floor((i * projectShoots.length) / result.scenes.length),
              )
            ]
          : null;
        const days = shoot ? shootDayKeys(shoot.startsAt, shoot.endsAt) : [];
        const dayKey = days.length ? days[i % days.length]! : null;
        const shot = !!shoot && (shoot.endsAt < now || (shoot.startsAt < now && i === 0));
        await m.Scene.create({
          projectId: project._id,
          scriptId: script._id,
          ...sc,
          sortOrder: order++,
          shootId: shoot?._id ?? null,
          shootDate: dayKey ? new Date(`${dayKey}T00:00:00.000Z`) : null,
          plannedStart: shoot ? shiftTime(shoot.callTime ?? '08:00', 60 + i * 90) : null,
          status: shot ? 'SHOT' : shoot ? 'SCHEDULED' : 'PLANNED',
          completedAt: shot ? shoot.startsAt : null,
          source: 'RULE_BASED',
          notes:
            i === 0 ? 'Breakdown generated by the rule-based parser, then reviewed (demo).' : null,
        });
        sceneCount++;
        if (shoot)
          for (const c of sc.characters) characterNeeds.push({ shootId: shoot._id, character: c });
      }
    }
  }

  // ── Artist bookings (one per character per shoot) ───────────────────────────
  let bookings = 0;
  const seen = new Set<string>();
  for (const need of characterNeeds) {
    const t = talentByFirst.get(need.character.split(' ')[0]!.toUpperCase());
    const key = `${need.shootId}:${t?._id}`;
    if (!t || seen.has(key)) continue;
    seen.add(key);
    const shoot = shoots.find((s) => s._id === need.shootId)!;
    // Planned shoots keep a hold; confirmed and past shoots are confirmed.
    await m.TalentBooking.create({
      talentId: t._id,
      shootId: need.shootId,
      character: need.character,
      status: shoot.status === 'PLANNED' ? 'HOLD' : 'CONFIRMED',
      fee: t.dayRate * shootDayKeys(shoot.startsAt, shoot.endsAt).length,
      note: null,
    });
    bookings++;
  }

  // ── Shoot log for today's and past shoots ───────────────────────────────────
  const today = istDayKey(now);
  for (const s of shoots) {
    const isToday = shootDayKeys(s.startsAt, s.endsAt).includes(today);
    if (!isToday && s.endsAt > now) continue;
    await m.ShootLogEntry.insertMany([
      {
        shootId: s._id,
        kind: 'NOTE',
        body: 'Crew call on time; safety briefing done.',
        authorId: users.producerUserId,
        createdAt: s.startsAt,
      },
      ...(isToday
        ? [
            {
              shootId: s._id,
              kind: 'DELAY',
              body: 'Location power delayed the first setup.',
              minutesLost: 25,
              authorId: users.producerUserId,
              createdAt: new Date(Math.min(now.getTime(), s.startsAt.getTime() + 2 * 3600 * 1000)),
            },
            {
              shootId: s._id,
              kind: 'ISSUE',
              body: 'Ward B unavailable after 3 pm — move scene 4 earlier or to Ward C.',
              authorId: users.producerUserId,
              createdAt: new Date(Math.min(now.getTime(), s.startsAt.getTime() + 3 * 3600 * 1000)),
            },
          ]
        : []),
    ]);
  }

  // ── Budget plans (estimates ~75% of contract value) ─────────────────────────
  const SPLIT: [BudgetGroup, string, number][] = [
    ['CREW', 'Crew day rates', 0.25],
    ['ARTIST', 'Artist fees', 0.12],
    ['EQUIPMENT', 'Equipment rental and insurance', 0.12],
    ['PRODUCTION', 'Locations, travel and catering', 0.11],
    ['POST_PRODUCTION', 'Edit, grade, sound and music', 0.12],
    ['OTHER', 'Contingency', 0.03],
  ];
  let lines = 0;
  for (const p of projects.filter((x) => x.status !== 'CANCELLED')) {
    await m.BudgetLine.insertMany(
      SPLIT.map(([group, label, share]) => ({
        projectId: p._id,
        group,
        label,
        estimated: Math.round((p.budget * share) / 1000) * 1000,
        note: 'Demo estimate',
      })),
    );
    lines += SPLIT.length;
  }

  // ── Post-production: editors, progress, internal review, review deadlines ──
  const deliverables = await m.Deliverable.find().lean();
  const editors = [editor, colourist, motion].filter((x): x is TeamMember => !!x);
  for (const [i, d] of deliverables.entries()) {
    const ed = editors.length ? editors[i % editors.length]! : null;
    const progress =
      d.status === 'PLANNED' ? 0 : d.status === 'IN_PROGRESS' ? 35 + ((i * 17) % 55) : 100;
    await m.Deliverable.updateOne(
      { _id: d._id },
      {
        $set: {
          editorId: d.status === 'PLANNED' ? null : (ed?._id ?? null),
          editProgress: progress,
          internalReviewStatus:
            d.status === 'IN_PROGRESS'
              ? i % 3 === 0
                ? 'PENDING'
                : 'NOT_STARTED'
              : d.status === 'PLANNED'
                ? 'NOT_STARTED'
                : 'APPROVED',
          internalReviewedAt: ['IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'DELIVERED'].includes(
            d.status,
          )
            ? daysAgo(6)
            : null,
          internalReviewedBy: ['IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'DELIVERED'].includes(
            d.status,
          )
            ? 'Riya Menon'
            : null,
        },
      },
    );
  }
  const pending = await m.Approval.find({ status: 'PENDING' }).lean();
  for (const a of pending) {
    await m.Approval.updateOne(
      { _id: a._id },
      { $set: { dueAt: new Date(a.requestedAt.getTime() + 3 * DAY) } },
    );
  }

  // ── Prepared client messages (match the automation's dedupe keys) ───────────
  const clients = new Map((await m.Client.find().lean()).map((c) => [c._id, c]));
  const messages: Record<string, unknown>[] = [];
  for (const s of shoots.filter((x) => x.status === 'CONFIRMED' || x.endsAt < now)) {
    const p = projects.find((x) => x._id === s.projectId)!;
    const c = clients.get(p.clientId)!;
    const past = s.endsAt < now;
    messages.push({
      clientId: c._id,
      projectId: p._id,
      shootId: s._id,
      trigger: 'SHOOT_CONFIRMED',
      channel: 'EMAIL',
      recipientName: c.contactName ?? c.name,
      recipientAddress: c.contactEmail,
      subject: `Shoot confirmed: ${s.title} on ${s.startsAt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`,
      body: `Hi ${c.contactName ?? 'team'},\n\nThe shoot for ${p.title} is confirmed.\n\nShoot: ${s.title}\nCall time: ${s.callTime}\nLocation: ${s.location}\n\nRegards,\nKarthik Subramanian\nNeon Minds`,
      status: past ? 'SIMULATED' : 'DRAFT',
      sentAt: past ? new Date(s.startsAt.getTime() - 5 * DAY) : null,
      provider: past ? 'simulated' : null,
      statusNote: past
        ? 'No email provider is configured. Recorded as simulated — nothing left NOVA. (demo)'
        : 'Prepared automatically — review before sending.',
      dedupeKey: `SHOOT_CONFIRMED:${s._id}`,
      scheduleStamp: s.startsAt,
      createdById: null,
      createdAt: past ? new Date(s.startsAt.getTime() - 6 * DAY) : daysAgo(1),
    });
  }
  const vibe = byCode.get('vibe-reels');
  if (vibe) {
    const c = clients.get(vibe.clientId)!;
    messages.push({
      clientId: c._id,
      projectId: vibe._id,
      trigger: 'SCRIPT_REVIEW',
      channel: 'EMAIL',
      recipientName: c.contactName ?? c.name,
      recipientAddress: c.contactEmail,
      subject: 'Script for your review: Summer Reels — six beats (v2)',
      body: `Hi ${c.contactName ?? 'team'},\n\nThe script “Summer Reels — six beats (v2)” for Summer Reels is ready for your review.\n\nRegards,\nArjun Nair\nNeon Minds`,
      status: 'SIMULATED',
      sentAt: daysAgo(3),
      provider: 'simulated',
      statusNote:
        'No email provider is configured. Recorded as simulated — nothing left NOVA. (demo)',
      createdById: users.creativeUserId,
      reviewedById: users.creativeUserId,
      createdAt: daysAgo(3),
    });
  }
  if (messages.length) await m.ClientMessage.insertMany(messages);

  return {
    talent: talent.length,
    scripts: scriptCount,
    scenes: sceneCount,
    talentBookings: bookings,
    budgetLines: lines,
    clientMessages: messages.length,
  };
}

function shiftTime(hhmm: string, minutes: number): string {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = Math.max(0, Math.min(23 * 60 + 59, h! * 60 + mm! + minutes));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
